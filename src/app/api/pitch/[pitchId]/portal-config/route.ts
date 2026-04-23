import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { investorPitchCookieName } from '@/lib/pitch-cookies';
import { isInvestorRevoked } from '@/lib/investor-revocation';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string }> };

function safeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u.startsWith('https://')) return null;
  return u.slice(0, 2000);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { pitchId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const jar = await cookies();
  const raw = jar.get(investorPitchCookieName(pitchId))?.value;
  if (!raw) return NextResponse.json({ ok: false, error: 'no_session' }, { status: 401 });

  let email: string;
  let sessionId: string;
  try {
    const v = await verifyInvestorPitchJwt(raw);
    if (v.pitch_id !== pitchId) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    email = v.email;
    sessionId = v.session_id;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_session' }, { status: 401 });
  }

  if (await isInvestorRevoked(admin, pitchId, email)) {
    return NextResponse.json({ ok: false, error: 'revoked' }, { status: 403 });
  }

  const bundle = await fetchPitchBundleById(admin, pitchId);
  if (!bundle) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const yieldConfig =
    bundle.pitch.yield_config && typeof bundle.pitch.yield_config === 'object' ? bundle.pitch.yield_config : {};
  const preview = safeEmbedUrl(bundle.pitch.preview_embed_url);
  const hasPdf = Boolean(bundle.pitch.deck_pdf_storage_path?.trim());

  return NextResponse.json({
    ok: true,
    pitchTitle: bundle.pitch.title,
    sessionId,
    hasPdfDeck: hasPdf,
    yieldConfig,
    previewEmbedUrl: preview,
  });
}
