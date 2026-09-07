import { io, type Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_CHAT_WS_URL ?? 'http://localhost:4040';

/**
 * Builds a socket.io client for `ChatGateway` (`/chat`, port 4040).
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
