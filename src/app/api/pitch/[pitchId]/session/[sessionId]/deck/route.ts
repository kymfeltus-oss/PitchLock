import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE, investorPitchCookieName } from '@/lib/pitch-cookies';
import { isInvestorRevoked } from '@/lib/investor-revocation';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt, verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string; sessionId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { pitchId, sessionId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }

  const jar = await cookies();
  const raw = jar.get(investorPitchCookieName(pitchId))?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: 'no_session' }, { status: 401 });
  }

  let claims;
  try {
    claims = await verifyInvestorPitchJwt(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_session' }, { status: 401 });
  }

  if (claims.pitch_id !== pitchId || claims.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'session_mismatch' }, { status: 403 });
  }

  if (await isInvestorRevoked(admin, pitchId, claims.email)) {
    return NextResponse.json({ ok: false, error: 'revoked' }, { status: 403 });
  }

  const sess = await admin
    .from('pitch_sessions')
    .select('id, pitch_id')
    .eq('id', sessionId)
    .eq('pitch_id', pitchId)
    .maybeSingle();

  if (sess.error || !sess.data) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const { data: row } = await admin.from('pitch_deck_state').select('slide_index, updated_at').eq('session_id', sessionId).maybeSingle();

  return NextResponse.json({
    ok: true,
    slideIndex: typeof row?.slide_index === 'number' ? row.slide_index : 0,
    updatedAt: row?.updated_at ?? null,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { pitchId, sessionId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }

  const jar = await cookies();
  const founderRaw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  if (!founderRaw) {
    return NextResponse.json({ ok: false, error: 'founder_required' }, { status: 401 });
  }

  let founder: { workspace_id: string };
  try {
    founder = await verifyFounderJwt(founderRaw);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_founder' }, { status: 401 });
  }

  const bundle = await fetchPitchBundleById(admin, pitchId);
  if (!bundle || bundle.pitch.workspace_id !== founder.workspace_id) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const sess = await admin
    .from('pitch_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('pitch_id', pitchId)
    .maybeSingle();

  if (sess.error || !sess.data) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  let body: { slideIndex?: number };
  try {
    body = (await req.json()) as { slideIndex?: number };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const slideIndex = typeof body.slideIndex === 'number' ? Math.floor(body.slideIndex) : NaN;
  if (!Number.isFinite(slideIndex) || slideIndex < 0 || slideIndex > 9999) {
    return NextResponse.json({ ok: false, error: 'invalid_slide' }, { status: 400 });
  }

  const up = await admin
    .from('pitch_deck_state')
    .upsert({ session_id: sessionId, slide_index: slideIndex, updated_at: new Date().toISOString() })
    .select('slide_index')
    .single();

  if (up.error) {
    console.error('[deck] post', up.error.message);
    return NextResponse.json({ ok: false, error: 'persist_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, slideIndex: up.data?.slide_index ?? slideIndex });
}
