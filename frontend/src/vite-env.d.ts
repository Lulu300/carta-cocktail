/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Release version without the leading "v" (e.g. "1.8.0"), or "dev". Set by frontend/Dockerfile. */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
