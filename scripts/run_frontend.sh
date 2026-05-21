#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"

if [ ! -d node_modules ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

if [ ! -f public/wasm/ort-wasm-simd-threaded.jsep.wasm ]; then
  echo "Copying ONNX Runtime Web WASM into public/wasm/..."
  npm run copy-ort-wasm
fi

if [ ! -f public/coi-serviceworker.js ]; then
  echo "Copying coi-serviceworker into public/..."
  npm run copy-coi-serviceworker
fi

exec npm run dev:host
