# gpu-distance-field

This library efficiently generates distance fields of 2D images. It has no dependencies and doesn't use any WebGL extensions, and on many systems its fast enough to generate distance fields for content that changes at 60fps.

That said, it generates unsigned distance fields (not SDFs) and it's output is lower quality than CPU methods like [TinySDF](https://github.com/mapbox/tiny-sdf). It's performance and quality are optimized for games and 2D graphics demos.

## Installation

`npm install gpu-distance-field --save`

## How to use it

Add code like the following to your project...

```typescript
// Create a canvas to store the distance field.
// This won't be displayed to the user. Think of
// it as a GPU texture that we're using to store
// distance data that can be easily passed to other
// WebGL contexts.
const generator = new DistanceFieldGenerator(destCanvas);

// Pass in a canvas that has some black shapes on a
// white background and that we'd like to generate a
// distance field for. The last parameter indicates the
// quality of field you'd like to generate. JFA is the
// lowest and JFA+2 is the highest.
generator.generateDistanceField(sourceCanvas, "JFA");
```

Below is a demo of a `sourceCanvas` (left) and `destCanvas` (right). Each pixel in the `destCanvas` holds an encoded distance value encoded as a three-component base-255 number.

![Demo GIF](/static/demo.gif)

To use the distance field in WebGL we need to decode this number. Upload `destCanvas` to a WebGL texture and sample out of it and decode this number like so...

```glsl
// Returns the distance value stored in the distance
// field at a particular uv coordinate.
float getDistanceValue(in vec2 uv) {
  vec4 value = texture2D(uTexture, uv);
  value *= BASE;
  return (value.x * BASE * BASE + value.y * BASE + value.z) / 1024.;
}
```

You can also sample distances in JS as below. This will be slower because reading pixel data from the GPU is slow. You can see this in practice in the `demo` folder.

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

## How it works

It uses an approach called GPU jump flooding. I wrote a blog post on how it works that you can find [here](http://rykap.com/graphics/skew/2016/02/25/voronoi-diagrams/) or you can skip right to the paper that it's based [on](http://www.comp.nus.edu.sg/~tants/jfa.html).
