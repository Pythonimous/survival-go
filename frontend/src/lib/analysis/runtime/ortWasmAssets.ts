/** ORT threaded WASM artifacts used when importing `onnxruntime-web/all` (JSEP + WebGPU). */
const THREADED_JSEP_MJS = "ort-wasm-simd-threaded.jsep.mjs";
const THREADED_JSEP_WASM = "ort-wasm-simd-threaded.jsep.wasm";

let blobUrlsToRevoke: string[] = [];

function wasmAssetBaseUrl(): string {
  if (typeof window === "undefined") {
    return "/wasm/";
  }
  const base = import.meta.env.BASE_URL ?? "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return new URL(`wasm/`, new URL(normalized, window.location.origin)).href;
}

async function fetchWasmAsset(relativeName: string): Promise<Blob> {
  const url = new URL(relativeName, wasmAssetBaseUrl()).href;
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(
      `Failed to load ONNX Runtime WASM asset ${relativeName} (${response.status}).`,
    );
  }
  return response.blob();
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
    fetchWasmAsset(THREADED_JSEP_MJS),
    fetchWasmAsset(THREADED_JSEP_WASM),
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
