/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CONTACT_EMAIL?: string;
  readonly VITE_CONTACT_PHONE?: string;
  readonly VITE_CONTACT_ZALO?: string;
  readonly VITE_CONTACT_ADDRESS?: string;
  readonly VITE_CONTACT_MAP_QUERY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
