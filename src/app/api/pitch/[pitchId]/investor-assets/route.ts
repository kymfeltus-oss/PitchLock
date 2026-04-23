import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { investorPitchCookieName } from '@/lib/pitch-cookies';
import { isInvestorRevoked } from '@/lib/investor-revocation';
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
    email = v.email.toLowerCase();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_session' }, { status: 401 });
  }

  if (await isInvestorRevoked(admin, pitchId, email)) {
    return NextResponse.json({ ok: false, error: 'revoked' }, { status: 403 });
  }

  const { data: assets, error } = await admin
    .from('pitch_assets')
    .select('id, slot_key, title, storage_path, restricted, sort_order')
    .eq('pitch_id', pitchId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[investor-assets]', error.message);
    return NextResponse.json({ ok: false, error: 'load_failed' }, { status: 500 });
  }

  const rows = Array.isArray(assets) ? assets : [];
  const { data: grants } = await admin.from('pitch_asset_investor_access').select('asset_id, can_view').eq('investor_email', email);

  const grantMap = new Map<string, boolean>();
  for (const g of Array.isArray(grants) ? grants : []) {
    const r = g as { asset_id?: string; can_view?: boolean };
    if (r.asset_id) grantMap.set(String(r.asset_id), Boolean(r.can_view));
  }

  const visible = rows
    .map((a: Record<string, unknown>) => {
      const id = String(a.id);
      const restricted = Boolean(a.restricted);
      const allowed = !restricted || grantMap.get(id) === true;
      return {
        id,
        slotKey: String(a.slot_key),
        title: String(a.title),
        hasFile: Boolean(a.storage_path && String(a.storage_path).trim()),
        restricted,
        allowed,
      };
    })
    .filter((x) => x.allowed);

  return NextResponse.json({ ok: true, assets: visible });
}
