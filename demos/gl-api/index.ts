import { DistanceFieldGenerator } from "../../src/gpu-distance-field";

import Regl from "regl";

function redrawSourceCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): HTMLCanvasElement {
  if (canvas.width != width || canvas.height != height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#000";

  const x = width / 2;
  const y = height / 2;
  ctx.font = "100px Helvetica";
  ctx.fillText("m", x, y);

  return canvas;
}

document.addEventListener("DOMContentLoaded", () => {
  const sourceCanvas = document.createElement("canvas") as HTMLCanvasElement;
  redrawSourceCanvas(sourceCanvas, window.innerWidth, window.innerHeight);

  const distanceFieldGenerator = new DistanceFieldGenerator();
  distanceFieldGenerator.generateDistanceField(sourceCanvas);

  const regl = Regl(document.body);
  const texture = regl.texture({
    data: distanceFieldGenerator.outputCanvas(),
    min: "linear",
    mag: "linear",
  });

  const command = regl({
    // In a draw call, we can pass the shader source code to regl
    frag: `
    precision mediump float;
    uniform sampler2D uTexture;
    varying vec2 vUv;

    const float BASE = 255.;
    const float BASE_2 = BASE * BASE;
    const float BASE_3 = BASE * BASE * BASE;
    float getDistanceValue(in vec2 uv) {
      vec4 value = texture2D(uTexture, uv) * BASE;
      return ((value.x * BASE_2 + value.y * BASE + value.z) - (BASE_3 / 2.)) / 1024.;
    }

    void main () {
      float distance = getDistanceValue(vUv);
      float value = clamp(distance, -.5, .5) + .5;
      gl_FragColor = vec4(vec3(value), 1.);
    }`,

    vert: `
    precision mediump float;
    attribute vec2 position;
    varying vec2 vUv;
    void main () {
      vUv = (position + 1.) / 2.;
      vUv.y = 1.0 - vUv.y;
      gl_Position = vec4(position, 0, 1);
    }`,

    attributes: {
      position: [
        [-1, -1],
        [-1, 1],
        [1, 1],

        [1, 1],
        [1, -1],
        [-1, -1],
      ],
    },

    uniforms: {
      uTexture: texture,
    },

    count: 6,
  });

  const onFrame = () => {
    command();
    requestAnimationFrame(onFrame);
  };
  onFrame();
});
