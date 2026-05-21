import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { buildIdIndexHtmlPlugin } from "./vite-plugin-build-id";
import { ortWasmDevMiddleware } from "./vite-plugin-ort-wasm-dev";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Worker-safety toggle for the dev server.
//
// kaya-go/kaya disables HMR + live-reload + lazy compilation in its web dev
// config (apps/web/rsbuild.config.ts) because ONNX Runtime Web spawns
// emscripten pthread workers (`new Worker(new URL(import.meta.url), …)`).
// HMR injection / lazy compilation can stall those workers when the dev
// runtime intercepts their module graph. We mirror that default so the
// threaded WASM backend behaves the same way our prod build does.
//
// Set `VITE_DEV_HMR=1` to re-enable HMR for fast React iteration when you're
// not actively debugging the ONNX worker startup path.
const hmrEnabled = process.env.VITE_DEV_HMR === "1";
const appBuildId = (process.env.VITE_APP_BUILD_ID ?? "").trim();

export default defineConfig({
  plugins: [
    ortWasmDevMiddleware(),
    buildIdIndexHtmlPlugin(appBuildId),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
      preact: path.resolve(rootDir, "src/shims/preact"),
    },
  },
  assetsInclude: ["**/*.onnx"],
  // onnxruntime-web ships `ort-wasm-simd-threaded*.{wasm,mjs}` next to its
  // bundle and uses `import.meta.url` / dynamic `import()` to locate them.
  // Vite's dep prebundling rewrites those URLs and serves the WASM as HTML
  // ("failed to match magic number"). Excluding the package lets it be loaded
  // directly from node_modules with the asset URLs intact.
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  server: {
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    hmr: hmrEnabled,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
    },
  },
});
