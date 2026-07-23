import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The playground is a dev tool and the e2e fixture, not a published artifact.
// Resolve the workspace packages to their SOURCE (not dist) so it runs with
// HMR and needs no build step — the published dist output is validated
// separately by `npm run build` + are-the-types-wrong in CI.
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ancora/react": src("../../packages/react/src/index.ts"),
      "@ancora/core": src("../../packages/core/src/index.ts"),
    },
  },
  server: { port: 5199, strictPort: true },
});
