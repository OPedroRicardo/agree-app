import { NextResponse } from 'next/server';
import { BACKEND_URL, setTokenCookie } from '@/lib/server-auth';

/** Matches the backend's `auth.module.ts` JWT `expiresIn: '7d'`. */
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * Proxies `POST /auth/login` to the backend and, on success, stores the JWT
 * in an httpOnly cookie instead of returning it to the browser. The client
 * never sees the token — see `TODO.md` for why the WS gateway can still
 * read it (cookie forwarded on the handshake).
 */
export async function POST(request: Request) {
  const body = await request.json();

  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => null);
    return NextResponse.json(error ?? { message: 'Login failed' }, { status: res.status });
  }

  const { access_token } = await res.json();
  await setTokenCookie(access_token, TOKEN_MAX_AGE_SECONDS);

  return NextResponse.json({ ok: true });
}
