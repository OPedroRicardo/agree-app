import { NextResponse, type NextRequest } from 'next/server';
import { BACKEND_URL, getTokenCookie } from '@/lib/server-auth';

/** Proxies `GET /chat/:channelId`, forwarding the `limit`/`before` query params as-is. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/chat/[channelId]'>,
) {
  const token = await getTokenCookie();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { channelId } = await ctx.params;
  const query = request.nextUrl.search;

  const res = await fetch(`${BACKEND_URL}/chat/${channelId}${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await res.json().catch(() => null);
  return NextResponse.json(body, { status: res.status });
}
