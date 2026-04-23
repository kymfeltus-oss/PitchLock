import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE, investorPitchCookieName } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt, verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string; sessionId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { pitchId, sessionId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const jar = await cookies();
  const invRaw = jar.get(investorPitchCookieName(pitchId))?.value;
  const founderRaw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  let authorized = false;
  if (invRaw) {
    try {
      const v = await verifyInvestorPitchJwt(invRaw);
      if (v.pitch_id === pitchId && v.session_id === sessionId) authorized = true;
    } catch {
      authorized = false;
    }
  }
  if (!authorized && founderRaw) {
    try {
      const f = await verifyFounderJwt(founderRaw);
      const bundle = await fetchPitchBundleById(admin, pitchId);
      if (bundle && bundle.pitch.workspace_id === f.workspace_id) authorized = true;
    } catch {
      authorized = false;
    }
  }
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { data: sess } = await admin
    .from('pitch_sessions')
    .select('host_present_at')
    .eq('id', sessionId)
    .eq('pitch_id', pitchId)
    .maybeSingle();

  const hostPresent = Boolean(sess?.host_present_at);
  return NextResponse.json({ ok: true, hostPresent });
}

export async function POST(req: Request, ctx: Ctx) {
  const { pitchId, sessionId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const jar = await cookies();
  const founderRaw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  if (!founderRaw) return NextResponse.json({ ok: false, error: 'founder_required' }, { status: 401 });

  let founderWs: string;
  try {
    founderWs = (await verifyFounderJwt(founderRaw)).workspace_id;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_founder' }, { status: 401 });
  }

  const bundle = await fetchPitchBundleById(admin, pitchId);
  if (!bundle || bundle.pitch.workspace_id !== founderWs) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const sess = await admin.from('pitch_sessions').select('id').eq('id', sessionId).eq('pitch_id', pitchId).maybeSingle();
  if (!sess.data?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  let present = true;
  try {
    const b = (await req.json()) as { present?: boolean };
    if (b.present === false) present = false;
  } catch {
    present = true;
  }

  const up = await admin
    .from('pitch_sessions')
    .update({ host_present_at: present ? new Date().toISOString() : null })
    .eq('id', sessionId);

  if (up.error) {
    return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, hostPresent: present });
}
