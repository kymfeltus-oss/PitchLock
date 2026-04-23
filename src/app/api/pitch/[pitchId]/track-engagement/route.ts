import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { investorPitchCookieName } from '@/lib/pitch-cookies';
import { isInvestorRevoked } from '@/lib/investor-revocation';
import { persistPitchIntelligenceBatch, type PitchIntelligenceBatch } from '@/lib/pitch-intelligence-persist';
import { verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string }> };

/** Batched ghost-mode engagement (same persistence as /intelligence; 15s client cadence). */
export async function POST(req: Request, ctx: Ctx) {
  const { pitchId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const jar = await cookies();
  const raw = jar.get(investorPitchCookieName(pitchId))?.value;
  if (!raw) return NextResponse.json({ ok: false, error: 'no_session' }, { status: 401 });

  let claims: { pitch_id: string; session_id: string; email: string };
  try {
    const v = await verifyInvestorPitchJwt(raw);
    claims = { pitch_id: v.pitch_id, session_id: v.session_id, email: v.email };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_session' }, { status: 401 });
  }

  if (claims.pitch_id !== pitchId) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  if (await isInvestorRevoked(admin, pitchId, claims.email)) {
    return NextResponse.json({ ok: false, error: 'revoked' }, { status: 403 });
  }

  let body: PitchIntelligenceBatch;
  try {
    body = (await req.json()) as PitchIntelligenceBatch;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const r = await persistPitchIntelligenceBatch(
    admin,
    { pitchId, sessionId: claims.session_id, emailLower: claims.email.toLowerCase() },
    body,
  );

  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
