import { NextResponse } from 'next/server';
import { clearTokenCookie } from '@/lib/server-auth';

/** Clears the session cookie. The backend has no logout endpoint to call. */
export async function POST() {
  await clearTokenCookie();
  return NextResponse.json({ ok: true });
}
