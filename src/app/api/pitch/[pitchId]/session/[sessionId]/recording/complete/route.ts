import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string; sessionId: string }> };

/**
 * Recording pipeline stub: creates a `recordings` row pointing at a private storage key.
 * Production: run compositor / SFU egress, upload bytes, then update `storage_path` + `status`.
 */
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

  let ndaId: string | null = null;
  try {
    const b = (await req.json()) as { ndaSignatureId?: string };
    ndaId = typeof b.ndaSignatureId === 'string' ? b.ndaSignatureId : null;
  } catch {
    ndaId = null;
  }

  const storagePath = `recordings/${pitchId}/${sessionId}/${crypto.randomUUID()}.mp4`;

  const ins = await admin
    .from('recordings')
    .insert({
      pitch_session_id: sessionId,
      nda_signature_id: ndaId,
      storage_path: storagePath,
      duration_seconds: null,
      status: 'processing',
      meta: { stub: true, note: 'Replace with real encoder output + Supabase Storage upload' },
    })
    .select('id')
    .single();

  if (ins.error || !ins.data?.id) {
    console.error('[recording/complete]', ins.error?.message);
    return NextResponse.json({ ok: false, error: 'persist_failed' }, { status: 500 });
  }

  await admin.from('pitch_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', sessionId);

  return NextResponse.json({
    ok: true,
    recordingId: ins.data.id as string,
    storagePath,
    status: 'processing',
  });
}
