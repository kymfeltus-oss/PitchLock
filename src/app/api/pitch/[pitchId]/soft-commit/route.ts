import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { investorPitchCookieName } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { isInvestorRevoked } from '@/lib/investor-revocation';
import { buildSoftInterestPdfBuffer } from '@/lib/soft-interest-pdf';
import { sendSoftInterestFounderEmail } from '@/lib/send-soft-interest-email';
import { verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Body = { commitmentAmount?: string; valueAddNotes?: string; deckCoverageRatio?: number };

type Ctx = { params: Promise<{ pitchId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { pitchId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const jar = await cookies();
  const raw = jar.get(investorPitchCookieName(pitchId))?.value;
  if (!raw) return NextResponse.json({ ok: false, error: 'no_session' }, { status: 401 });

  let claims: { email: string; nda_id: string; pitch_id: string };
  try {
    const v = await verifyInvestorPitchJwt(raw);
    claims = { email: v.email, nda_id: v.nda_id, pitch_id: v.pitch_id };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_session' }, { status: 401 });
  }

  if (claims.pitch_id !== pitchId) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  if (await isInvestorRevoked(admin, pitchId, claims.email)) {
    return NextResponse.json({ ok: false, error: 'revoked' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const coverage = Number(body.deckCoverageRatio);
  if (!Number.isFinite(coverage) || coverage < 0.69) {
    return NextResponse.json({ ok: false, error: 'deck_not_engaged_enough' }, { status: 400 });
  }

  const amtRaw = typeof body.commitmentAmount === 'string' ? body.commitmentAmount.trim() : '';
  const notes = typeof body.valueAddNotes === 'string' ? body.valueAddNotes.trim().slice(0, 4000) : '';
  if (amtRaw.length < 1 || notes.length < 3) {
    return NextResponse.json({ ok: false, error: 'invalid_fields' }, { status: 400 });
  }

  const bundle = await fetchPitchBundleById(admin, pitchId);
  if (!bundle) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const founderEmail =
    bundle.workspace.contact_email?.trim() ||
    process.env.NEXT_PUBLIC_INVESTOR_CONTACT_EMAIL?.trim() ||
    process.env.OWNER_ALERT_EMAIL?.trim();

  const signedAtUtc = new Date().toISOString();
  const pdf = await buildSoftInterestPdfBuffer({
    pitchTitle: bundle.pitch.title,
    investorEmail: claims.email,
    commitmentAmount: amtRaw,
    valueAddNotes: notes,
    ndaSignatureId: claims.nda_id,
    signedAtUtc,
  });

  const path = `${pitchId}/soft-interest/${Date.now()}-${claims.email.replace(/[^a-z0-9@._-]+/gi, '-')}.pdf`;
  const up = await admin.storage.from('pitch-decks').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (up.error) {
    console.error('[soft-commit] upload', up.error.message);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  const amountNum = Number(amtRaw.replace(/[^0-9.-]+/g, ''));
  const ins = await admin.from('pitch_soft_interests').insert({
    pitch_id: pitchId,
    investor_email: claims.email.toLowerCase(),
    commitment_amount: Number.isFinite(amountNum) ? amountNum : null,
    value_add_notes: notes,
    nda_signature_id: claims.nda_id,
    summary_pdf_storage_path: path,
  });

  if (ins.error) {
    console.error('[soft-commit] db', ins.error.message);
    return NextResponse.json({ ok: false, error: 'persist_failed' }, { status: 500 });
  }

  if (founderEmail) {
    const brand = process.env.NEXT_PUBLIC_LEGAL_BRAND_NAME?.trim() || bundle.workspace.name;
    void sendSoftInterestFounderEmail({
      founderEmail,
      brandName: brand,
      investorEmail: claims.email,
      commitmentLabel: amtRaw,
      pdfBase64: pdf.toString('base64'),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
