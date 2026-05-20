# ONNX Runtime Web WASM files (production assets)

These are the ONNX Runtime Web binaries shipped with the production frontend.
Kaya's `OnnxEngine` defaults `ort.env.wasm.wasmPaths` to `/wasm/`, which is why
this folder exists at this exact path.

## Why this directory exists

ONNX Runtime Web ships `ort-wasm-simd-threaded*.wasm` plus matching `.mjs`
Emscripten loaders next to its JS bundle. Two things complicate that in our
Vite app:

- **Dev (Vite server):** `vite-plugin-ort-wasm-dev.ts` serves the threaded
  artifacts at `/wasm/*` straight from `node_modules/onnxruntime-web/dist`.
  Vite refuses dynamic `import()` of files inside `/public/`, so the dev path
  cannot rely on this directory.
- **Prod (`vite build`):** `npm run copy-ort-wasm` (wired via
  `postinstall`/`prebuild`) copies the threaded artifacts here so the built
  bundle serves them as static assets at `/wasm/`. Kaya's default
  `ort.env.wasm.wasmPaths` (`/wasm/`) picks them up with no extra config.

## How to populate

`npm install` in `frontend/` runs `copy-ort-wasm` via `postinstall`, and
`npm run build` runs it via `prebuild`. To force a refresh manually:

```bash
cd frontend && npm run copy-ort-wasm
```

The contents of this directory (other than this README) are gitignored.
