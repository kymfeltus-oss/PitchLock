'use client';

import { usePitchSurface } from '@/components/white-label/PitchSurfaceContext';
import { GlassButton } from '@/components/white-label/GlassButton';
import { usePitchRealtimeSync, type GuidedSyncFrame } from '@/hooks/usePitchRealtimeSync';
import { PitchRoomClient } from '@/lib/webrtc/PitchRoomClient';
import { motion, useSpring } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';

type Props = {
  pitchId: string;
  sessionId: string;
  deckEmbedUrl: string | null;
};

export function WarRoomShell({ pitchId, sessionId, deckEmbedUrl }: Props) {
  const { isHost: host } = usePitchSurface();
  const rtc = useMemo(() => new PitchRoomClient(), []);
  const [slide, setSlide] = useState(0);
  const slideRef = useRef(0);
  const [privacy, setPrivacy] = useState(rtc.getPrivacy());
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [hostPresentRemote, setHostPresentRemote] = useState(false);
  const hostLive = host || hostPresentRemote;
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    slideRef.current = slide;
  }, [slide]);

  const [presenterMode, setPresenterMode] = useState(false);
  const [hostGuiding, setHostGuiding] = useState(false);
  const deckPanelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingSyncRef = useRef<GuidedSyncFrame | null>(null);

  const { lastFrame, publish } = usePitchRealtimeSync({ sessionId, isPublisher: host });

  const scaleSpring = useSpring(1, { stiffness: 420, damping: 38 });
  const ySpring = useSpring(0, { stiffness: 380, damping: 36 });

  const pollDeck = useCallback(async () => {
    const res = await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/session/${encodeURIComponent(sessionId)}/deck`, {
      credentials: 'include',
    });
    const j = (await res.json()) as { ok?: boolean; slideIndex?: number };
    if (!res.ok || !j.ok || typeof j.slideIndex !== 'number') return;
    if (!host) setSlide(j.slideIndex);
    else if (!presenterMode) setSlide(j.slideIndex);
  }, [pitchId, sessionId, host, presenterMode]);

  useEffect(() => {
    queueMicrotask(() => void pollDeck());
    pollRef.current = window.setInterval(() => void pollDeck(), 900);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      rtc.dispose();
    };
  }, [pollDeck, rtc]);

  useEffect(() => {
    if (!host) return;
    const url = `/api/pitch/${encodeURIComponent(pitchId)}/session/${encodeURIComponent(sessionId)}/presence`;
    void fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ present: true }),
    });
    return () => {
      void fetch(url, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ present: false }),
      });
    };
  }, [host, pitchId, sessionId]);

  useEffect(() => {
    if (host) return;
    let cancelled = false;
    const pollPresence = async () => {
      const res = await fetch(
        `/api/pitch/${encodeURIComponent(pitchId)}/session/${encodeURIComponent(sessionId)}/presence`,
        { credentials: 'include' },
      );
      const j = (await res.json()) as { ok?: boolean; hostPresent?: boolean };
      if (!cancelled && j.ok) setHostPresentRemote(Boolean(j.hostPresent));
    };
    void pollPresence();
    const id = window.setInterval(() => void pollPresence(), 2600);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [host, pitchId, sessionId]);

  const pushSyncHttp = useCallback(
    async (frame: GuidedSyncFrame) => {
      await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/session/${encodeURIComponent(sessionId)}/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presenterActive: frame.presenterActive,
          slideIndex: frame.slideIndex,
          scrollRatio: frame.scrollRatio,
          zoom: frame.zoom,
          cursorX: frame.cursorX,
          cursorY: frame.cursorY,
        }),
      });
    },
    [pitchId, sessionId],
  );

  const schedulePublish = useCallback(
    (patch: Partial<GuidedSyncFrame>) => {
      if (!host) return;
      const si = typeof patch.slideIndex === 'number' ? patch.slideIndex : slideRef.current;
      const base: GuidedSyncFrame = {
        presenterActive: presenterMode,
        slideIndex: si,
        scrollRatio: pendingSyncRef.current?.scrollRatio ?? 0,
        zoom: pendingSyncRef.current?.zoom ?? 1,
        cursorX: pendingSyncRef.current?.cursorX ?? null,
        cursorY: pendingSyncRef.current?.cursorY ?? null,
        at: Date.now(),
      };
      pendingSyncRef.current = { ...base, ...patch, slideIndex: si, at: Date.now() };
      publish({ ...base, ...patch, slideIndex: si, at: Date.now() });
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const f = pendingSyncRef.current;
        if (f) void pushSyncHttp(f);
      });
    },
    [host, presenterMode, publish, pushSyncHttp],
  );

  useEffect(() => {
    if (!host || !presenterMode) return;
    schedulePublish({ presenterActive: true, slideIndex: slideRef.current });
  }, [host, presenterMode, schedulePublish, slide]);

  const [serverCursor, setServerCursor] = useState<{ x: number; y: number } | null>(null);

  const applyInvestorGuidance = useCallback(
    (frame: {
      presenterActive: boolean;
      slideIndex?: number;
      scrollRatio?: number;
      zoom?: number;
      cursorX?: number | null;
      cursorY?: number | null;
    }) => {
      if (host) return;
      setHostGuiding(frame.presenterActive);
      if (!frame.presenterActive) {
        setServerCursor(null);
        return;
      }
      const h = typeof frame.slideIndex === 'number' ? frame.slideIndex : null;
      if (h == null) return;
      const z = typeof frame.zoom === 'number' ? frame.zoom : 1;
      const sr = typeof frame.scrollRatio === 'number' ? frame.scrollRatio : 0;
      const local = slideRef.current;
      const forceSnap = h - local > 2;
      setSlide(h);
      slideRef.current = h;
      if (forceSnap) {
        const jump = (mv: { jump?: (n: number) => void; set: (n: number) => void }, v: number) => {
          if (typeof mv.jump === 'function') mv.jump(v);
          else mv.set(v);
        };
        jump(scaleSpring, z);
        jump(ySpring, -sr * 120);
      } else {
        scaleSpring.set(z);
        ySpring.set(-sr * 120);
      }
      if (frame.cursorX != null && frame.cursorY != null) {
        setServerCursor({ x: frame.cursorX, y: frame.cursorY });
      } else {
        setServerCursor(null);
      }
    },
    [host, scaleSpring, ySpring],
  );

  useEffect(() => {
    if (host) return;
    let on = true;
    const poll = async () => {
      const res = await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/session/${encodeURIComponent(sessionId)}/sync`, {
        credentials: 'include',
      });
      const j = (await res.json()) as {
        ok?: boolean;
        presenterActive?: boolean;
        slideIndex?: number;
        scrollRatio?: number;
        zoom?: number;
        cursorX?: number | null;
        cursorY?: number | null;
      };
      if (!on || !j.ok) return;
      applyInvestorGuidance({
        presenterActive: Boolean(j.presenterActive),
        slideIndex: typeof j.slideIndex === 'number' ? j.slideIndex : undefined,
        scrollRatio: typeof j.scrollRatio === 'number' ? j.scrollRatio : undefined,
        zoom: typeof j.zoom === 'number' ? j.zoom : undefined,
        cursorX: j.cursorX,
        cursorY: j.cursorY,
      });
    };
    void poll();
    const id = window.setInterval(() => void poll(), 140);
    return () => {
      on = false;
      window.clearInterval(id);
    };
  }, [host, pitchId, sessionId, applyInvestorGuidance]);

  useEffect(() => {
    if (host || !lastFrame) return;
    queueMicrotask(() => {
      applyInvestorGuidance(lastFrame);
    });
  }, [host, lastFrame, applyInvestorGuidance]);

  function onDeckPointer(ev: PointerEvent) {
    if (!host || !presenterMode) return;
    const el = deckPanelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (ev.clientX - r.left) / Math.max(1, r.width);
    const y = (ev.clientY - r.top) / Math.max(1, r.height);
    schedulePublish({
      cursorX: Math.min(1, Math.max(0, x)),
      cursorY: Math.min(1, Math.max(0, y)),
      slideIndex: slideRef.current,
    });
  }

  function onDeckWheel(ev: WheelEvent) {
    if (!host || !presenterMode) return;
    ev.preventDefault();
    const prev = pendingSyncRef.current?.zoom ?? 1;
    const next = Math.min(2.4, Math.max(0.6, prev + (ev.deltaY > 0 ? -0.06 : 0.06)));
    const sr = Math.min(1, Math.max(0, (pendingSyncRef.current?.scrollRatio ?? 0) + ev.deltaY * 0.0004));
    schedulePublish({ zoom: next, scrollRatio: sr, slideIndex: slideRef.current });
  }

  async function pushSlide(next: number) {
    if (!host) return;
    const res = await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/session/${encodeURIComponent(sessionId)}/deck`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slideIndex: next }),
    });
    const j = (await res.json()) as { ok?: boolean; slideIndex?: number };
    if (res.ok && j.ok && typeof j.slideIndex === 'number') {
      setSlide(j.slideIndex);
      slideRef.current = j.slideIndex;
      schedulePublish({ slideIndex: j.slideIndex });
    }
  }

  function togglePrivacy(patch: Partial<{ videoBlurred: boolean; audioMuted: boolean }>) {
    setPrivacy(rtc.setPrivacy(patch));
  }

  async function finalizeRecording() {
    if (!host) return;
    setRecordingBusy(true);
    try {
      await fetch(
        `/api/pitch/${encodeURIComponent(pitchId)}/session/${encodeURIComponent(sessionId)}/recording/complete`,
        { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
    } finally {
      setRecordingBusy(false);
    }
  }

  async function togglePresenter(next: boolean) {
    setPresenterMode(next);
    if (host) {
      const si = slideRef.current;
      await pushSyncHttp({
        presenterActive: next,
        slideIndex: si,
        scrollRatio: pendingSyncRef.current?.scrollRatio ?? 0,
        zoom: pendingSyncRef.current?.zoom ?? 1,
        cursorX: null,
        cursorY: null,
        at: Date.now(),
      });
      publish({
        presenterActive: next,
        slideIndex: si,
        scrollRatio: pendingSyncRef.current?.scrollRatio ?? 0,
        zoom: pendingSyncRef.current?.zoom ?? 1,
        cursorX: null,
        cursorY: null,
        at: Date.now(),
      });
    }
  }

  const src = deckEmbedUrl?.trim() ?? '';
  const deckOk = src.startsWith('https://');

  const useRtCursor =
    Boolean(lastFrame?.presenterActive) && lastFrame?.cursorX != null && lastFrame?.cursorY != null;
  const cursorX = useRtCursor ? (lastFrame!.cursorX as number) : serverCursor?.x ?? null;
  const cursorY = useRtCursor ? (lastFrame!.cursorY as number) : serverCursor?.y ?? null;
  const shadow = !host && hostGuiding && cursorX != null && cursorY != null;

  useEffect(() => {
    if (host) {
      scaleSpring.set(1);
      ySpring.set(0);
    }
  }, [host, scaleSpring, ySpring]);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-8 lg:flex-row">
      <section className="flex min-h-[420px] flex-1 flex-col rounded-2xl border border-white/10 bg-zinc-950/50 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Live surface</p>
            <h2 className="text-lg font-semibold text-white">Live session</h2>
          </div>
          {host ? (
            <div className="flex flex-wrap gap-2">
              <GlassButton
                variant={presenterMode ? 'solid' : 'ghost'}
                type="button"
                onClick={() => void togglePresenter(!presenterMode)}
              >
                {presenterMode ? 'Take control · on' : 'Take control'}
              </GlassButton>
              <GlassButton variant="ghost" type="button" onClick={() => void pushSlide(Math.max(0, slide - 1))}>
                Slide −
              </GlassButton>
              <GlassButton variant="ghost" type="button" onClick={() => void pushSlide(slide + 1)}>
                Slide +
              </GlassButton>
              <GlassButton variant="ghost" type="button" onClick={() => togglePrivacy({ videoBlurred: !privacy.videoBlurred })}>
                {privacy.videoBlurred ? 'Reveal video' : 'Privacy blur'}
              </GlassButton>
              <GlassButton variant="ghost" type="button" onClick={() => togglePrivacy({ audioMuted: !privacy.audioMuted })}>
                {privacy.audioMuted ? 'Unmute' : 'Mute'}
              </GlassButton>
              <GlassButton variant="solid" type="button" disabled={recordingBusy} onClick={() => void finalizeRecording()}>
                {recordingBusy ? 'Finalizing…' : 'End session (recording stub)'}
              </GlassButton>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Host drives slides. Guided sync follows when Take control is active.</p>
          )}
        </header>

        {!host && !hostLive ? (
          <div className="mb-3 flex flex-col gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/5 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/90">Waiting room</p>
              <p className="mt-1 text-xs text-zinc-300">The host has not joined this session yet. Remote media unlocks when they arrive.</p>
            </div>
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/10 sm:w-28">
              <span className="block h-full w-1/2 animate-pulse rounded-full bg-cyan-400/60" />
            </span>
          </div>
        ) : null}

        <div className="grid flex-1 gap-3 md:grid-cols-2">
          <div
            className={`relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 ${
              privacy.videoBlurred ? 'backdrop-blur-md' : ''
            }`}
          >
            <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 30% 20%, var(--wl-glow), transparent 55%)' }} />
            <div className="relative flex aspect-video flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Local preview</p>
              <p className="text-sm text-zinc-400">Custom WebRTC surface — wire tracks in `PitchRoomClient`.</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-300">
                {privacy.videoBlurred ? 'Video shielded' : 'Video live'} · {privacy.audioMuted ? 'Mic off' : 'Mic on'}
              </span>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950">
            <div className="relative flex aspect-video flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Remote participant</p>
              <p className="text-sm text-zinc-400">Remote tiles render here after WebRTC subscription.</p>
              {!host && !hostLive ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/80 px-4 text-center backdrop-blur-md">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">Waiting</p>
                  <p className="text-xs text-zinc-400">Session opens when the host is present.</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="flex w-full flex-col rounded-2xl border border-white/10 bg-zinc-950/50 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl lg:w-[420px]">
        <header className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Deck</p>
            <h2 className="text-lg font-semibold text-white">Guided sync viewer</h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-cyan-200/90">
            slide {slide}
          </span>
        </header>
        <motion.div
          ref={deckPanelRef}
          className="relative min-h-[360px] flex-1 overflow-hidden rounded-xl border border-cyan-500/15 bg-black/40 shadow-[0_0_36px_rgba(34,211,238,0.12)]"
          style={host ? { scale: 1, y: 0 } : { scale: scaleSpring, y: ySpring }}
          onPointerMove={(e) => onDeckPointer(e)}
          onWheel={(e) => onDeckWheel(e)}
        >
          {!host && hostGuiding ? (
            <div className="pointer-events-none absolute right-3 top-3 z-30 flex items-center gap-2 rounded-full border border-cyan-400/50 bg-cyan-500/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.55),0_0_40px_rgba(34,211,238,0.25)] backdrop-blur-md animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_2px_rgba(34,211,238,0.9)]" />
              Live sync active
            </div>
          ) : null}
          {deckOk ? (
            <iframe title="Pitch deck" src={src} className="absolute inset-0 h-full w-full border-0" allowFullScreen />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
              Configure an HTTPS embed URL on the pitch (or workspace deck) to render here.
            </div>
          )}
          {shadow ? (
            <div
              className="pointer-events-none absolute z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/35 bg-cyan-400/20 shadow-[0_0_14px_rgba(34,211,238,0.55),0_0_28px_rgba(34,211,238,0.2)]"
              style={{
                left: `${(cursorX ?? 0) * 100}%`,
                top: `${(cursorY ?? 0) * 100}%`,
              }}
            />
          ) : null}
        </motion.div>
        {host && presenterMode ? (
          <p className="mt-2 text-[10px] text-cyan-200/70">Presenter mode: move the pointer and scroll — investors mirror with motion smoothing.</p>
        ) : null}
      </section>
    </div>
  );
}
