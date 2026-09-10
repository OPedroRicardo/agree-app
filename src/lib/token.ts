/**
 * O JWT da sessão. Persistido em `localStorage` (mesmo padrão de `theme.ts` e
 * `voice-settings.ts`) e enviado explicitamente pelo app: como header
 * `Authorization: Bearer` no REST (`api.ts`) e no campo `auth` do handshake
 * do socket.io (`socket.ts`).
 *
 * Por que na mão, se o backend também manda um cookie httpOnly: o app roda em
 * `http://tauri.localhost` (ou `http://localhost:3001` no dev do Vite) contra
 * um backend em outra origem, então aquele cookie é *cross-site*. Com o
 * `SameSite=Lax` que o backend usa, o browser nem chega a gravá-lo na resposta
 * do login — e trocar para `SameSite=None` só o deixaria à mercê do bloqueio
 * de cookies de terceiros. Carregar o token aqui não depende de nenhuma
 * política de cookie.
 */

const STORAGE_KEY = 'agree:token';

// Espelho em memória: todo request REST e todo (re)connect de socket leem isto,
// e `localStorage` é síncrono — mas não de graça.
let current: string | null = readFromStorage();

function readFromStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** O token da sessão atual, ou `null` se não houver sessão. */
export function getToken(): string | null {
  return current;
}

/** Grava o token da sessão — chamado pelo `login` de `api.ts`. */
export function setToken(token: string) {
  current = token;
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage indisponível: a sessão ainda vale enquanto o app estiver aberto,
    // só não sobrevive a um restart.
  }
}

/** Descarta o token — logout ou sessão expirada. */
export function clearToken() {
  current = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // O espelho em memória já foi limpo, que é o que corta a sessão agora.
  }
}
