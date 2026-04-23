import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { investorPitchCookieName } from '@/lib/pitch-cookies';
import { isInvestorRevoked } from '@/lib/investor-revocation';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { pitchId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const jar = await cookies();
  const raw = jar.get(investorPitchCookieName(pitchId))?.value;
  if (!raw) return NextResponse.json({ ok: false, error: 'no_session' }, { status: 401 });

  let email: string;
  try {
    const v = await verifyInvestorPitchJwt(raw);
    if (v.pitch_id !== pitchId) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    email = v.email;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_session' }, { status: 401 });
  }

  if (await isInvestorRevoked(admin, pitchId, email)) {
    return NextResponse.json({ ok: false, error: 'revoked' }, { status: 403 });
  }

  const bundle = await fetchPitchBundleById(admin, pitchId);
  const path = bundle?.pitch.deck_pdf_storage_path?.trim();
  if (!path) {
    return NextResponse.json({ ok: false, error: 'no_deck_asset' }, { status: 404 });
  }

  const { data: signed, error } = await admin.storage.from('pitch-decks').createSignedUrl(path, 3600);
  if (error || !signed?.signedUrl) {
    console.error('[deck/asset-url]', error?.message);
    return NextResponse.json({ ok: false, error: 'sign_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
