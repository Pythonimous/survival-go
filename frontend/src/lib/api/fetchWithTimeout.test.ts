import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiNetworkError, ApiTimeoutError } from "@/lib/api/clientErrors";
import { DEFAULT_API_REQUEST_TIMEOUT_MS, fetchWithTimeout } from "@/lib/api/fetchWithTimeout";

describe("fetchWithTimeout", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns the response when fetch completes in time", async () => {
    const response = new Response("ok", { status: 200 });
    fetchMock.mockResolvedValueOnce(response);

    const result = await fetchWithTimeout("/api/games/g1/analyze", { method: "POST" }, {
      timeoutMs: 5_000,
      operation: "analyze position",
    });

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/games/g1/analyze",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
  });

  it("throws ApiTimeoutError when the request exceeds the timeout", async () => {
    fetchMock.mockImplementation((_url, init) => {
      const signal = init?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const promise = fetchWithTimeout("/api/games/g1/engine-move", { method: "POST" }, {
      timeoutMs: 1_000,
      operation: "engine move",
    });
    const rejection = expect(promise).rejects;
    vi.advanceTimersByTime(1_000);
    await rejection.toBeInstanceOf(ApiTimeoutError);
    await expect(promise).rejects.toMatchObject({
      code: "request_timeout",
      timeoutSeconds: 1,
      message: expect.stringContaining("engine move"),
    });
  });

  it("throws ApiNetworkError on fetch TypeError failures", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      fetchWithTimeout("/api/games/g1/analyze", undefined, {
        timeoutMs: 5_000,
        operation: "analyze position",
      }),
    ).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it("uses DEFAULT_API_REQUEST_TIMEOUT_MS when timeoutMs is omitted", () => {
    expect(DEFAULT_API_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });
});
