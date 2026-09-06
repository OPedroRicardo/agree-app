import { NextResponse } from 'next/server';
import { BACKEND_URL, getTokenCookie } from '@/lib/server-auth';

/** Proxies `GET /auth/profile`, reading the JWT from the httpOnly cookie. */
export async function GET() {
  const token = await getTokenCookie();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const res = await fetch(`${BACKEND_URL}/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await res.json().catch(() => null);
  return NextResponse.json(body, { status: res.status });
}
