import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { FOUNDER_SESSION_COOKIE, investorPitchCookieName } from '@/lib/pitch-cookies';

const issuer = 'pitch-portal';

function secret(): Uint8Array | null {
  const s = process.env.SESSION_JWT_SECRET?.trim();
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

async function verifyInvestorCookie(pitchId: string, raw: string | undefined): Promise<boolean> {
  const k = secret();
  if (!k || !raw) return false;
  try {
    const { payload } = await jwtVerify(raw, k, { issuer, audience: 'investor' });
    return String(payload.pitch_id || '') === pitchId;
  } catch {
    return false;
  }
}

async function verifyFounderCookie(raw: string | undefined): Promise<boolean> {
  const k = secret();
  if (!k || !raw) return false;
  try {
    await jwtVerify(raw, k, { issuer, audience: 'founder' });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const p = req.nextUrl.pathname;

  if (p.startsWith('/pitch') || p.startsWith('/admin')) {
    res.headers.set('X-Frame-Options', 'SAMEORIGIN');
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  const pitchProtected = p.match(/^\/pitch\/([^/]+)\/(start|room|portal)$/);
  if (pitchProtected) {
    const pitchId = pitchProtected[1];
    const segment = pitchProtected[2];
    const inv = req.cookies.get(investorPitchCookieName(pitchId))?.value;
    const okInvestor = await verifyInvestorCookie(pitchId, inv);
    if (segment === 'start' || segment === 'portal') {
      if (!okInvestor) {
        return NextResponse.redirect(new URL(`/pitch/${pitchId}/gate`, req.url));
      }
      return res;
    }
    if (segment === 'room') {
      const founder = req.cookies.get(FOUNDER_SESSION_COOKIE)?.value;
      const okFounder = await verifyFounderCookie(founder);
      if (okInvestor || okFounder) return res;
      return NextResponse.redirect(new URL(`/pitch/${pitchId}/gate`, req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/pitch/:path*', '/admin/:path*'],
};
