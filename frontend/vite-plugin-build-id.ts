import type { Plugin } from "vite";

/**
 * Cache-bust unhashed bootstrap assets referenced from index.html.
 * Vite already content-hashes bundled JS/CSS; coi-serviceworker is copied
 * from public/ without a hash.
 */
export function buildIdIndexHtmlPlugin(buildId: string): Plugin {
  const trimmed = buildId.trim();
  return {
    name: "survival-build-id-index-html",
    transformIndexHtml(html) {
      if (!trimmed) {
        return html;
      }
      const query = `?v=${encodeURIComponent(trimmed)}`;
      return html.replace(
        'src="/coi-serviceworker.js"',
        `src="/coi-serviceworker.js${query}"`,
      );
    },
  };
}
