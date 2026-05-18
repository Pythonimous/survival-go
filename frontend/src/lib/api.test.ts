import { afterEach, describe, expect, it, vi } from "vitest";

describe("apiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns relative paths when VITE_API_BASE_URL is unset", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const { apiUrl } = await import("./api");
    expect(apiUrl("/api/presets")).toBe("/api/presets");
  });

  it("prefixes paths with the configured API base URL", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const { apiUrl } = await import("./api");
    expect(apiUrl("/api/presets")).toBe("https://api.example.com/api/presets");
  });

  it("strips a trailing slash from the base URL", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/");
    const { apiUrl } = await import("./api");
    expect(apiUrl("/health")).toBe("https://api.example.com/health");
  });

  it("adds a leading slash when the path omits one", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const { apiUrl } = await import("./api");
    expect(apiUrl("api/games")).toBe("https://api.example.com/api/games");
  });
});
