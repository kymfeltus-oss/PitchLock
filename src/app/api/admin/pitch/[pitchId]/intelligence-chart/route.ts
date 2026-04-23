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

  const { data: rows, error } = await admin
    .from('pitch_intelligence')
    .select('time_per_slide, focus_out_seconds, total_view_seconds, investor_email, zoom_events')
    .eq('pitch_id', pitchId)
    .limit(500);

  if (error) {
    console.error('[intelligence-chart]', error.message);
    return NextResponse.json({ ok: false, error: 'load_failed' }, { status: 500 });
  }

  const agg = new Map<number, { seconds: number; viewers: number }>();
  const zoomAgg = new Map<number, number>();
  let investors = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const row = r as { time_per_slide?: unknown; investor_email?: string; zoom_events?: unknown };
    investors += 1;
    const arr = Array.isArray(row.time_per_slide) ? row.time_per_slide : [];
    arr.forEach((v, i) => {
      const sec = typeof v === 'number' ? v : Number(v) || 0;
      const cur = agg.get(i) ?? { seconds: 0, viewers: 0 };
      cur.seconds += sec;
      cur.viewers += 1;
      agg.set(i, cur);
    });
    const zev = Array.isArray(row.zoom_events) ? row.zoom_events : [];
    for (const ev of zev) {
      const o = ev as { slideIndex?: unknown };
      const si = Math.floor(Number(o.slideIndex));
      if (!Number.isFinite(si) || si < 0) continue;
      zoomAgg.set(si, (zoomAgg.get(si) ?? 0) + 1);
    }
  }

  const bySlide = Array.from(agg.entries())
    .map(([slideIndex, v]) => ({
      slideIndex,
      avgSeconds: v.viewers > 0 ? Math.round((v.seconds / v.viewers) * 10) / 10 : 0,
      totalSeconds: Math.round(v.seconds * 10) / 10,
    }))
    .sort((a, b) => a.slideIndex - b.slideIndex);

  let peakSlide: { slideIndex: number; avgSeconds: number } | null = null;
  for (const r of bySlide) {
    if (r.avgSeconds <= 0) continue;
    if (!peakSlide || r.avgSeconds > peakSlide.avgSeconds) peakSlide = { slideIndex: r.slideIndex, avgSeconds: r.avgSeconds };
  }

  const ZOOM_WEIGHT = 5;
  const attentionRanked = bySlide
    .map((r) => {
      const zoomCount = zoomAgg.get(r.slideIndex) ?? 0;
      const attentionScore = Math.round((r.avgSeconds + zoomCount * ZOOM_WEIGHT) * 10) / 10;
      return {
        rank: 0,
        slideIndex: r.slideIndex,
        slideLabel: `Slide ${r.slideIndex + 1}`,
        attentionScore,
        avgSeconds: r.avgSeconds,
        zoomEvents: zoomCount,
      };
    })
    .sort((a, b) => b.attentionScore - a.attentionScore)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));

  const { count: softCount } = await admin
    .from('pitch_soft_interests')
    .select('id', { count: 'exact', head: true })
    .eq('pitch_id', pitchId);

  return NextResponse.json({
    ok: true,
    investorSessions: investors,
    bySlide,
    peakSlide,
    attentionRanked,
    attentionModel: { formula: 'attentionScore = avgSeconds + zoomEvents * 5' },
    softInterestCount: typeof softCount === 'number' ? softCount : 0,
  });
}
