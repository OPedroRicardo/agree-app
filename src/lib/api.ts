import type { AgreeChannel, AgreeServer, ChatMessage, LoggedUser } from './types';

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
 * Shared `fetch` wrapper for the Agree backend. `credentials: 'include'`
 * makes the browser send the httpOnly `agree_token` cookie set by
 * `POST /auth/login` — the app never handles the JWT directly.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
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

/** `POST /auth/login`. `login` is a username or email. */
export function login(login: string, password: string) {
  return request<{ ok: true }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  });
}

/** `GET /auth/profile`. */
export function getProfile() {
  return request<LoggedUser>('/auth/profile');
}

/** `POST /auth/logout` — clears the session cookie. */
export function logout() {
  return request<{ ok: true }>('/auth/logout', { method: 'POST' });
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

/** `GET /chat/:channelId`. `channelId` is an `AgreeChannel._id`. */
export function listChannelMessages(channelId: string, limit = 50) {
  return request<ChatMessage[]>(`/chat/${channelId}?limit=${limit}`);
}
