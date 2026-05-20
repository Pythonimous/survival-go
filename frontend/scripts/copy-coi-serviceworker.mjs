/**
 * Copy `coi-serviceworker.js` from the installed package into `public/`
 * so it can be referenced from `index.html` as `/coi-serviceworker.js`.
 *
 * Why: Kaya's web app uses `coi-serviceworker` to guarantee
 * `crossOriginIsolated === true` in browsers — that's the prerequisite for
 * `SharedArrayBuffer` and therefore for ONNX Runtime Web's threaded WASM
 * workers. Survival Go relies on the same threaded backend, so we mirror
 * Kaya's bootstrap: header-based COOP/COEP first, with the service worker
 * as a safety net (e.g. CDNs / preview deployments that strip headers,
 * embedders that proxy the app, etc.).
 *
 * The published `coi-serviceworker` package exposes `coi-serviceworker.js`
 * (production) and `coi-serviceworker.min.js`. We ship the unminified file
 * for readability under DevTools; both are functionally identical.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const pkgDir = path.join(frontendRoot, "node_modules", "coi-serviceworker");
const candidateFiles = ["coi-serviceworker.js", "coi-serviceworker.min.js"];
const destDir = path.join(frontendRoot, "public");
const destFile = path.join(destDir, "coi-serviceworker.js");

async function findSource() {
  for (const name of candidateFiles) {
    const candidate = path.join(pkgDir, name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

async function main() {
  const source = await findSource();
  if (!source) {
    console.warn(
      "[copy-coi-serviceworker] coi-serviceworker not installed yet; skip " +
        "(run `npm install` in frontend/).",
    );
    process.exit(0);
  }

  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(source, destFile);
  console.log(
    `[copy-coi-serviceworker] copied ${path.basename(source)} -> public/coi-serviceworker.js`,
  );
}

main().catch((err) => {
  console.error("[copy-coi-serviceworker] failed:", err);
  process.exit(1);
});
