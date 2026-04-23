'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEngagementTracker } from '@/hooks/useEngagementTracker';
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  pitchId: string;
  /** Fires when coverage estimate updates (slides with meaningful dwell / total pages). */
  onDeckCoverageRatio?: (ratio: number) => void;
};

function PdfPageBlock({
  doc,
  pageNum,
  pageIndex,
  intensity,
  onRatio,
}: {
  doc: PDFDocumentProxy;
  pageNum: number;
  pageIndex: number;
  intensity: number;
  onRatio: (pageIndex: number, ratio: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === el) onRatio(pageIndex, e.intersectionRatio);
        }
      },
      { threshold: [0, 0.15, 0.25, 0.35, 0.5, 0.55, 0.75, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pageIndex, onRatio]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const page = await doc.getPage(pageNum);
      if (cancelled) return;
      const parentW = canvas.parentElement?.clientWidth ?? 640;
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1.4, parentW / base.width);
      const viewport = page.getViewport({ scale });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageNum]);

  const glow = `0 0 ${12 + intensity * 28}px rgba(34,211,238,${0.12 + intensity * 0.35})`;

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto mb-6 w-full max-w-3xl scroll-mt-24 rounded-lg border border-white/10 bg-zinc-950/80 p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
      style={{ boxShadow: glow }}
    >
      <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
        <span>Page {pageNum}</span>
        <span className="font-mono text-cyan-200/80">{Math.round(intensity * 100)}% focus</span>
      </div>
      <div className="flex justify-center overflow-x-auto">
        <canvas ref={canvasRef} className="max-w-full rounded bg-zinc-900/90" />
      </div>
      <span
        className="pointer-events-none absolute inset-0 rounded-lg mix-blend-screen"
        style={{ backgroundColor: `rgba(34,211,238,${intensity * 0.14})` }}
      />
    </div>
  );
}

export function DeckPdfHeatmap({ pitchId, onDeckCoverageRatio }: Props) {
  const engagement = useEngagementTracker();
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const ratiosRef = useRef<number[]>([]);
  const [activePage, setActivePage] = useState(0);
  const activePageRef = useRef(0);
  const [heat, setHeat] = useState<Record<number, number>>({});
  const pendingFlushRef = useRef<Map<number, number>>(new Map());
  const pageEnterRef = useRef(0);
  const sessionStartRef = useRef(0);
  /** Cumulative tab-hidden seconds (from `useEngagementTracker` deltas at each batch flush). */
  const focusOutTotalRef = useRef(0);
  const zoomBatchRef = useRef<{ slideIndex: number; scale: number; at: string }[]>([]);
  const heatRef = useRef<Record<number, number>>({});
  const numPagesRef = useRef(0);

  useEffect(() => {
    pageEnterRef.current = performance.now();
    if (sessionStartRef.current === 0) sessionStartRef.current = Date.now();
  }, []);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  useEffect(() => {
    heatRef.current = heat;
  }, [heat]);

  useEffect(() => {
    numPagesRef.current = numPages;
  }, [numPages]);

  const bumpDwell = useCallback((pageIdx: number, seconds: number) => {
    if (seconds <= 0) return;
    const rounded = Math.round(seconds * 10) / 10;
    setHeat((prev) => ({ ...prev, [pageIdx]: (prev[pageIdx] ?? 0) + rounded }));
    const m = pendingFlushRef.current;
    m.set(pageIdx, (m.get(pageIdx) ?? 0) + rounded);
  }, []);

  const flushToServer = useCallback(async () => {
    const updates: { pageIndex: number; deltaSeconds: number }[] = [];
    for (const [pageIndex, deltaSeconds] of pendingFlushRef.current.entries()) {
      if (deltaSeconds > 0.05) updates.push({ pageIndex, deltaSeconds });
    }
    pendingFlushRef.current.clear();
    if (updates.length === 0) return;
    await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/deck/analytics`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
  }, [pitchId]);

  const flushIntelligence = useCallback(async () => {
    const n = numPagesRef.current;
    if (n === 0) return;
    const h = heatRef.current;
    const arr = Array.from({ length: n }, (_, i) => h[i] ?? 0);
    const total = (Date.now() - sessionStartRef.current) / 1000;
    const covered = arr.filter((s) => s >= 1.5).length;
    const ratio = covered / n;
    onDeckCoverageRatio?.(ratio);
    const z = zoomBatchRef.current.splice(0, zoomBatchRef.current.length);
    const tabDelta = engagement.consumeTabHiddenDelta();
    focusOutTotalRef.current += tabDelta;
    const snap = engagement.getSnapshotForMeta();
    const meta: Record<string, unknown> = {
      ...snap,
      deckCoverageRatio: ratio,
      tab_hidden_seconds_delta: tabDelta,
    };
    const engagementEvents = [
      {
        at: new Date().toISOString(),
        type: 'engagement_batch',
        scroll_velocity_ewma: snap.scroll_velocity_ewma,
        dominant_slide_index: snap.dominant_slide_index,
      },
    ];
    await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/track-engagement`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalViewSeconds: total,
        timePerSlide: arr,
        zoomEvents: z,
        focusOutSeconds: focusOutTotalRef.current,
        lastSlideIndex: activePageRef.current,
        sessionMeta: meta,
        engagementEvents,
      }),
    });
  }, [pitchId, onDeckCoverageRatio, engagement]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        void flushToServer();
        void flushIntelligence();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [flushIntelligence, flushToServer]);

  const onRatio = useCallback(
    (pageIndex: number, ratio: number) => {
      ratiosRef.current[pageIndex] = ratio;
      engagement.setDominantSlideIfStrong(pageIndex, ratio);
      let best = 0;
      let bestR = 0;
      for (let i = 0; i < ratiosRef.current.length; i += 1) {
        const r = ratiosRef.current[i] ?? 0;
        if (r > bestR) {
          bestR = r;
          best = i;
        }
      }
      if (bestR < 0.25) return;
      const prev = activePageRef.current;
      if (best === prev) return;
      const now = performance.now();
      const elapsed = (now - pageEnterRef.current) / 1000;
      pageEnterRef.current = now;
      bumpDwell(prev, elapsed);
      activePageRef.current = best;
      setActivePage(best);
    },
    [bumpDwell, engagement],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/deck/asset-url`, { credentials: 'include' });
        const j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
        if (!res.ok || !j.ok || !j.url) {
          setError(j.error === 'no_deck_asset' ? 'Deck PDF not uploaded yet.' : 'Unable to load deck.');
          return;
        }
        if (!cancelled) setPdfUrl(j.url);
      } catch {
        if (!cancelled) setError('Network error loading deck.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pitchId]);

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      const task = pdfjs.getDocument({ url: pdfUrl, withCredentials: false });
      const d = await task.promise;
      if (cancelled) return;
      ratiosRef.current = Array.from({ length: d.numPages }, () => 0);
      setNumPages(d.numPages);
      setDoc(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      bumpDwell(activePage, (now - pageEnterRef.current) / 1000);
      pageEnterRef.current = now;
      void flushToServer();
      void flushIntelligence();
    }, 15000);
    return () => {
      window.clearInterval(id);
      void flushToServer();
      void flushIntelligence();
    };
  }, [activePage, bumpDwell, flushIntelligence, flushToServer]);

  const heatMax = Math.max(1, 12, ...Object.values(heat));

  if (error) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-white/10 bg-black/30 p-6 text-center text-sm text-zinc-400">
        {error}
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-white/10 bg-black/30 text-sm text-zinc-500">
        Resolving deck…
      </div>
    );
  }

  if (!doc || numPages === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-white/10 bg-black/30 text-sm text-zinc-500">
        Opening PDF…
      </div>
    );
  }

  return (
    <div className="flex max-h-[52vh] flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40 lg:max-h-[min(70vh,720px)]">
      <div className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
        Strategic deck · dwell heatmap
      </div>
      <div
        className="overflow-y-auto overscroll-contain p-3"
        onWheel={(e) => {
          engagement.onWheelCapture(e);
          if (e.ctrlKey) {
            zoomBatchRef.current.push({
              slideIndex: activePageRef.current,
              scale: 1.15,
              at: new Date().toISOString(),
            });
          }
        }}
      >
        {Array.from({ length: numPages }, (_, pageIndex) => {
          const local = heat[pageIndex] ?? 0;
          const intensity = Math.min(1, (local + (activePage === pageIndex ? 6 : 0)) / heatMax);
          return (
            <PdfPageBlock
              key={pageIndex + 1}
              doc={doc}
              pageNum={pageIndex + 1}
              pageIndex={pageIndex}
              intensity={intensity}
              onRatio={onRatio}
            />
          );
        })}
      </div>
    </div>
  );
}
