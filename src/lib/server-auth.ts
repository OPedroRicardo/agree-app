import { cookies } from 'next/headers';

/** Base URL of the Agree NestJS backend. Server-only — never sent to the browser. */
export const BACKEND_URL = process.env.AGREE_BACKEND_URL ?? 'http://localhost:3000';

/** Name of the httpOnly cookie holding the JWT. Must match `agree_token` read by the backend's WS `AuthGuard`. */
export const TOKEN_COOKIE = 'agree_token';

/** Reads the JWT from the httpOnly cookie, if present. */
export async function getTokenCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value;
}

/** Sets the httpOnly session cookie. `maxAgeSeconds` should match the backend's JWT `expiresIn`. */
export async function setTokenCookie(token: string, maxAgeSeconds: number) {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/** Clears the session cookie (sign-out). */
export async function clearTokenCookie() {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
}
