import { NextResponse } from 'next/server';
import { invokeNdaAutomationEdge } from '@/lib/edge-nda-automation';
import { resolveLegalTemplateForPitch } from '@/lib/legal-templates';
import { investorPitchCookieName } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { buildPortalNdaPdfBuffer } from '@/lib/nda-pdf-portal';
import { sendNdaPortalEmails } from '@/lib/send-nda-portal-emails';
import { signInvestorPitchCookiePayload } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type ScrollMetrics = {
  scroll_max_depth_percent?: number;
  reached_document_end?: boolean;
  scroll_events?: unknown[] | null;
};

type Body = {
  full_name?: string;
  electronic_signature?: string;
  email_address?: string;
  /** Legacy field names (still accepted). */
  email?: string;
  printedName?: string;
  signature?: string;
  acknowledged?: boolean;
  scroll_metrics?: ScrollMetrics;
};

const INVESTOR_SESSION_SECONDS = 60 * 60 * 24;

function trim(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function namesMatchCaseInsensitive(fullName: string, signature: string): boolean {
  return normalizeName(fullName) === normalizeName(signature);
}

function requestOrigin(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  if (env) return env;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

type Ctx = { params: Promise<{ pitchId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { pitchId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }

  const bundle = await fetchPitchBundleById(admin, pitchId);
  if (!bundle) {
    return NextResponse.json({ ok: false, error: 'pitch_not_found' }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const fullName = trim(body.full_name ?? body.printedName, 200);
  const electronicSignature = trim(body.electronic_signature ?? body.signature, 200);
  const email = trim(body.email_address ?? body.email, 320).toLowerCase();

  if (!email.includes('@')) {
    return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  }
  if (fullName.length < 2) {
    return NextResponse.json({ ok: false, error: 'invalid_name' }, { status: 400 });
  }
  if (electronicSignature.length < 2) {
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 400 });
  }
  if (!namesMatchCaseInsensitive(fullName, electronicSignature)) {
    return NextResponse.json({ ok: false, error: 'signature_must_match_name' }, { status: 400 });
  }
  if (!body.acknowledged) {
    return NextResponse.json({ ok: false, error: 'must_acknowledge' }, { status: 400 });
  }

  const template = await resolveLegalTemplateForPitch(admin, bundle.pitch.nda_version);
  const docBody = template?.body?.trim() || bundle.pitch.nda_document_text?.trim() || 'NDA text is not configured.';
  const legalVersion = template?.version?.trim() || bundle.pitch.nda_version || 'unknown';

  const sm = body.scroll_metrics;
  const scrollMax = typeof sm?.scroll_max_depth_percent === 'number' ? Math.min(100, Math.max(0, Math.round(sm.scroll_max_depth_percent))) : 0;
  const reachedEnd = Boolean(sm?.reached_document_end);
  const scrollEvents = Array.isArray(sm?.scroll_events) ? sm.scroll_events : null;

  const forwarded = req.headers.get('x-forwarded-for');
  const clientIp = forwarded?.split(',')[0]?.trim()?.slice(0, 64) || null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 512) || null;
  const signedAtUtc = new Date().toISOString();

  const { data: ndaRow, error: ndaErr } = await admin
    .from('nda_signatures')
    .insert({
      pitch_id: pitchId,
      email,
      printed_name: fullName,
      signature_text: electronicSignature,
      document_snapshot: docBody,
      document_version: legalVersion,
      client_ip: clientIp,
      user_agent: userAgent,
    })
    .select('id')
    .single();

  if (ndaErr || !ndaRow?.id) {
    console.error('[nda/sign] nda_signatures', ndaErr?.message);
    return NextResponse.json({ ok: false, error: 'persist_failed' }, { status: 500 });
  }

  const ndaSignatureId = ndaRow.id as string;

  const { data: logRow, error: logErr } = await admin
    .from('nda_logs')
    .insert({
      pitch_id: pitchId,
      legal_template_version: legalVersion,
      full_name: fullName,
      email,
      ip_address: clientIp,
      user_agent: userAgent,
      signed_at: signedAtUtc,
      scroll_max_depth_percent: scrollMax,
      reached_document_end: reachedEnd,
      scroll_events: scrollEvents,
      nda_body_snapshot: docBody,
      nda_signature_id: ndaSignatureId,
    })
    .select('id, owner_review_token')
    .single();

  if (logErr || !logRow?.id) {
    console.error('[nda/sign] nda_logs', logErr?.message);
    return NextResponse.json({ ok: false, error: 'log_failed' }, { status: 500 });
  }

  const ndaLogId = logRow.id as string;
  const ownerReviewToken = String(logRow.owner_review_token || '');

  void invokeNdaAutomationEdge(ndaLogId).catch(() => {});

  const { data: sess, error: sessErr } = await admin
    .from('pitch_sessions')
    .insert({ pitch_id: pitchId, status: 'live' })
    .select('id')
    .single();

  if (sessErr || !sess?.id) {
    console.error('[nda/sign] session', sessErr?.message);
    return NextResponse.json({ ok: false, error: 'session_failed' }, { status: 500 });
  }

  const sessionId = sess.id as string;

  const deckIns = await admin.from('pitch_deck_state').insert({ session_id: sessionId, slide_index: 0 });
  if (deckIns.error) {
    console.error('[nda/sign] deck state', deckIns.error.message);
    return NextResponse.json({ ok: false, error: 'deck_init_failed' }, { status: 500 });
  }

  let token: string;
  try {
    token = await signInvestorPitchCookiePayload(pitchId, sessionId, ndaSignatureId, email, INVESTOR_SESSION_SECONDS);
  } catch (e) {
    console.error('[nda/sign] jwt', e);
    return NextResponse.json({ ok: false, error: 'session_token_misconfigured' }, { status: 500 });
  }

  const origin = requestOrigin(req);
  const heatmapUrl = `${origin}/nda-review/${ndaLogId}?t=${encodeURIComponent(ownerReviewToken)}`;
  const brandName =
    process.env.NEXT_PUBLIC_LEGAL_BRAND_NAME?.trim() || bundle.workspace.name || 'Your organization';
  const ownerEmail =
    bundle.workspace.contact_email?.trim() ||
    process.env.NEXT_PUBLIC_INVESTOR_CONTACT_EMAIL?.trim() ||
    process.env.OWNER_ALERT_EMAIL?.trim();

  let emailNote: string | null = null;
  if (ownerEmail) {
    try {
      const pdf = await buildPortalNdaPdfBuffer({
        documentSnapshot: docBody,
        legalVersion,
        fullName,
        email,
        electronicSignature,
        signedAtUtc,
        clientIp,
        scrollMaxDepthPercent: scrollMax,
        reachedEnd,
      });
      const b64 = pdf.toString('base64');
      const safeVersion = legalVersion.replace(/[^\w.+-]+/g, '-');
      const pdfFilename = `NDA-${safeVersion}.pdf`;
      const r = await sendNdaPortalEmails({
        brandName,
        investorEmail: email,
        ownerEmail,
        signerName: fullName,
        pdfBase64: b64,
        pdfFilename,
        heatmapUrl,
        scrollMaxDepthPercent: scrollMax,
        reachedEnd,
      });
      if (!r.ok) emailNote = r.error ?? 'email_failed';
    } catch (e) {
      console.error('[nda/sign] pdf/email', e);
      emailNote = 'pdf_or_email_failed';
    }
  } else {
    emailNote = 'owner_email_missing';
  }

  await admin.from('investor_access_revocations').delete().eq('pitch_id', pitchId).eq('email', email.toLowerCase());

  const res = NextResponse.json({
    ok: true,
    sessionId,
    ndaId: ndaSignatureId,
    ndaLogId,
    next: `/pitch/${pitchId}/portal`,
    emailNote,
  });

  res.cookies.set(investorPitchCookieName(pitchId), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INVESTOR_SESSION_SECONDS,
  });

  return res;
}
