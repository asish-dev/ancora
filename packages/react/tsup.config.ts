import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // react, react-dom, @tanstack/react-virtual (peers) and @ancora/core
  // (dependency) are externalized automatically by tsup — never bundled.
  outExtension: ({ format }) => ({ js: format === "esm" ? ".mjs" : ".cjs" }),
});
