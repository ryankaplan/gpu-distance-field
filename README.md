# gpu-distance-field

This library generates signed distance fields of antialiased black and white images using an approach called [Jump Flooding](http://rykap.com/graphics/skew/2016/02/25/voronoi-diagrams/).

It has no dependencies and doesn't use any WebGL extensions, and its performance and quality are optimized for games and 2D graphics demos. On many systems its fast enough to generate distance fields for content that changes at 60fps. The performance comes at a cost though -- it's output is lower quality than CPU methods like [TinySDF](https://github.com/mapbox/tiny-sdf).

Below is a GIF of one of the demos in this repo which generates a distance field of the canvas on the left and lets you sample distances in Javascript.

![Demo GIF](/static/demo.gif)

## Installation

`npm install gpu-distance-field --save`

## How to use it

Add code like this to your project...

```typescript
import { DistanceFieldGenerator } from 'gpu-distance-field'

// sourceCanvas contains anti-aliased black shapes on a white
// background (e.g. drawn by Canvas2D).
const sourceCanvas = ...

// Generate the SDF
const generator = new DistanceFieldGenerator();
generator.generateSDF(sourceCanvas);
```

There are two ways to access the generated distance field...

**In GLSL**

Upload `generator.outputCanvas()` to a WebGL texture and sample it like so...

```glsl
const float BASE = 255.;
const float BASE_2 = BASE * BASE;
const float BASE_3 = BASE * BASE * BASE;

// Returns the distance value stored in the distance
// field at a particular uv coordinate.
float getDistanceValue(in vec2 uv) {
  vec4 value = texture2D(uTexture, uv) * BASE;
  return (value.x * BASE_2 + value.y * BASE + value.z - BASE_3 / 2.) / 1000.;
}
```

You can see this in the `gl-api` demo.

**In Javascript**

Sampling via JS is slower but you can do it. Call `generator.readPixels()` and use the helper below. You can see this in action in the `js-api` demo.

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
  // a base 255 number added to BASE ^ 3 / 2 and multiplied
  // by 1000.
  const BASE = 255;
  const BASE_2 = BASE * BASE;
  const BASE_3 = BASE_2 * BASE;
  return (r * BASE_2 + g * BASE + b - BASE_3 / 2) / 1000;
}
```

## Tips

- Each `DistanceFieldGenerator` creates WebGL resources and caches them, so if you don't need a `DistanceFieldGenerator` anymore, call `destroy()` on it to free up resources.
- `DistanceFieldGenerator` is optimized for repeatedly calling `generateSDF` with input canvasses of the same size. This is much faster than creating a new `DistanceFieldGenerator` each time you need a distance field.

## Demo

There are two demos in this repo. To run the one that demonstrates the JS API, run...

```
npm install
npm run js-demo
```

...and open `localhost:1234` in a browser.

Similarly, to run the demo that demonstrates the WebGL API, run...

```
npm install
npm run gl-demo
```

...and open `localhost:1234` in a browser.
