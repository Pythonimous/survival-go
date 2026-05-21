import packageJson from "../../package.json";

/** Semver from frontend/package.json (display only). */
export const APP_VERSION = packageJson.version;

/** Human-readable version line for the UI (optional deploy build id). */
export function formatAppVersionLabel(buildId?: string): string {
  const label = `v${APP_VERSION}`;
  const id = (buildId ?? import.meta.env.VITE_APP_BUILD_ID ?? "").trim();
  if (id && id !== "dev") {
    return `${label} · ${id}`;
  }
  return label;
}
