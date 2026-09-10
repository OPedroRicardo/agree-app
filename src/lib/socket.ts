import { io, type Socket } from 'socket.io-client';
import { getToken } from './token';

// `ChatGateway` has no port of its own — it shares the backend's HTTP port
// (see agree's CLAUDE.md: "gateways share the HTTP port"), so this defaults
// to the same origin as the REST API. `WS_URL` still overrides it
// for a setup that fronts them differently.
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  import.meta.env.VITE_API_URL ??
  'http://localhost:3000';

/**
 * Manda o JWT no handshake, pelo campo `auth` do socket.io — que viaja dentro
 * do pacote CONNECT do protocolo, não num header HTTP. Isso importa porque
 * `transports: ['websocket']` abaixo elimina o polling, e num upgrade
 * WebSocket nativo o browser não deixa setar header nenhum: `extraHeaders`
 * seria ignorado em silêncio. Do outro lado, `extractTokenFromSocket` lê
 * exatamente este campo, tanto no handshake (`WsAuthService`) quanto por
 * mensagem (`AuthGuard`).
 *
 * Função, e não objeto: o socket.io a re-executa a cada tentativa de
 * reconexão, então um token trocado no meio da sessão entra sozinho. Um
 * objeto congelaria o valor do instante em que o socket foi criado.
 */
const withAuth = (cb: (data: object) => void) => cb({ token: getToken() });

/**
 * Builds a socket.io client for `ChatGateway` (`/chat`).
 * `autoConnect: false` — caller connects it.
 */
export function createChatSocket(): Socket {
  return io(`${WS_URL}/chat`, {
    auth: withAuth,
    autoConnect: false,
    transports: ['websocket'],
  });
}

/**
 * Builds a socket.io client for `VoiceGateway` (`/voice`). Same `Manager`
 * (same URL) as the chat socket, so socket.io reuses the underlying
 * connection — see `docs/voice-client.md`. O `auth`, porém, é por socket e
 * não por `Manager`: precisa ser repetido aqui, senão só o chat autentica.
 */
export function createVoiceSocket(): Socket {
  return io(`${WS_URL}/voice`, {
    auth: withAuth,
    autoConnect: false,
    transports: ['websocket'],
  });
}
