import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Body = { email?: string; canView?: boolean };
type Ctx = { params: Promise<{ pitchId: string; assetId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { pitchId, assetId } = await ctx.params;
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

  const { data: asset } = await admin.from('pitch_assets').select('id').eq('id', assetId).eq('pitch_id', pitchId).maybeSingle();
  if (!asset?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email.includes('@')) return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  const canView = Boolean(body.canView);

  const up = await admin.from('pitch_asset_investor_access').upsert(
    { asset_id: assetId, investor_email: email, can_view: canView },
    { onConflict: 'asset_id,investor_email' },
  );

  if (up.error) {
    console.error('[asset/access]', up.error.message);
    return NextResponse.json({ ok: false, error: 'persist_failed' }, { status: 500 });
  }

  await admin.from('pitch_assets').update({ restricted: true }).eq('id', assetId);

  return NextResponse.json({ ok: true });
}
