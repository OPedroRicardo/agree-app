import { clearToken, getToken, setToken } from './token';
import type {
  AgreeChannel,
  AgreeConversation,
  AgreeServer,
  AgreeUser,
  ChatMessage,
  LoggedUser,
} from './types';

/** Base URL of the Agree NestJS backend. */
const BACKEND_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Thrown by {@link request} for any non-2xx response. `status: 0` means `fetch` itself failed (backend unreachable). */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Shared `fetch` wrapper for the Agree backend. Autentica com o JWT de
 * `token.ts` no header `Authorization: Bearer` — o guard do backend lê esse
 * header antes de tentar o cookie. `credentials: 'include'` fica por conta do
 * caso same-site (o backend também seta um cookie httpOnly no login), mas não
 * é dele que a sessão depende aqui; veja o porquê em `token.ts`.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao backend do Agree.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      (body && (body.message as string)) || `Erro ${res.status} em ${path}`,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** `GET /health`. Never throws — resolves `true`/`false`, for polling until the backend comes back. */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** `POST /auth/login`. `login` is a username or email. Guarda o token devolvido — é o que autentica todo request e todo socket daí em diante. */
export async function login(login: string, password: string) {
  const res = await request<{ ok: true; access_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  });

  // Um backend anterior a esta mudança responde `{ ok: true }` e mais nada.
  // Sem esta guarda o app guardaria `undefined` como token e só descobriria no
  // 401 do `/auth/profile` logo em seguida — erro muito mais difícil de ligar
  // à causa do que uma falha aqui.
  if (!res.access_token) {
    throw new ApiError(
      500,
      'O backend não devolveu um token de sessão. Ele precisa estar em uma versão que inclua `access_token` na resposta do login.',
    );
  }

  setToken(res.access_token);
  return res;
}

/** `GET /auth/profile`. */
export function getProfile() {
  return request<LoggedUser>('/auth/profile');
}

/**
 * `POST /auth/logout`. Nunca rejeita: quem encerra a sessão é o `clearToken`
 * local, então um backend fora do ar não pode prender o usuário logado. A
 * chamada em si só existe para limpar o cookie do lado same-site.
 */
export async function logout(): Promise<void> {
  try {
    await request<{ ok: true }>('/auth/logout', { method: 'POST' });
  } catch {
    // Ignorado de propósito — ver acima.
  } finally {
    clearToken();
  }
}

/** `GET /server`. */
export function listServers() {
  return request<AgreeServer[]>('/server');
}

/** `POST /server`. */
export function createServer(
  data: Pick<AgreeServer, 'name' | 'description' | 'logoImg' | 'bannerImage'>,
) {
  return request<AgreeServer>('/server', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** `GET /server/:serverId/channel`. */
export function listChannels(serverId: string) {
  return request<AgreeChannel[]>(`/server/${serverId}/channel`);
}

/** `POST /server/:serverId/channel`. */
export function createChannel(
  serverId: string,
  data: Pick<AgreeChannel, 'name' | 'type'>,
) {
  return request<AgreeChannel>(`/server/${serverId}/channel`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** `GET /chat/:channelId`. `channelId` is an `AgreeChannel._id`. `before` (ISO 8601) pages further into the history. */
export function listChannelMessages(channelId: string, limit = 50, before?: string) {
  const query = before ? `limit=${limit}&before=${encodeURIComponent(before)}` : `limit=${limit}`;
  return request<ChatMessage[]>(`/chat/${channelId}?${query}`);
}

/** `GET /server/:serverId/members`. Public fields only, same shape as `GET /users`. */
export function listServerMembers(serverId: string) {
  return request<AgreeUser[]>(`/server/${serverId}/members`);
}

/** `POST /server/:serverId/members`. Owner-only — the backend 403s otherwise. */
export function addServerMember(serverId: string, userId: string) {
  return request<void>(`/server/${serverId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

/** `DELETE /server/:serverId/members/:userId`. Owner-only, and the owner can't remove themselves — the backend 400s that. */
export function removeServerMember(serverId: string, userId: string) {
  return request<void>(`/server/${serverId}/members/${userId}`, {
    method: 'DELETE',
  });
}

/** `GET /users`. Everyone except the caller — the picker for starting a DM. */
export function listUsers() {
  return request<AgreeUser[]>('/users');
}

/** `GET /chat/conversations`. The caller's dm/group conversations, newest first. */
export function listConversations() {
  return request<AgreeConversation[]>('/chat/conversations');
}

/** `GET /chat/conversations/:conversationId`. `before` (ISO 8601) pages further into the history. */
export function listConversationMessages(conversationId: string, limit = 50, before?: string) {
  const query = before ? `limit=${limit}&before=${encodeURIComponent(before)}` : `limit=${limit}`;
  return request<ChatMessage[]>(`/chat/conversations/${conversationId}?${query}`);
}
