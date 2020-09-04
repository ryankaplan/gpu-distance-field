import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/gpu-distance-field.ts",
  output: [
    {
      file: "dist/gpu-distance-field.esm.js",
      format: "es",
    },
    {
      file: "dist/gpu-distance-field.umd.js",
      format: "umd",
      name: "gpu-distance-field",
    },
  ],
  plugins: [typescript()],
};
