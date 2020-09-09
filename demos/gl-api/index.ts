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

  const fontSize = (window.innerWidth / 1.3) | 0;
  ctx.font = `small-caps bold ${fontSize}px serif`;
  const size = ctx.measureText("M");
  const x = width / 2 - size.width / 3;
  const y = height / 2 + fontSize / 4;
  ctx.fillText("m", x, y);
  return canvas;
}

document.addEventListener("DOMContentLoaded", () => {
  const sourceCanvas = document.createElement("canvas") as HTMLCanvasElement;
  redrawSourceCanvas(sourceCanvas, window.innerWidth, window.innerHeight);

  const distanceFieldGenerator = new DistanceFieldGenerator();
  distanceFieldGenerator.generateSDF(sourceCanvas, "JFA+2");

  const regl = Regl(document.body);
  const texture = regl.texture({
    data: distanceFieldGenerator.outputCanvas(),
    min: "linear",
    mag: "linear",
  });

  let progress = 0;
  let animationInProgress = false;
  const animationDurationSeconds = 3;
  const delayBetweenAnimationsSeconds = 1;

  const command = regl({
    // In a draw call, we can pass the shader source code to regl
    frag: `
    precision mediump float;
    uniform sampler2D uTexture;
    varying vec2 vUv;
    uniform float uProgress;

    const float BASE = 255.;
    const float BASE_2 = BASE * BASE;
    const float BASE_3 = BASE * BASE * BASE;
    float getDistanceValue(in vec2 uv) {
      vec4 value = texture2D(uTexture, uv) * BASE;
      return ((value.x * BASE_2 + value.y * BASE + value.z) - (BASE_3 / 2.)) / 1000.;
    }

    // Apply darken blend mode to the specified colors
    float blendDarken(float a, float b) {
      return min(a, b);
    }

    // From here: https://github.com/glslify/glsl-easings/blob/master/sine-in-out.glsl
    float easing(float t) {
      const float PI = 3.141592653589793;
      return -0.5 * (cos(PI * t) - 1.0);
    }

    void main () {
      // Start by drawing the glyph. If all we wanted to do was
      // put the glyph on screen, we could set gl_FragColor to
      // vec4(vec3(dist), 1.) and return early.
      float dist = getDistanceValue(vUv);
      float value = clamp(dist, - .5, .5) + .5;

      // Draw fives lines, emitted from the glyph with different easing
      // functions. Each line has its own progress derived from uProgress.
      // Here are the start and end points of each individual line...
      //
      // line 1: (0, .6)
      // line 2: (0.1, .7)
      // line 3: (0.2, .8)
      // line 4: (0.3, .9)
      // line 5: (0.4, 1.)
      //
      for (int i = 0; i < 5; i++) {
        // Calculate the start and end point for this line
        float start = float(i) / 10.;
        float end = 1. - (.4 - start);
        float duration = end - start;

        // Figure out the un-eased progress for this line
        float lineProgress = (clamp(uProgress, start, end) - start) / duration;

        // Ease it
        float easedProgress = easing(lineProgress);

        // We'd like to draw the line at a distance 100px * easedProgress
        // away from the glyph
        float drawLineAtDistance = easedProgress * 100.;

        // The lines are 2px thick. If we're not careful, we'll draw them even
        // when they're really close to the glyph which will make the edges of
        // the glyph look fuzzy.
        if (drawLineAtDistance < .1) {
          continue;
        }

        float lineThickness = 2.;
        float lineValue = distance(dist, drawLineAtDistance) / lineThickness;

        // Fade lines out as they get further from the glyph
        lineValue = mix(lineValue, 1., lineProgress);

        value = blendDarken(
          value,
          lineValue
        );
      }

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
      uProgress: () => {
        return progress;
      },
    },

    count: 6,
  });

  const onFrame = () => {
    if (animationInProgress) {
      progress += 1.0 / (60 * animationDurationSeconds);
      if (progress >= 1) {
        animationInProgress = false;
      }
    } else {
      setTimeout(() => {
        progress = 0;
        animationInProgress = true;
      }, delayBetweenAnimationsSeconds * 1000);
    }

    command();
    requestAnimationFrame(onFrame);
  };
  onFrame();
});
