import { describe, expect, it } from "vitest";

import { ApiHttpError } from "@/lib/api/clientErrors";
import { readApiErrorCode, readApiFailure } from "@/lib/api/errors";

describe("readApiFailure", () => {
  it("throws ApiHttpError with structured API code", async () => {
    const response = new Response(
      JSON.stringify({
        detail: { code: "illegal_move", message: "illegal move: D4" },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );

    await expect(readApiFailure(response, "Request failed.")).rejects.toMatchObject({
      code: "http_error",
      status: 400,
      apiCode: "illegal_move",
      message: "illegal move: D4",
    });
    await expect(readApiFailure(response, "Request failed.")).rejects.toBeInstanceOf(ApiHttpError);
  });
});

describe("readApiErrorCode", () => {
  it("reads code from structured API error detail", () => {
    expect(
      readApiErrorCode({
        detail: { code: "illegal_move", message: "illegal move: D4" },
      }),
    ).toBe("illegal_move");
  });

  it("returns null for legacy string detail", () => {
    expect(readApiErrorCode({ detail: "illegal move: D4" })).toBeNull();
  });
});
