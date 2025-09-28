import { defineConfig } from "tsdown";

export default defineConfig({
  dts: false,
  exports: false,
  format: ["cjs"],
  entry: "./src/index.ts",
});
