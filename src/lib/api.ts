import type { AgreeServer, ChatMessage, LoggedUser } from './types';

/** Thrown by {@link request} for any non-2xx response; `status` is the HTTP status code. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Shared `fetch` wrapper for this app's own `/api/*` Route Handlers (which
 * proxy to the Agree backend and attach the JWT from the httpOnly cookie
 * server-side — the browser never handles the token directly).
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

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

/** `POST /api/auth/login` → backend `POST /auth/login`. `login` is a username or email. */
export function login(login: string, password: string) {
  return request<{ ok: true }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  });
}

/** `GET /api/auth/me` → backend `GET /auth/profile`. */
export function getProfile() {
  return request<LoggedUser>('/api/auth/me');
}

/** `POST /api/auth/logout` — clears the session cookie. */
export function logout() {
  return request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
}

/** `GET /api/servers` → backend `GET /server`. */
export function listServers() {
  return request<AgreeServer[]>('/api/servers');
}

/** `POST /api/servers` → backend `POST /server`. */
export function createServer(
  data: Pick<AgreeServer, 'name' | 'description' | 'logoImg' | 'bannerImage'>,
) {
  return request<AgreeServer>('/api/servers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** `GET /api/chat/:channelId` → backend `GET /chat/:channelId`. `channelId` is an `AgreeServer._id`. */
export function listChannelMessages(channelId: string, limit = 50) {
  return request<ChatMessage[]>(`/api/chat/${channelId}?limit=${limit}`);
}
