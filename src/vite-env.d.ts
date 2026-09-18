/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_CHAT_WS_URL?: string;
  /** Chave da API do GIPHY — liga a busca de GIFs no cadastro de emoji (`src/lib/gifs.ts`). */
  readonly VITE_GIPHY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
