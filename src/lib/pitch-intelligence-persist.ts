import type { SupabaseClient } from '@supabase/supabase-js';

export type PitchIntelligenceBatch = {
  totalViewSeconds?: number;
  timePerSlide?: number[];
  zoomEvents?: { slideIndex: number; scale: number; at?: string }[];
  focusOutSeconds?: number;
  lastSlideIndex?: number;
  sessionMeta?: Record<string, unknown>;
  /** Optional micro-events for session_meta merge (e.g. scroll velocity samples). */
  engagementEvents?: unknown[];
};

export async function persistPitchIntelligenceBatch(
  admin: SupabaseClient,
  ctx: { pitchId: string; sessionId: string; emailLower: string },
  body: PitchIntelligenceBatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = ctx.emailLower;
  const total = Math.min(1e8, Math.max(0, Number(body.totalViewSeconds) || 0));
  const arr = Array.isArray(body.timePerSlide) ? body.timePerSlide.map((n) => Math.max(0, Number(n) || 0)).slice(0, 500) : [];
  const incomingZoom = Array.isArray(body.zoomEvents) ? body.zoomEvents.slice(0, 120) : [];
  const focusOut = Math.min(1e8, Math.max(0, Number(body.focusOutSeconds) || 0));
  const lastSlide = Math.floor(Number(body.lastSlideIndex) || 0);
  const sessionMeta =
    body.sessionMeta && typeof body.sessionMeta === 'object' && !Array.isArray(body.sessionMeta) ? body.sessionMeta : {};
  const engagementEvents = Array.isArray(body.engagementEvents) ? body.engagementEvents.slice(0, 200) : [];

  const { data: prev } = await admin
    .from('pitch_intelligence')
    .select('time_per_slide, zoom_events, session_meta, focus_out_seconds')
    .eq('session_id', ctx.sessionId)
    .eq('investor_email', email)
    .maybeSingle();

  const prevArr = Array.isArray(prev?.time_per_slide) ? (prev!.time_per_slide as unknown[]).map((n) => Math.max(0, Number(n) || 0)) : [];
  const maxLen = Math.max(prevArr.length, arr.length, 1);
  const mergedSlides = Array.from({ length: maxLen }, (_, i) => Math.max(prevArr[i] ?? 0, arr[i] ?? 0));

  const prevZoom = Array.isArray(prev?.zoom_events) ? prev!.zoom_events : [];
  const mergedZoom = [...(prevZoom as unknown[]), ...incomingZoom].slice(-200);

  const prevMeta =
    prev?.session_meta && typeof prev.session_meta === 'object' && !Array.isArray(prev.session_meta)
      ? (prev.session_meta as Record<string, unknown>)
      : {};
  const prevEvents = Array.isArray(prevMeta.engagement_events) ? (prevMeta.engagement_events as unknown[]) : [];
  const mergedEvents = [...prevEvents, ...engagementEvents].slice(-300);

  const mergedMeta = {
    ...prevMeta,
    ...sessionMeta,
    engagement_events: mergedEvents,
  };

  const prevFocus = Math.max(0, Number((prev as { focus_out_seconds?: unknown })?.focus_out_seconds) || 0);
  const mergedFocus = Math.max(prevFocus, focusOut);

  const up = await admin.from('pitch_intelligence').upsert(
    {
      pitch_id: ctx.pitchId,
      session_id: ctx.sessionId,
      investor_email: email,
      total_view_seconds: total,
      time_per_slide: mergedSlides,
      zoom_events: mergedZoom,
      focus_out_seconds: mergedFocus,
      last_slide_index: lastSlide,
      session_meta: mergedMeta,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,investor_email' },
  );

  if (up.error) {
    console.error('[pitch-intelligence-persist]', up.error.message);
    return { ok: false, error: 'persist_failed' };
  }
  return { ok: true };
}
