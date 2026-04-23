import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { investorPitchCookieName } from '@/lib/pitch-cookies';
import { isInvestorRevoked } from '@/lib/investor-revocation';
import { verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Body = { updates?: { pageIndex: number; deltaSeconds: number }[] };

type Ctx = { params: Promise<{ pitchId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { pitchId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const jar = await cookies();
  const raw = jar.get(investorPitchCookieName(pitchId))?.value;
  if (!raw) return NextResponse.json({ ok: false, error: 'no_session' }, { status: 401 });

  let claims: { pitch_id: string; email: string };
  try {
    const v = await verifyInvestorPitchJwt(raw);
    claims = { pitch_id: v.pitch_id, email: v.email };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_session' }, { status: 401 });
  }

  if (claims.pitch_id !== pitchId) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  if (await isInvestorRevoked(admin, pitchId, claims.email)) {
    return NextResponse.json({ ok: false, error: 'revoked' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0) {
    return NextResponse.json({ ok: true, applied: 0 });
  }

  const email = claims.email.toLowerCase();
  let applied = 0;

  for (const u of updates.slice(0, 40)) {
    const pageIndex = Math.floor(Number(u.pageIndex));
    const delta = Number(u.deltaSeconds);
    if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex > 500) continue;
    if (!Number.isFinite(delta) || delta <= 0 || delta > 120) continue;

    const { data: cur } = await admin
      .from('deck_analytics')
      .select('seconds_on_page')
      .eq('pitch_id', pitchId)
      .eq('investor_email', email)
      .eq('page_index', pageIndex)
      .maybeSingle();

    const prev = typeof cur?.seconds_on_page === 'number' ? cur.seconds_on_page : 0;
    const next = prev + delta;

    const up = await admin.from('deck_analytics').upsert(
      {
        pitch_id: pitchId,
        investor_email: email,
        page_index: pageIndex,
        seconds_on_page: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'pitch_id,investor_email,page_index' },
    );

    if (!up.error) applied += 1;
  }

  return NextResponse.json({ ok: true, applied });
}
