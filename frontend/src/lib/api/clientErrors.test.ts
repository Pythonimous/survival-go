import { describe, expect, it } from "vitest";

import {
  ApiClientError,
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  isApiClientError,
} from "@/lib/api/clientErrors";

describe("ApiClientError", () => {
  it("exposes code and message", () => {
    const error = new ApiClientError("network_error", "Could not reach the API.");
    expect(error.code).toBe("network_error");
    expect(error.message).toBe("Could not reach the API.");
    expect(error.name).toBe("ApiClientError");
  });

  it("is detected by isApiClientError", () => {
    expect(isApiClientError(new ApiTimeoutError("timed out", 30))).toBe(true);
    expect(isApiClientError(new Error("plain"))).toBe(false);
  });
});

describe("specialized API client errors", () => {
  it("ApiTimeoutError records timeout seconds", () => {
    const error = new ApiTimeoutError("Analyze timed out.", 90);
    expect(error.code).toBe("request_timeout");
    expect(error.timeoutSeconds).toBe(90);
  });

  it("ApiNetworkError uses network_error code", () => {
    const error = new ApiNetworkError("Engine move failed to reach API.");
    expect(error.code).toBe("network_error");
  });

  it("ApiHttpError records status and optional API code", () => {
    const error = new ApiHttpError("illegal move: D4", {
      status: 400,
      apiCode: "illegal_move",
    });
    expect(error.code).toBe("http_error");
    expect(error.status).toBe(400);
    expect(error.apiCode).toBe("illegal_move");
  });
});
