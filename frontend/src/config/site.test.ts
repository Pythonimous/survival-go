import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveFeedbackUrl } from "@/config/site";

describe("resolveFeedbackUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to a new GitHub issue on the survival-go repo", () => {
    vi.stubEnv("VITE_FEEDBACK_URL", "");
    expect(resolveFeedbackUrl()).toBe(
      "https://github.com/Pythonimous/survival-go/issues/new",
    );
  });

  it("uses VITE_FEEDBACK_URL when set", () => {
    vi.stubEnv("VITE_FEEDBACK_URL", "mailto:hello@example.com");
    expect(resolveFeedbackUrl()).toBe("mailto:hello@example.com");
  });
});
