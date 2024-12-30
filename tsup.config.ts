import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: true,
  shims: true,
  noExternal: ["chalk", "commander", "cosmiconfig", "lodash"],
  treeshake: true,
});
