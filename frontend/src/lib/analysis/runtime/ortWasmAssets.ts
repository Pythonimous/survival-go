/** ORT threaded WASM artifacts used when importing `onnxruntime-web/all` (JSEP + WebGPU). */
const THREADED_JSEP_MJS = "ort-wasm-simd-threaded.jsep.mjs";
const THREADED_JSEP_WASM = "ort-wasm-simd-threaded.jsep.wasm";
const ORT_MJS_BLOB_TYPE = "application/javascript";
const ORT_WASM_BLOB_TYPE = "application/wasm";
const WASM_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);

let blobUrlsToRevoke: string[] = [];

function wasmAssetBaseUrl(): string {
  if (typeof window === "undefined") {
    return "/wasm/";
  }
  const base = import.meta.env.BASE_URL ?? "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return new URL(`wasm/`, new URL(normalized, window.location.origin)).href;
}

function assertWasmMagic(bytes: Uint8Array, relativeName: string): void {
  if (
    bytes.length >= WASM_MAGIC.length &&
    bytes.subarray(0, WASM_MAGIC.length).every((byte, index) => byte === WASM_MAGIC[index])
  ) {
    return;
  }
  const preview = new TextDecoder().decode(bytes.subarray(0, 32));
  if (preview.trimStart().startsWith("<")) {
    throw new Error(
      `ONNX Runtime WASM asset ${relativeName} returned HTML (check /wasm/ routing; nginx must not SPA-fallback these files).`,
    );
  }
  throw new Error(
    `ONNX Runtime WASM asset ${relativeName} is not a valid wasm module.`,
  );
}

async function fetchWasmAsset(relativeName: string, blobType: string): Promise<Blob> {
  const url = new URL(relativeName, wasmAssetBaseUrl()).href;
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(
      `Failed to load ONNX Runtime WASM asset ${relativeName} (${response.status}).`,
    );
  }
  const buffer = await response.arrayBuffer();
  if (blobType === ORT_WASM_BLOB_TYPE) {
    assertWasmMagic(new Uint8Array(buffer), relativeName);
  }
  return new Blob([buffer], { type: blobType });
}

/**
 * Preload threaded ORT WASM/MJS into same-origin blob URLs so Emscripten pthread
 * workers spawn reliably (Vite dev serves `/wasm/*` via middleware; blob URLs
 * match ORT's cross-origin worker preload path).
 */
export async function preloadThreadedOrtWasmPaths(): Promise<{
  wasm: string;
  mjs: string;
}> {
  revokePreloadedOrtWasmPaths();
  const [mjsBlob, wasmBlob] = await Promise.all([
    fetchWasmAsset(THREADED_JSEP_MJS, ORT_MJS_BLOB_TYPE),
    fetchWasmAsset(THREADED_JSEP_WASM, ORT_WASM_BLOB_TYPE),
  ]);
  const mjs = URL.createObjectURL(mjsBlob);
  const wasm = URL.createObjectURL(wasmBlob);
  blobUrlsToRevoke = [mjs, wasm];
  return { mjs, wasm };
}

export function revokePreloadedOrtWasmPaths(): void {
  for (const url of blobUrlsToRevoke) {
    URL.revokeObjectURL(url);
  }
  blobUrlsToRevoke = [];
}

export function willUseMultiThreadedOrtWasm(
  numThreads: number | undefined,
  crossOriginIsolated: boolean,
): boolean {
  if (numThreads !== undefined) {
    return numThreads > 1;
  }
  return crossOriginIsolated;
}
