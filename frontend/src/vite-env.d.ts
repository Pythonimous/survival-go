/// <reference types="vite/client" />
/// <reference types="vitest/config" />

interface ImportMetaEnv {
  /** Git revision or release tag baked in at build time for static asset cache busting. */
  readonly VITE_APP_BUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
