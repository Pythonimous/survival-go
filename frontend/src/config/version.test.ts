import { describe, expect, it } from "vitest";

import { APP_VERSION, formatAppVersionLabel } from "@/config/version";

describe("formatAppVersionLabel", () => {
  it("exposes a semver from package.json", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("prefixes the version with v", () => {
    expect(formatAppVersionLabel()).toBe(`v${APP_VERSION}`);
  });

  it("appends a non-dev build id when provided", () => {
    expect(formatAppVersionLabel("a1b2c3d")).toBe(`v${APP_VERSION} · a1b2c3d`);
  });

  it("omits dev build ids", () => {
    expect(formatAppVersionLabel("dev")).toBe(`v${APP_VERSION}`);
  });
});
