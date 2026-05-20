/**
 * Vite dev server: serve ONNX Runtime Web threaded WASM/MJS from node_modules.
 *
 * Kaya's `OnnxEngine` defaults `ort.env.wasm.wasmPaths` to `/wasm/`, so we
 * serve the threaded artifacts there. `env.wasm.wasmPaths` cannot point at
 * `public/wasm/*.mjs` in dev because Vite rejects dynamic `import()` of public
 * assets ("should not be imported from source code"); same-origin static bytes
 * from this middleware avoid the transform pipeline.
 *
 * Production still uses `public/wasm/` (copied by `npm run copy-ort-wasm`).
 */
import fs from "node:fs";
import path from "node:path";
import type { Connect, Plugin, ViteDevServer } from "vite";

const ALLOWED = /^ort-wasm-simd-threaded.*\.(wasm|mjs)$/;

function sendFile(res: Connect.ServerResponse, filePath: string, name: string): void {
  let data: Buffer;
  try {
    data = fs.readFileSync(filePath);
  } catch {
    res.statusCode = 404;
    res.end();
    return;
  }
  const type = name.endsWith(".wasm") ? "application/wasm" : "text/javascript; charset=utf-8";
  res.setHeader("Content-Type", type);
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cache-Control", "no-cache");
  res.end(data);
}

export function ortWasmDevMiddleware(): Plugin {
  return {
    name: "ort-wasm-dev-middleware",
    enforce: "pre",
    configureServer(server: ViteDevServer) {
      const distDir = path.resolve(server.config.root, "node_modules", "onnxruntime-web", "dist");
      const rawBase = server.config.base;
      const baseWithSlash = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
      const prefix = `${baseWithSlash}wasm/`;

      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? "";
        const pathname = rawUrl.split("?")[0] ?? "";
        if (!pathname.startsWith(prefix)) {
          next();
          return;
        }
        const name = decodeURIComponent(pathname.slice(prefix.length));
        if (!ALLOWED.test(name) || name.includes("..") || name.includes("/") || name.includes("\\")) {
          res.statusCode = 403;
          res.end();
          return;
        }
        const filePath = path.join(distDir, name);
        if (!filePath.startsWith(distDir)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        sendFile(res, filePath, name);
      });
    },
  };
}
