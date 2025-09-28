import { defineConfig } from "tsdown";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  dts: false,
  exports: false,
  format: ["cjs"],
  entry: "./src/index.ts",
  noExternal: Object.keys(pkg.dependencies ?? {})
});
