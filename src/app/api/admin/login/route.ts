import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { signFounderSession } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Body = { workspaceSlug?: string; password?: string };

export async function POST(req: Request) {
  const expected = process.env.ADMIN_DEV_PASSWORD?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'admin_login_disabled' }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const slug = typeof body.workspaceSlug === 'string' ? body.workspaceSlug.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!slug || password !== expected) {
    return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }

  const { data: ws, error } = await admin.from('workspaces').select('id').eq('slug', slug).maybeSingle();
  if (error || !ws?.id) {
    return NextResponse.json({ ok: false, error: 'workspace_not_found' }, { status: 404 });
  }

  let token: string;
  try {
    token = await signFounderSession(ws.id as string);
  } catch (e) {
    console.error('[admin/login] jwt', e);
    return NextResponse.json({ ok: false, error: 'session_token_misconfigured' }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, workspaceSlug: slug });
  res.cookies.set(FOUNDER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  return res;
}
