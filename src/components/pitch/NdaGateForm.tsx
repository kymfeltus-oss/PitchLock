'use client';

import type { CSSProperties, FormEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassButton } from '@/components/white-label/GlassButton';

type ScrollSample = { t: number; depth: number };

export function NdaGateForm({
  pitchId,
  ndaTitle,
  ndaBody,
  legalVersion,
}: {
  pitchId: string;
  ndaTitle: string;
  ndaBody: string;
  legalVersion: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const samplesRef = useRef<ScrollSample[]>([]);
  const lastSampleRef = useRef(0);
  const [emailAddress, setEmailAddress] = useState('');
  const [fullName, setFullName] = useState('');
  const [electronicSignature, setElectronicSignature] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sigHint, setSigHint] = useState<string | null>(null);
  const [maxDepth, setMaxDepth] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.scrollHeight <= 0) return;
    const visible = (el.scrollTop + el.clientHeight) / el.scrollHeight;
    const pct = Math.min(100, Math.max(0, Math.round(visible * 100)));
    setMaxDepth((d) => Math.max(d, pct));
    if (pct >= 98) setReachedEnd(true);
    const now = Date.now();
    if (now - lastSampleRef.current > 400) {
      lastSampleRef.current = now;
      samplesRef.current = [...samplesRef.current, { t: now, depth: pct }].slice(-48);
    }
  }, []);

  function validateSignatureMatch(): boolean {
    const a = fullName.trim().replace(/\s+/g, ' ').toLowerCase();
    const b = electronicSignature.trim().replace(/\s+/g, ' ').toLowerCase();
    if (b.length === 0) {
      setSigHint(null);
      return false;
    }
    if (a !== b) {
      setSigHint('Electronic signature must match your full name (spacing and letter case can differ).');
      return false;
    }
    setSigHint(null);
    return true;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validateSignatureMatch()) {
      setError('Signature must match your full name.');
      return;
    }
    if (!ack) {
      setError('Confirm the agreement to continue.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/nda/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: fullName,
          electronic_signature: electronicSignature,
          email_address: emailAddress,
          acknowledged: ack,
          scroll_metrics: {
            scroll_max_depth_percent: maxDepth,
            reached_document_end: reachedEnd,
            scroll_events: samplesRef.current,
          },
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; next?: string };
      if (!res.ok || !j.ok) {
        setError(
          j.error === 'signature_must_match_name'
            ? 'Your typed signature must match your full name.'
            : j.error || 'Could not complete sign-in.',
        );
        return;
      }
      router.push(j.next || `/pitch/${pitchId}/start`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const neonSurface = {
    ['--wl-primary' as string]: '#00f2ff',
    ['--wl-glow' as string]: 'rgba(0,242,255,0.45)',
  } as CSSProperties;

  return (
    <div className="relative flex flex-1 flex-col items-center px-4 py-12 sm:py-20" style={neonSurface}>
      {busy ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="nda-verify-pulse rounded-2xl border border-cyan-400/40 bg-zinc-950/90 px-10 py-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Processing</p>
            <p className="mt-3 text-lg font-medium text-white">Verifying identity…</p>
            <p className="mt-2 max-w-xs text-sm text-zinc-400">Sealing your session and distributing secure copies.</p>
          </div>
        </div>
      ) : null}

      <section className="relative z-[1] w-full max-w-3xl rounded-2xl border border-cyan-500/20 bg-zinc-950/70 p-8 shadow-[0_0_0_1px_rgba(0,242,255,0.08)_inset,0_0_80px_-30px_rgba(0,242,255,0.25)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/70">Step 2 of 3</p>
            <div className="mt-2 flex gap-1.5">
              <span className="h-1 w-8 rounded-full bg-cyan-400/30" />
              <span className="h-1 w-8 rounded-full bg-cyan-400" />
              <span className="h-1 w-8 rounded-full bg-cyan-400/25" />
            </div>
          </div>
          <p className="font-mono text-[10px] text-zinc-500">template {legalVersion}</p>
        </div>

        <h1 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">{ndaTitle}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
          No account required. A time-bound session is issued for 24 hours after you sign. Template text is loaded from
          the database — owners can publish a new `legal_templates` version without redeploying this app.
        </p>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="nda-scroll mt-8 max-h-[38vh] overflow-y-auto rounded-xl border border-cyan-500/15 bg-black/50 p-5 text-sm leading-relaxed text-zinc-200 shadow-[inset_0_0_40px_rgba(0,242,255,0.04)]"
        >
          {ndaBody}
        </div>
        <p className="mt-2 text-right text-[10px] text-zinc-500">
          Read depth captured: {maxDepth}% {reachedEnd ? '· reached bottom' : ''}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-xs font-medium text-cyan-100/80" htmlFor="email_address">
              Email address
            </label>
            <input
              id="email_address"
              type="email"
              required
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              className="mt-1 w-full rounded-xl border border-cyan-500/20 bg-black/50 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/30"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-cyan-100/80" htmlFor="full_name">
              Full name
            </label>
            <input
              id="full_name"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (electronicSignature) validateSignatureMatch();
              }}
              className="mt-1 w-full rounded-xl border border-cyan-500/20 bg-black/50 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/30"
              autoComplete="name"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-cyan-100/80" htmlFor="electronic_signature">
              Electronic signature (type your full name exactly)
            </label>
            <input
              id="electronic_signature"
              required
              minLength={2}
              value={electronicSignature}
              onChange={(e) => {
                setElectronicSignature(e.target.value);
                validateSignatureMatch();
              }}
              className="mt-1 w-full rounded-xl border border-cyan-500/20 bg-black/50 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/30"
            />
            {sigHint ? <p className="mt-1 text-xs text-amber-300/90">{sigHint}</p> : null}
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 accent-cyan-400" />
            <span>I have read this agreement and agree to be bound as written.</span>
          </label>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <GlassButton type="submit" disabled={busy} className="w-full sm:w-auto">
            Sign &amp; continue
          </GlassButton>
        </form>
      </section>
    </div>
  );
}
