'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AssetDrawer } from '@/components/pitch/AssetDrawer';
import { CapitalCommitmentCard } from '@/components/pitch/CapitalCommitmentCard';
import { DeckPdfHeatmap } from '@/components/pitch/DeckPdfHeatmap';
import { defaultSliderValues, runYieldStress, type YieldConfig } from '@/lib/yield-model';

type PortalJson = {
  ok?: boolean;
  pitchTitle?: string;
  sessionId?: string;
  hasPdfDeck?: boolean;
  yieldConfig?: YieldConfig;
  previewEmbedUrl?: string | null;
  error?: string;
};

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function safeEmbed(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  return u.startsWith('https://') ? u : null;
}

export function InvestorPortalClient({ pitchId }: { pitchId: string }) {
  const [cfg, setCfg] = useState<PortalJson | null>(null);
  const [hostPresent, setHostPresent] = useState(false);
  const [sliders, setSliders] = useState<Record<string, number>>({});
  const [deckCoverageRatio, setDeckCoverageRatio] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/portal-config`, { credentials: 'include' });
    const j = (await res.json()) as PortalJson;
    setCfg(j);
    if (j.ok && j.yieldConfig) {
      setSliders(defaultSliderValues(j.yieldConfig));
    }
  }, [pitchId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const sessionId = cfg?.sessionId;
  useEffect(() => {
    if (!sessionId || !cfg?.ok) return;
    let cancelled = false;
    const poll = async () => {
      const res = await fetch(
        `/api/pitch/${encodeURIComponent(pitchId)}/session/${encodeURIComponent(sessionId)}/presence`,
        { credentials: 'include' },
      );
      const j = (await res.json()) as { ok?: boolean; hostPresent?: boolean };
      if (!cancelled && j.ok) setHostPresent(Boolean(j.hostPresent));
    };
    void poll();
    const id = window.setInterval(() => void poll(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pitchId, sessionId, cfg?.ok]);

  const yieldCfg = useMemo(() => (cfg?.yieldConfig ?? {}) as YieldConfig, [cfg?.yieldConfig]);
  const stress = useMemo(() => runYieldStress(yieldCfg, sliders), [yieldCfg, sliders]);
  const sliderDefs = Array.isArray(yieldCfg.sliders) ? yieldCfg.sliders : [];
  const preview = safeEmbed(cfg?.previewEmbedUrl ?? null);
  const roomSrc = `/pitch/${encodeURIComponent(pitchId)}/room`;

  if (!cfg) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">
        Loading workspace…
      </div>
    );
  }

  if (!cfg.ok) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-rose-500/30 bg-rose-950/40 p-6 text-center text-sm text-rose-100/90 backdrop-blur-xl">
        <p className="font-medium">Session unavailable</p>
        <p className="mt-2 text-rose-200/70">{cfg.error === 'revoked' ? 'Access was revoked for this account.' : 'Please complete the gate again.'}</p>
        <Link
          href={`/pitch/${encodeURIComponent(pitchId)}/gate`}
          className="mt-4 inline-flex rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/10"
        >
          Return to gate
        </Link>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6">
      <header className="rounded-2xl border border-white/10 bg-zinc-950/50 p-5 shadow-[0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/70">Investor workspace</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{cfg.pitchTitle ?? 'Pitch'}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Review materials, model scenarios, and join the live session when you are ready. This surface is tuned for mobile
          and desktop.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Strategic deck</h2>
            {!cfg.hasPdfDeck ? (
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200/90">
                PDF pending
              </span>
            ) : (
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200/90">
                Heatmap on
              </span>
            )}
          </div>
          {cfg.hasPdfDeck ? (
            <DeckPdfHeatmap pitchId={pitchId} onDeckCoverageRatio={setDeckCoverageRatio} />
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/30 p-8 text-center text-sm text-zinc-500">
              The host has not attached a PDF deck yet. Check back after they upload materials.
            </div>
          )}
        </section>

        <section className="flex flex-col gap-5">
          <CapitalCommitmentCard
            pitchId={pitchId}
            deckCoverageRatio={deckCoverageRatio}
            hasPdfDeck={Boolean(cfg.hasPdfDeck)}
          />
          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4 backdrop-blur-xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Live session</h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  hostPresent
                    ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200/90'
                    : 'border-zinc-500/40 bg-zinc-800/60 text-zinc-400'
                }`}
              >
                {hostPresent ? 'Host live' : 'Waiting room'}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              WebRTC runs in the secure room. Until the host joins, stay in the waiting state below — audio and data channels
              activate once the host is present.
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/50 shadow-[0_0_32px_rgba(34,211,238,0.06)]">
              <iframe title="Live pitch room" src={roomSrc} className="h-[min(52vh,440px)] w-full border-0 sm:h-[420px]" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={roomSrc}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-cyan-400/35 bg-cyan-400/10 px-4 py-2.5 text-center text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
              >
                Open room fullscreen
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4 backdrop-blur-xl">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Yield stress lab</h2>
            {sliderDefs.length === 0 ? (
              <p className="text-sm text-zinc-500">The host has not published scenario sliders yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {sliderDefs.map((s) => (
                  <label key={s.id} className="block text-xs text-zinc-400">
                    <span className="mb-1 flex justify-between gap-2 text-[11px] font-medium text-zinc-300">
                      <span>{s.label}</span>
                      <span className="font-mono text-cyan-200/90">{(sliders[s.id] ?? s.default).toFixed(3)}</span>
                    </span>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={sliders[s.id] ?? s.default}
                      onChange={(e) => setSliders((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))}
                      className="w-full accent-cyan-400"
                    />
                  </label>
                ))}
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Modeled revenue</p>
                    <p className="mt-1 font-mono text-lg text-white">{fmtMoney(stress.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Modeled profit</p>
                    <p className="mt-1 font-mono text-lg text-emerald-200/90">{fmtMoney(stress.profit)}</p>
                  </div>
                </div>
                <p className="text-[10px] leading-relaxed text-zinc-600">
                  Figures use host-defined base formulas on the server configuration. Sliders stress-test within the ranges
                  the host set.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4 backdrop-blur-xl">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Product preview</h2>
            {preview ? (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-zinc-900/90 to-black shadow-[0_0_40px_rgba(168,85,247,0.12)]">
                <div className="flex items-center gap-2 border-b border-white/10 bg-black/40 px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-rose-400/80" />
                  <span className="h-2 w-2 rounded-full bg-amber-300/80" />
                  <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
                  <span className="ml-2 truncate font-mono text-[10px] text-zinc-500">{preview.replace(/^https:\/\//, '')}</span>
                </div>
                <iframe title="Embedded preview" src={preview} className="h-[min(48vh,400px)] w-full border-0 bg-white" />
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No embed URL configured yet.</p>
            )}
          </div>
        </section>
      </div>
      <AssetDrawer pitchId={pitchId} />
    </div>
  );
}
