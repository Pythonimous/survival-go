/**
 * Fetch ONNX model bytes before ORT session creation. Loading from a URL inside
 * `InferenceSession.create` while `numThreads > 1` can hang in onnxruntime-web;
 * passing an ArrayBuffer avoids that path.
 */
export async function fetchOnnxModelArtifact(
  modelArtifactUrl: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const response = await fetch(modelArtifactUrl, { credentials: "omit", signal });
  if (!response.ok) {
    throw new Error(
      `Failed to download ONNX model (${response.status} ${response.statusText}).`,
    );
  }
  return response.arrayBuffer();
}
