import { describe, expect, it } from "vitest";
import type { IndexHtmlTransformContext } from "vite";

import { buildIdIndexHtmlPlugin } from "../vite-plugin-build-id";

const indexHtmlCtx = {
  path: "/index.html",
  filename: "index.html",
} as IndexHtmlTransformContext;

function transformHtml(
  transform: NonNullable<ReturnType<typeof buildIdIndexHtmlPlugin>["transformIndexHtml"]>,
  html: string,
): string {
  if (typeof transform !== "function") {
    return html;
  }
  const out = transform(html, indexHtmlCtx);
  return typeof out === "string" ? out : html;
}

describe("buildIdIndexHtmlPlugin", () => {
  it("leaves index.html unchanged when build id is empty", () => {
    const plugin = buildIdIndexHtmlPlugin("");
    const transform = plugin.transformIndexHtml;
    expect(typeof transform).toBe("function");
    if (typeof transform !== "function") {
      return;
    }
    const html = '<script src="/coi-serviceworker.js"></script>';
    expect(transformHtml(transform, html)).toBe(html);
  });

  it("appends a cache-bust query to coi-serviceworker.js", () => {
    const plugin = buildIdIndexHtmlPlugin("abc123");
    const transform = plugin.transformIndexHtml;
    expect(typeof transform).toBe("function");
    if (typeof transform !== "function") {
      return;
    }
    const html = '<script src="/coi-serviceworker.js"></script>';
    expect(transformHtml(transform, html)).toContain(
      "/coi-serviceworker.js?v=abc123",
    );
  });
});
