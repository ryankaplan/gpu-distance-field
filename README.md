# gpu-distance-field

This library efficiently generates distance fields of 2D images using an approach called [Jump Flooding](http://rykap.com/graphics/skew/2016/02/25/voronoi-diagrams/). It has no dependencies and doesn't use any WebGL extensions, and its performance and quality are optimized for games and 2D graphics demos. On many systems its fast enough to generate distance fields for content that changes at 60fps.

Caveats:

- It generates unsigned distance fields (not SDFs).
- It's output is lower quality than CPU methods like [TinySDF](https://github.com/mapbox/tiny-sdf).

Here's a GIF of the demo in this folder which generates a distance field of the canvas on the left and lets you sample distances in Javascript.

![Demo GIF](/static/demo.gif)

## Installation

`npm install gpu-distance-field --save`

## How to use it

Add code like the following to your project...

```typescript
const generator = new DistanceFieldGenerator();

// sourceCanvas must contain black shapes on a white
// background.
generator.generateDistanceField(sourceCanvas);
```

There are two ways to access the generated distance field...

**In GLSL**

Upload `generator.outputCanvas()` to a texture and sample it like so...

```glsl
// Returns the distance value stored in the distance
// field at a particular uv coordinate.
float getDistanceValue(in vec2 uv) {
  vec4 value = texture2D(uDistanceFieldTex, uv);
  value *= BASE;
  return (value.x * BASE * BASE + value.y * BASE + value.z) / 1024.;
}
```

**In Javascript**

Sampling via JS is slower but you can do it. Call `generator.readPixels()` and using the helper below. You can see this in practice in the `demo` folder.

```typescript
// Returns the distance from a particular coordinate
// on the canvas to the nearest shape, as determined
// by the distance field.
//
// `pixels` is the output of calling
// `DistanceFieldGenerator.getPixels()`.
function getDistanceFromPixels(
  pixels: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  x: number,
  y: number
) {
  // In WebGL the y-coordinate increases as you go up
  // on your screen and in the DOM the y-coordinate
  // decreases as you go up on your screen. `pixels`
  // came right out of a WebGL texture, we need to
  // flip it.
  const flippedY = canvasHeight - y;

  // `pixels` is an array of r, g, b, a values between
  // 0 and 255. Figure out the index of the red value in
  // the pixel we want.
  const BYTES_PER_PIXEL = 4;
  const pixelsPerRow = canvasWidth * BYTES_PER_PIXEL;
  const redPixelIndex = flippedY * pixelsPerRow + x * BYTES_PER_PIXEL;

  // Pull out the values of the red pixel, along with
  // green and blue. alpha isn't used.
  const r = pixels[redPixelIndex];
  const g = pixels[redPixelIndex + 1];
  const b = pixels[redPixelIndex + 2];

  // The rgb values of each pixel store the distance as
  // a base 255 number multiplied by 1024.
  const BASE = 255;
  return (r * BASE * BASE + g * BASE + b) / 1024;
}
```

## Demo

To run the demo included in this repo, run...

```
npm install
npm run demo
```

Then open `localhost:1234` in a browser.
