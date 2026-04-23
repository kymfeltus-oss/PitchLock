'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Row = { slideIndex: number; avgSeconds: number; totalSeconds: number };

type AttentionRow = {
  rank: number;
  slideIndex: number;
  slideLabel: string;
  attentionScore: number;
  avgSeconds: number;
  zoomEvents: number;
};

type Json = {
  ok?: boolean;
  bySlide?: Row[];
  peakSlide?: { slideIndex: number; avgSeconds: number } | null;
  investorSessions?: number;
  softInterestCount?: number;
  attentionRanked?: AttentionRow[];
  attentionModel?: { formula?: string };
};

const axisStyle = { fill: '#71717a', fontSize: 10 };
const gridStroke = 'rgba(255,255,255,0.06)';

export function IntelligenceMissionClient({ pitchId }: { pitchId: string }) {
  const [data, setData] = useState<Json | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch(`/api/admin/pitch/${encodeURIComponent(pitchId)}/intelligence-chart`, {
      credentials: 'include',
    });
    const j = (await res.json()) as Json;
    if (!res.ok || !j.ok) {
      setErr('load_failed');
      return;
    }
    setData(j);
  }, [pitchId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const chartData =
    data?.bySlide?.map((r) => ({
      name: `S${r.slideIndex + 1}`,
      avg: r.avgSeconds,
    })) ?? [];

  const dropOffJson = JSON.stringify(
    {
      pitchId,
      generatedAt: new Date().toISOString(),
      attentionModel: data?.attentionModel,
      attentionRanked: data?.attentionRanked ?? [],
    },
    null,
    2,
  );

  return (
    <div className="mt-8 flex flex-col gap-6">
      {err ? <p className="text-sm text-rose-300/90">{err}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 shadow-[0_0_32px_rgba(34,211,238,0.12)] backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">Sessions tracked</p>
          <p className="mt-2 font-mono text-2xl text-white">{data?.investorSessions ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4 shadow-[0_0_32px_rgba(217,70,239,0.12)] backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-200/80">Peak slide (avg dwell)</p>
          <p className="mt-2 font-mono text-lg text-white">
            {data?.peakSlide ? `Slide ${data.peakSlide.slideIndex + 1}` : '—'}
          </p>
          <p className="text-xs text-zinc-500">{data?.peakSlide ? `${data.peakSlide.avgSeconds}s avg` : ''}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-[0_0_32px_rgba(52,211,153,0.12)] backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/80">Soft interests</p>
          <p className="mt-2 font-mono text-2xl text-white">{data?.softInterestCount ?? '—'}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Slide engagement readout</h2>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={{ stroke: gridStroke }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(9,9,11,0.92)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  color: '#e4e4e7',
                }}
                labelStyle={{ color: '#67e8f9' }}
              />
              <ReferenceLine y={3} stroke="rgba(244,63,94,0.35)" strokeDasharray="4 4" label={{ value: 'Low', fill: '#f87171', fontSize: 10 }} />
              <Bar dataKey="avg" radius={[6, 6, 0, 0]} name="Avg seconds">
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.avg < 3 ? '#f472b6' : '#22d3ee'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
          Magenta bars highlight slides with under ~3s average dwell (possible drop-off). Cyan shows stronger attention.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Drop-off report</h2>
            <p className="mt-1 text-[10px] text-zinc-600">
              Slides ranked by attention score (avg dwell + zoom weighting). {data?.attentionModel?.formula ?? ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(dropOffJson).catch(() => {});
            }}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-500/15"
          >
            Copy JSON
          </button>
        </div>
        <div className="max-h-[280px] overflow-auto rounded-lg border border-white/5 bg-black/30">
          <table className="w-full text-left text-[11px] text-zinc-300">
            <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Slide</th>
                <th className="px-3 py-2">Attention</th>
                <th className="px-3 py-2">Avg s</th>
                <th className="px-3 py-2">Zoom</th>
              </tr>
            </thead>
            <tbody>
              {(data?.attentionRanked ?? []).map((r) => (
                <tr key={r.slideIndex} className="border-t border-white/5">
                  <td className="px-3 py-2 font-mono text-cyan-200/90">{r.rank}</td>
                  <td className="px-3 py-2">{r.slideLabel}</td>
                  <td className="px-3 py-2 font-mono text-white">{r.attentionScore}</td>
                  <td className="px-3 py-2 font-mono text-zinc-400">{r.avgSeconds}</td>
                  <td className="px-3 py-2 font-mono text-zinc-400">{r.zoomEvents}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.attentionRanked?.length ? (
            <p className="p-4 text-xs text-zinc-600">No intelligence rows yet for this pitch.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
