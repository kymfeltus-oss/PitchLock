import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const res = NextResponse.redirect(new URL('/admin/login', origin));
  res.cookies.set(FOUNDER_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
