/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SUPABASE_TILES_BUCKET: string;
  readonly VITE_SUPABASE_TILES_PREFIX: string;
  readonly VITE_API_BASE: string;
  readonly VITE_REVENUECAT_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
