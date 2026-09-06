import { NextResponse } from 'next/server';
import { BACKEND_URL, getTokenCookie } from '@/lib/server-auth';

/** Proxies `GET /server`. */
export async function GET() {
  const token = await getTokenCookie();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const res = await fetch(`${BACKEND_URL}/server`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await res.json().catch(() => null);
  return NextResponse.json(body, { status: res.status });
}

/** Proxies `POST /server`. */
export async function POST(request: Request) {
  const token = await getTokenCookie();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const data = await request.json();

  const res = await fetch(`${BACKEND_URL}/server`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const body = await res.json().catch(() => null);
  return NextResponse.json(body, { status: res.status });
}
