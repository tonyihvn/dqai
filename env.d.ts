interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_TINYMCE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
