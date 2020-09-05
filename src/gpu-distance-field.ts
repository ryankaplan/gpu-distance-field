import { Graphics, WebGL } from "./graphics";

import * as shaders from "./shaders";

// All values are between 0 and 1
type Color = {
  r: number;
  g: number;
  b: number;
  a: number;
};

// JFA + 1 is good enough quality for most things (altohugh none of these
// are as high quality as some other distance field generation methods).
//
// You can think of these are low, medium and high respectively. Each one
// requires an extra run of JFA.
type JumpFloodQuality = "JFA" | "JFA+1" | "JFA+2";

type JumpFloodOutput = {
  format: "distance" | "seed-position";
  // When format is distance, assume that the original input was a black
  // image on white background and use its antialising values to output
  // slightly more accurate distances.
  antialiasedDistance: boolean;
  renderTarget: "texture" | "screen";
};

namespace JumpFloodOutput {
  export const FOR_ANOTHER_STEP: JumpFloodOutput = {
    format: "seed-position",
    antialiasedDistance: false,
    renderTarget: "texture",
  };

  export const FOR_SCREEN_NON_ANTIALIASED: JumpFloodOutput = {
    format: "distance",
    antialiasedDistance: false,
    renderTarget: "screen",
  };

  export const FOR_SCREEN_ANTIALIASED: JumpFloodOutput = {
    format: "distance",
    antialiasedDistance: true,
    renderTarget: "screen",
  };
}

export class DistanceFieldGenerator {
  private _gl: WebGL.Context;

  // The output canvas we're rendering to, passed in at construction-time.
  // When you generate a distance field this is resized to match the
  // size of the input canvas.
  private _outputCanvas: HTMLCanvasElement;

  // Used to transform input data (seeds drawn onto a canvas) into information
  // that's ready to be processed by JFA (a texture of pixels where each red-green
  // and blue-alpha pair specifies a grid location).
  private _prepJumpFloodData: Graphics.Material;

  // Programs that run jump-flood algorithm, ping-ponging data
  // between _sourceTexture and _destTexture. One outputs seed
  // positions which are used for another iteration of jump flood
  // and the other outputs distances.
  private _jumpFloodOutputSeedPosition: Graphics.Material;
  private _jumpFloodOutputDistance: Graphics.Material;

  // All programs render a single quad whose data is stored here.
  private _quadBuffer: Graphics.VertexBuffer;

  // WebGL doesn't let you write to the texture you're reading from.
  // So we ping-pong data back and forth between these two textures.
  private _sourceTexture: Graphics.Texture | null = null;
  private _destTexture: Graphics.Texture | null = null;
  private _sourceTextureTarget: Graphics.RenderTarget | null = null;
  private _destTextureTarget: Graphics.RenderTarget | null = null;

  private _seedInputTexture: Graphics.Texture | null = null;

  constructor(outputCanvas: HTMLCanvasElement) {
    this._outputCanvas = outputCanvas;
    this._gl = new WebGL.Context(outputCanvas);
    this._resizeOutputCanvasAndTextures(
      outputCanvas.width,
      outputCanvas.height,
      "force-update"
    );

    const gl = this._gl;

    // Disable all blending
    this._gl.setCopyBlendState();

    const vertexFormat = new Graphics.VertexFormat();
    vertexFormat.add(
      shaders.GLSLX_NAME_A_QUAD,
      Graphics.AttributeType.FLOAT,
      2
    );

    // Create programs
    this._prepJumpFloodData = gl.createMaterial(
      vertexFormat,
      shaders.GLSLX_SOURCE_V_COPY_POSITION,
      shaders.GLSLX_SOURCE_F_PREP_FOR_JFA
    );
    this._jumpFloodOutputSeedPosition = gl.createMaterial(
      vertexFormat,
      shaders.GLSLX_SOURCE_V_COPY_POSITION,
      shaders.GLSLX_SOURCE_F_JUMP_FLOOD_OUTPUT_SEED_POSITION
    );
    this._jumpFloodOutputDistance = gl.createMaterial(
      vertexFormat,
      shaders.GLSLX_SOURCE_V_COPY_POSITION,
      shaders.GLSLX_SOURCE_F_JUMP_FLOOD_OUTPUT_DISTANCE
    );

    // All draw calls use a single quad
    const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this._quadBuffer = gl.createVertexBuffer(vertexFormat.stride * QUAD.length);
    this._quadBuffer.upload(new Uint8Array(QUAD.buffer));
  }

  destroy() {
    // Delete WebGL resources. These would eventually be garbage collected, but this
    // can take a while as explained here: https://stackoverflow.com/a/58505477
    if (this._sourceTexture) {
      this._sourceTexture.free();
    }
    if (this._destTexture) {
      this._destTexture.free();
    }
    if (this._seedInputTexture) {
      this._seedInputTexture.free();
    }

    // Delete buffers
    this._quadBuffer.free();

    // Delete programs
    this._prepJumpFloodData.free();
    this._jumpFloodOutputDistance.free();
    this._jumpFloodOutputSeedPosition.free();
  }

  private _resizeTextureIfNecessary(
    texture: Graphics.Texture,
    newWidth: number,
    newHeight: number,
    forceUpdate: "force-update" | "dont-force" = "dont-force"
  ) {
    if (
      texture.width === newWidth &&
      texture.height === newHeight &&
      forceUpdate !== "force-update"
    ) {
      return;
    }
    texture.resize(newWidth, newHeight);
  }

  private _resizeOutputCanvasAndTextures(
    newWidth: number,
    newHeight: number,
    forceUpdate: "force-update" | "dont-force" = "dont-force"
  ) {
    const gl = this._gl;

    const outputCanvas = this._outputCanvas;
    const outputCanvasSizeNeedsUpdate =
      outputCanvas.width !== newWidth ||
      outputCanvas.height !== newHeight ||
      forceUpdate === "force-update";
    if (outputCanvasSizeNeedsUpdate) {
      gl.resize(newWidth, newHeight, newWidth, newHeight);
    }

    // Resize or create textures if necessary
    if (this._sourceTexture == null) {
      this._sourceTexture = gl.createTexture(
        Graphics.TextureFormat.NEAREST_CLAMP,
        newWidth,
        newHeight
      );
      this._sourceTextureTarget = gl.createRenderTarget(this._sourceTexture);
    } else {
      this._resizeTextureIfNecessary(this._sourceTexture, newWidth, newHeight);
    }

    if (this._destTexture == null) {
      this._destTexture = gl.createTexture(
        Graphics.TextureFormat.NEAREST_CLAMP,
        newWidth,
        newHeight
      );
      this._destTextureTarget = gl.createRenderTarget(this._destTexture);
    } else {
      this._resizeTextureIfNecessary(this._destTexture, newWidth, newHeight);
    }

    if (this._seedInputTexture == null) {
      this._seedInputTexture = gl.createTexture(
        Graphics.TextureFormat.NEAREST_CLAMP,
        newWidth,
        newHeight
      );
    } else {
      this._resizeTextureIfNecessary(
        this._seedInputTexture,
        newWidth,
        newHeight
      );
    }
  }

  // Generates a distance field for antialiased black shapes drawn on a
  // white canvas (e.g. drawn by the Canvas2D API).
  public generateDistanceField(
    inputCanvas: HTMLCanvasElement,
    quality: JumpFloodQuality = "JFA+1"
  ) {
    const width = inputCanvas.width;
    const height = inputCanvas.height;
    this._resizeOutputCanvasAndTextures(width, height);

    this._setSeedsFromCanvas(inputCanvas, new Float32Array([1, 1, 1, 1]));

    const maxDimension = Math.max(width, height);
    let stepSize = nextPowerOfTwo(maxDimension) / 2;
    while (stepSize >= 1) {
      const isLastStep = stepSize / 2 < 1 && quality == "JFA";
      const output = isLastStep
        ? JumpFloodOutput.FOR_SCREEN_ANTIALIASED
        : JumpFloodOutput.FOR_ANOTHER_STEP;
      this._runJumpFloodStep(stepSize, output);
      stepSize /= 2;
    }

    switch (quality) {
      case "JFA": {
        // We're done
        break;
      }
      case "JFA+1": {
        // Run the last step again
        this._runJumpFloodStep(1, JumpFloodOutput.FOR_SCREEN_ANTIALIASED);
        break;
      }
      case "JFA+2": {
        // Run the last two steps again
        this._runJumpFloodStep(2, JumpFloodOutput.FOR_ANOTHER_STEP);
        this._runJumpFloodStep(1, JumpFloodOutput.FOR_SCREEN_ANTIALIASED);
        break;
      }
    }
  }

  // Generates a distance field for the content in `inputCanvas`. Any pixel
  // that isn't `backgroundColor` is treated as foreground content and will
  // contribute to the distance field.
  //
  // `generateDistanceField` generates higher quality results. This is appropriate
  // when you don't have control over the colors you're drawing or when it's
  // not antialiased.
  public generateRawDistanceField(
    inputCanvas: HTMLCanvasElement,
    backgroundColor: Color,
    quality: JumpFloodQuality = "JFA+1"
  ) {
    const width = inputCanvas.width;
    const height = inputCanvas.height;
    this._resizeOutputCanvasAndTextures(width, height);

    const { r, g, b, a } = backgroundColor;
    this._setSeedsFromCanvas(inputCanvas, new Float32Array([r, g, b, a]));

    const maxDimension = Math.max(width, height);
    let stepSize = nextPowerOfTwo(maxDimension) / 2;

    while (stepSize >= 1) {
      const isLastStep = stepSize / 2 < 1 && quality == "JFA";
      const output = isLastStep
        ? JumpFloodOutput.FOR_SCREEN_NON_ANTIALIASED
        : JumpFloodOutput.FOR_ANOTHER_STEP;
      this._runJumpFloodStep(stepSize, output);
      stepSize /= 2;
    }

    switch (quality) {
      case "JFA": {
        // We're done
        break;
      }
      case "JFA+1": {
        // Run the last step again
        this._runJumpFloodStep(1, JumpFloodOutput.FOR_SCREEN_NON_ANTIALIASED);
        break;
      }
      case "JFA+2": {
        // Run the last two steps again
        this._runJumpFloodStep(2, JumpFloodOutput.FOR_ANOTHER_STEP);
        this._runJumpFloodStep(1, JumpFloodOutput.FOR_SCREEN_NON_ANTIALIASED);
        break;
      }
    }
  }

  public getPixels(): Uint8Array {
    const gl = this._gl.gl;
    const pixels = new Uint8Array(
      gl.drawingBufferWidth * gl.drawingBufferHeight * 4
    );
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );
    return pixels;
  }

  // Move seed data from _seedInputTexture into _sourceTexture so that it
  // can be used for our jump flood algorithm.
  //
  // We could build this into the first step of the algorithm but it's
  // cleaner as a separate step and when I attempted to remove it it only
  // gave a 2fps improvement on large canvasses.
  private _setSeedsFromCanvas(
    inputCanvas: HTMLCanvasElement,
    backgroundColor: Float32Array
  ) {
    if (!this._seedInputTexture) {
      throw new Error(
        `Expected _seedInputTexture to be set before calling setSeedsFromCanvas`
      );
    }

    const width = inputCanvas.width;
    const height = inputCanvas.height;

    this._seedInputTexture.resize(width, height, inputCanvas);

    const material = this._prepJumpFloodData;
    material.setUniformSampler(
      shaders.GLSLX_NAME_U_SEED_INPUT_TEXTURE,
      this._seedInputTexture,
      0
    );
    material.setUniformVec2(shaders.GLSLX_NAME_U_RESOLUTION, width, height);

    const [r, g, b, a] = backgroundColor;
    material.setUniformVec4(shaders.GLSLX_NAME_U_BACKGROUND_COLOR, r, g, b, a);

    this._gl.setRenderTarget(this._sourceTextureTarget);
    this._gl.setViewport(0, 0, width, height);
    this._gl.draw(
      Graphics.Primitive.TRIANGLE_STRIP,
      material,
      this._quadBuffer
    );
  }

  // Run an iteration of the jump flood algorithm, using the suggested
  // output format.
  //
  // The current simulation state is always in _sourceTexture
  // and we draw onto _destTexture.
  private _runJumpFloodStep(stepSize: number, output: JumpFloodOutput) {
    if (!this._sourceTexture || !this._seedInputTexture) {
      throw new Error(
        `Expected textures to be set before calling setSeedsFromCanvas`
      );
    }

    const { width, height } = this._outputCanvas;

    const material =
      output.format === "seed-position"
        ? this._jumpFloodOutputSeedPosition
        : this._jumpFloodOutputDistance;
    material.setUniformSampler(
      shaders.GLSLX_NAME_U_INPUT_TEXTURE,
      this._sourceTexture,
      0
    );
    material.setUniformInt(shaders.GLSLX_NAME_U_STEP_SIZE, stepSize);
    material.setUniformVec2(shaders.GLSLX_NAME_U_RESOLUTION, width, height);

    if (output.format === "distance") {
      material.setUniformSampler(
        shaders.GLSLX_NAME_U_SEED_INPUT_TEXTURE,
        this._seedInputTexture,
        1
      );
      material.setUniformBool(
        shaders.GLSLX_NAME_U_ANTIALIASED_DISTANCE,
        output.antialiasedDistance
      );
    }

    this._gl.setRenderTarget(
      output.renderTarget === "texture" ? this._destTextureTarget : null
    );
    this._gl.setViewport(0, 0, width, height);
    this._gl.draw(
      Graphics.Primitive.TRIANGLE_STRIP,
      material,
      this._quadBuffer
    );

    this._swapBuffers();
  }

  private _swapBuffers() {
    const tmp = this._sourceTexture;
    const tmpTarget = this._sourceTextureTarget;

    this._sourceTexture = this._destTexture;
    this._sourceTextureTarget = this._destTextureTarget;

    this._destTexture = tmp;
    this._destTextureTarget = tmpTarget;
  }
}

function nextPowerOfTwo(n: number) {
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  n++;
  return n;
}
