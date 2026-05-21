import {
  ApiNetworkError,
  ApiTimeoutError,
  formatApiOperationFailure,
} from "@/lib/api/clientErrors";

/**
 * Backend HTTP round-trip only (POST body upload + server JSON response).
 * Does not include browser ONNX/MCTS time — that runs before transport calls this.
 */
export const DEFAULT_API_REQUEST_TIMEOUT_MS = 90_000;

function readViteEnv(key: string): string | undefined {
  const env = (import.meta as { env?: Record<string, string | boolean | undefined> }).env;
  const value = env?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function resolveApiRequestTimeoutMs(overrideMs?: number): number {
  if (overrideMs !== undefined && Number.isFinite(overrideMs) && overrideMs > 0) {
    return overrideMs;
  }
  const raw = readViteEnv("VITE_API_REQUEST_TIMEOUT_MS");
  if (raw === undefined) {
    return DEFAULT_API_REQUEST_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_API_REQUEST_TIMEOUT_MS;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isNetworkFetchError(error: unknown): boolean {
  return error instanceof TypeError;
}

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  options?: {
    timeoutMs?: number;
    operation?: string;
  },
): Promise<Response> {
  const timeoutMs = resolveApiRequestTimeoutMs(options?.timeoutMs);
  const timeoutSeconds = Math.max(1, Math.round(timeoutMs / 1000));
  const operation = options?.operation ?? "complete API request";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw new ApiTimeoutError(
        formatApiOperationFailure(
          operation,
          `server did not respond within ${timeoutSeconds}s (local inference is not timed). Retry or raise VITE_API_REQUEST_TIMEOUT_MS if the API is slow.`,
        ),
        timeoutSeconds,
      );
    }
    if (isNetworkFetchError(error)) {
      throw new ApiNetworkError(
        formatApiOperationFailure(
          operation,
          "could not reach the API. Check that the backend is running and VITE_API_BASE_URL is correct.",
        ),
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
