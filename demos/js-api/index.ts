import { DistanceFieldGenerator } from "../../src/gpu-distance-field";

// Returns the distance from a particular coordinate on the canvas to
// the nearest shape, as determined by the distance field.
//
// `pixels` is the output of calling `DistanceFieldGenerator.getPixels()`.
function getDistanceFromPixels(
  pixels: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  x: number,
  y: number
) {
  // In WebGL the y-coordinate increases as you go up on your screen and
  // in the DOM the y-coordinate decreases as you go up on your screen.
  // `pixels` came right out of a WebGL texture, we need to flip it.
  const flippedY = canvasHeight - y;

  // `pixels` is an array of r, g, b, a values between 0 and 255. Figure
  // out the index of the red value in the pixel we want.
  const BYTES_PER_PIXEL = 4;
  const pixelsPerRow = canvasWidth * BYTES_PER_PIXEL;
  const redPixelIndex = flippedY * pixelsPerRow + x * BYTES_PER_PIXEL;

  // Pull out the values of the red pixel, along with green and blue.
  // alpha isn't used.
  const r = pixels[redPixelIndex];
  const g = pixels[redPixelIndex + 1];
  const b = pixels[redPixelIndex + 2];

  // The rgb values of each pixel store the distance as
  // a base 255 number added to BASE ^ 3 / 2 and multiplied
  // by 1000.
  const BASE = 255;
  const BASE_2 = BASE * BASE;
  const BASE_3 = BASE_2 * BASE;
  return (r * BASE_2 + g * BASE + b - BASE_3 / 2) / 1000;
}

// Global state
let lastMouse: [number, number] | null = null;
let mouseDown = false;
let textOffset = [0, 0];
let generator: DistanceFieldGenerator;
let sourceCanvas: HTMLCanvasElement;
let destCanvas: HTMLCanvasElement;

document.addEventListener("DOMContentLoaded", () => {
  sourceCanvas = document.getElementById("source-canvas") as HTMLCanvasElement;
  resizeCanvasToCSSSize(sourceCanvas);

  destCanvas = document.getElementById(
    "distance-field-canvas"
  ) as HTMLCanvasElement;
  resizeCanvasToCSSSize(destCanvas);

  // Bind event handlers
  sourceCanvas.addEventListener("mousedown", sourceCanvasMouseDown);
  sourceCanvas.addEventListener("mousemove", sourceCanvasMouseMove);
  sourceCanvas.addEventListener("mouseup", sourceCanvasMouseUp);

  destCanvas.addEventListener("mousemove", destCanvasMouseMove);

  generator = new DistanceFieldGenerator({
    outputCanvas: destCanvas,
  });

  // On each animation frame, generate a distance field of whatever
  // is in source-canvas and store it in the distance-field canvas.
  const onFrame = () => {
    drawText(sourceCanvas);
    generator.generateDistanceField(sourceCanvas, "JFA");
    requestAnimationFrame(onFrame);
  };
  onFrame();
});

// Drawing
//////////////////////////////////////////////////////////////////////

function drawText(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "black";
  ctx.font = "400px san-serif";

  let [x, y] = textOffset;
  x -= canvas.width / 2;
  y += canvas.height / 2;

  ctx.fillText("abcdef", x, y);
}

// Event handlers
//////////////////////////////////////////////////////////////////////

function sourceCanvasMouseDown(e: MouseEvent) {
  mouseDown = true;
  lastMouse = [e.offsetX, e.offsetY];
}

function sourceCanvasMouseMove(e: MouseEvent) {
  if (mouseDown && lastMouse != null) {
    const deltaX = e.offsetX - lastMouse[0];
    const deltaY = e.offsetY - lastMouse[1];
    textOffset[0] += deltaX;
    textOffset[1] += deltaY;
  }

  lastMouse = [e.offsetX, e.offsetY];
}

function sourceCanvasMouseUp(e: MouseEvent) {
  mouseDown = false;
  lastMouse = [e.offsetX, e.offsetY];
}

function destCanvasMouseMove(e: MouseEvent) {
  const pixels = generator.getPixels();
  const distance = getDistanceFromPixels(
    pixels,
    destCanvas.width,
    destCanvas.height,
    e.offsetX,
    e.offsetY
  );
  const elt = document.getElementById("distance-label")! as HTMLDivElement;
  elt.innerText = `Distance to nearest shape: ${distance | 0}px`;
}

//////////////////////////////////////////////////////////////////////

// Resizes the backing store of a canvas to match its size in CSS
function resizeCanvasToCSSSize(canvas: HTMLCanvasElement) {
  const box = canvas.getBoundingClientRect();
  canvas.width = box.width;
  canvas.height = box.height;
}
