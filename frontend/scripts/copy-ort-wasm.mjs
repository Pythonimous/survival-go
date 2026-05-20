/**
 * Copy ONNX Runtime Web WASM/MJS artifacts into public/wasm/ so Vite can
 * serve them at the URL Kaya's `OnnxEngine` defaults to (`/wasm/`). Bundled
 * ORT cannot resolve import.meta.url to these binaries in dev.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const distDir = path.join(frontendRoot, "node_modules", "onnxruntime-web", "dist");
const destDir = path.join(frontendRoot, "public", "wasm");

const COPY_PATTERN = /^ort-wasm-simd-threaded.*\.(wasm|mjs)$/;

async function main() {
  let entries;
  try {
    entries = await fs.readdir(distDir);
  } catch (err) {
    console.warn(
      "[copy-ort-wasm] onnxruntime-web dist not found; skip (run npm install in frontend/).",
      err instanceof Error ? err.message : err,
    );
    process.exit(0);
  }

  const files = entries.filter((name) => COPY_PATTERN.test(name));
  if (files.length === 0) {
    console.warn("[copy-ort-wasm] no ort-wasm-simd-threaded artifacts matched; skip.");
    process.exit(0);
  }

  await fs.mkdir(destDir, { recursive: true });
  await Promise.all(
    files.map(async (name) => {
      const from = path.join(distDir, name);
      const to = path.join(destDir, name);
      await fs.copyFile(from, to);
    }),
  );
  console.log(`[copy-ort-wasm] copied ${files.length} file(s) to public/wasm/`);
}

main().catch((err) => {
  console.error("[copy-ort-wasm] failed:", err);
  process.exit(1);
});
