import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Body = { url?: string | null };
type Ctx = { params: Promise<{ pitchId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { pitchId } = await ctx.params;
  const jar = await cookies();
  const founderRaw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  if (!founderRaw) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let founderWs: string;
  try {
    founderWs = (await verifyFounderJwt(founderRaw)).workspace_id;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_founder' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const bundle = await fetchPitchBundleById(admin, pitchId);
  if (!bundle || bundle.pitch.workspace_id !== founderWs) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const raw = typeof body.url === 'string' ? body.url.trim() : '';
  const url = raw.length === 0 ? null : raw.startsWith('https://') ? raw.slice(0, 2000) : null;
  if (raw.length > 0 && url == null) {
    return NextResponse.json({ ok: false, error: 'https_only' }, { status: 400 });
  }

  const { error } = await admin.from('pitches').update({ preview_embed_url: url }).eq('id', pitchId);
  if (error) {
    console.error('[admin/preview-url]', error.message);
    return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
