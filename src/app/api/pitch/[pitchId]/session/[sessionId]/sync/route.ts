import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE, investorPitchCookieName } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt, verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string; sessionId: string }> };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clampZoom(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(3, Math.max(0.5, n));
}

export async function GET(_req: Request, ctx: Ctx) {
  const { pitchId, sessionId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const jar = await cookies();
  const inv = jar.get(investorPitchCookieName(pitchId))?.value;
  const founderRaw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  let ok = false;
  if (inv) {
    try {
      const v = await verifyInvestorPitchJwt(inv);
      if (v.pitch_id === pitchId && v.session_id === sessionId) ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok && founderRaw) {
    try {
      const f = await verifyFounderJwt(founderRaw);
      const bundle = await fetchPitchBundleById(admin, pitchId);
      if (bundle && bundle.pitch.workspace_id === f.workspace_id) ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { data } = await admin.from('pitch_session_sync').select('*').eq('session_id', sessionId).maybeSingle();
  if (!data) {
    return NextResponse.json({
      ok: true,
      presenterActive: false,
      slideIndex: 0,
      scrollRatio: 0,
      zoom: 1,
      cursorX: null,
      cursorY: null,
      updatedAt: null,
    });
  }

  return NextResponse.json({
    ok: true,
    presenterActive: Boolean(data.presenter_active),
    slideIndex: Number(data.slide_index ?? 0),
    scrollRatio: Number(data.scroll_ratio ?? 0),
    zoom: Number(data.zoom ?? 1),
    cursorX: data.cursor_x != null ? Number(data.cursor_x) : null,
    cursorY: data.cursor_y != null ? Number(data.cursor_y) : null,
    updatedAt: data.updated_at ?? null,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { pitchId, sessionId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const jar = await cookies();
  const founderRaw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  if (!founderRaw) return NextResponse.json({ ok: false, error: 'founder_required' }, { status: 401 });

  let founderWs: string;
  try {
    founderWs = (await verifyFounderJwt(founderRaw)).workspace_id;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_founder' }, { status: 401 });
  }

  const bundle = await fetchPitchBundleById(admin, pitchId);
  if (!bundle || bundle.pitch.workspace_id !== founderWs) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const sess = await admin.from('pitch_sessions').select('id').eq('id', sessionId).eq('pitch_id', pitchId).maybeSingle();
  if (!sess.data?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const presenterActive = Boolean(body.presenterActive);
  const slideIndex = Math.floor(Number(body.slideIndex));
  const scrollRatio = clamp01(Number(body.scrollRatio));
  const zoom = clampZoom(Number(body.zoom));
  const cursorX = body.cursorX == null ? null : clamp01(Number(body.cursorX));
  const cursorY = body.cursorY == null ? null : clamp01(Number(body.cursorY));

  if (!Number.isFinite(slideIndex) || slideIndex < 0 || slideIndex > 9999) {
    return NextResponse.json({ ok: false, error: 'invalid_slide' }, { status: 400 });
  }

  const up = await admin.from('pitch_session_sync').upsert(
    {
      session_id: sessionId,
      presenter_active: presenterActive,
      slide_index: slideIndex,
      scroll_ratio: scrollRatio,
      zoom,
      cursor_x: cursorX,
      cursor_y: cursorY,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id' },
  );

  if (up.error) {
    console.error('[sync]', up.error.message);
    return NextResponse.json({ ok: false, error: 'persist_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
