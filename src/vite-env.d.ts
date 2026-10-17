// Build-time settings Vite bakes into the client (`VITE_*` environment variables).
interface ImportMetaEnv {
  /** The relay for self-hosted online play (server/README.md); unset on claude.ai. */
  readonly VITE_WS_URL?: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
