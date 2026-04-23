import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { investorPitchCookieName } from '@/lib/pitch-cookies';
import { isInvestorRevoked } from '@/lib/investor-revocation';
import { verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string; assetId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { pitchId, assetId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const jar = await cookies();
  const raw = jar.get(investorPitchCookieName(pitchId))?.value;
  if (!raw) return NextResponse.json({ ok: false, error: 'no_session' }, { status: 401 });

  let email: string;
  try {
    const v = await verifyInvestorPitchJwt(raw);
    if (v.pitch_id !== pitchId) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    email = v.email.toLowerCase();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_session' }, { status: 401 });
  }

  if (await isInvestorRevoked(admin, pitchId, email)) {
    return NextResponse.json({ ok: false, error: 'revoked' }, { status: 403 });
  }

  const { data: asset, error } = await admin
    .from('pitch_assets')
    .select('id, pitch_id, storage_path, restricted')
    .eq('id', assetId)
    .eq('pitch_id', pitchId)
    .maybeSingle();

  if (error || !asset?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const path = typeof asset.storage_path === 'string' ? asset.storage_path.trim() : '';
  if (!path) return NextResponse.json({ ok: false, error: 'no_file' }, { status: 404 });

  if (Boolean(asset.restricted)) {
    const { data: g } = await admin
      .from('pitch_asset_investor_access')
      .select('can_view')
      .eq('asset_id', assetId)
      .eq('investor_email', email)
      .maybeSingle();
    if (!g?.can_view) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const signed = await admin.storage.from('pitch-decks').createSignedUrl(path, 3600);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ ok: false, error: 'sign_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.data.signedUrl });
}
