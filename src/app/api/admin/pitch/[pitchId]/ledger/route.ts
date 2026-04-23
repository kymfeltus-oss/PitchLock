import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
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

  const [{ data: sigs }, { data: revs }, { data: daRows }] = await Promise.all([
    admin.from('nda_signatures').select('email, created_at').eq('pitch_id', pitchId).order('created_at', { ascending: true }),
    admin.from('investor_access_revocations').select('email, created_at').eq('pitch_id', pitchId),
    admin.from('deck_analytics').select('investor_email, updated_at').eq('pitch_id', pitchId),
  ]);

  const lastDeck = new Map<string, string>();
  for (const row of Array.isArray(daRows) ? daRows : []) {
    const r = row as { investor_email?: string; updated_at?: string };
    const em = typeof r.investor_email === 'string' ? r.investor_email.toLowerCase() : '';
    const u = typeof r.updated_at === 'string' ? r.updated_at : '';
    if (!em || !u) continue;
    const prev = lastDeck.get(em);
    if (!prev || prev < u) lastDeck.set(em, u);
  }

  const revoked = new Set(
    (Array.isArray(revs) ? revs : []).map((x: { email?: string }) => String(x.email || '').toLowerCase()).filter(Boolean),
  );

  const byEmail = new Map<
    string,
    { email: string; signedAt: string | null; lastDeckActivity: string | null; revoked: boolean }
  >();

  for (const s of Array.isArray(sigs) ? sigs : []) {
    const row = s as { email?: string; created_at?: string };
    const email = typeof row.email === 'string' ? row.email.toLowerCase() : '';
    if (!email) continue;
    const signedAt = typeof row.created_at === 'string' ? row.created_at : null;
    const cur = byEmail.get(email);
    if (!cur) {
      byEmail.set(email, {
        email,
        signedAt,
        lastDeckActivity: lastDeck.get(email) ?? null,
        revoked: revoked.has(email),
      });
    }
  }

  for (const [email, ts] of lastDeck.entries()) {
    const cur = byEmail.get(email);
    if (cur) {
      if (!cur.lastDeckActivity || cur.lastDeckActivity < ts) cur.lastDeckActivity = ts;
    } else {
      byEmail.set(email, { email, signedAt: null, lastDeckActivity: ts, revoked: revoked.has(email) });
    }
  }

  for (const em of revoked) {
    if (!byEmail.has(em)) {
      byEmail.set(em, { email: em, signedAt: null, lastDeckActivity: lastDeck.get(em) ?? null, revoked: true });
    }
  }

  for (const [em, cur] of byEmail.entries()) {
    if (revoked.has(em)) cur.revoked = true;
  }

  const rows = Array.from(byEmail.values()).sort((a, b) => (b.lastDeckActivity || b.signedAt || '').localeCompare(a.lastDeckActivity || a.signedAt || ''));

  return NextResponse.json({ ok: true, rows });
}
