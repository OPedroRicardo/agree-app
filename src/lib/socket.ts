import { io, type Socket } from 'socket.io-client';

// `ChatGateway` has no port of its own — it shares the backend's HTTP port
// (see agree's CLAUDE.md: "gateways share the HTTP port"), so this defaults
// to the same origin as the REST API. `WS_URL` still overrides it
// for a setup that fronts them differently.
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  import.meta.env.VITE_API_URL ??
  'http://localhost:3000';

/**
 * Builds a socket.io client for `ChatGateway` (`/chat`).
 * `withCredentials: true` makes the browser attach the httpOnly session
 * cookie to the handshake — the backend's `AuthGuard` reads it from there
 * (see `TODO.md`). `autoConnect: false` — caller connects it.
 */
export function createChatSocket(): Socket {
  return io(`${WS_URL}/chat`, {
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket'],
  });
}

/**
 * Builds a socket.io client for `VoiceGateway` (`/voice`). Same `Manager`
 * (same URL) as the chat socket, so socket.io reuses the underlying
 * connection — see `docs/voice-client.md`.
 */
export function createVoiceSocket(): Socket {
  return io(`${WS_URL}/voice`, {
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket'],
  });
}
