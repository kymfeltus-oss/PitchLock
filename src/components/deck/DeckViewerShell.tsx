'use client';

import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DeckWatermarkOverlay } from '@/components/deck/DeckWatermarkOverlay';

type Props = {
  tenantSlug: string;
  embedUrl: string;
  watermarkEnabled: boolean;
  initialViewerName?: string | null;
  initialViewerEmail?: string | null;
};

const nameKey = (slug: string) => `pr_deck_viewer_name_${slug}`;
const emailKey = (slug: string) => `pr_deck_viewer_email_${slug}`;
const sessionKey = (slug: string) => `pr_deck_session_${slug}`;

export function DeckViewerShell({
  tenantSlug,
  embedUrl,
  watermarkEnabled,
  initialViewerName,
  initialViewerEmail,
}: Props) {
  const [viewerName, setViewerName] = useState('');
  const [viewerEmail, setViewerEmail] = useState('');
  const [gateDone, setGateDone] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visibleSince = useRef<number | null>(null);

  const postAudit = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/tenants/${encodeURIComponent(tenantSlug)}/deck/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; sessionId?: string; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'audit_failed');
      }
      return json;
    },
    [tenantSlug],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromUrlName = initialViewerName?.trim();
    const fromUrlEmail = initialViewerEmail?.trim();
    const storedName = window.localStorage.getItem(nameKey(tenantSlug))?.trim();
    const storedEmail = window.localStorage.getItem(emailKey(tenantSlug))?.trim();
    const name = (fromUrlName || storedName || '').slice(0, 200);
    const email = (fromUrlEmail || storedEmail || '').slice(0, 320);
    if (name.length >= 2) {
      queueMicrotask(() => {
        setViewerName(name);
        setViewerEmail(email);
        setGateDone(true);
      });
    }
  }, [tenantSlug, initialViewerName, initialViewerEmail]);

  useEffect(() => {
    if (!gateDone || viewerName.trim().length < 2 || sessionId) return;
    let alive = true;
    (async () => {
      try {
        const existing = typeof window !== 'undefined' ? window.sessionStorage.getItem(sessionKey(tenantSlug)) : null;
        if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
          if (alive) setSessionId(existing);
          return;
        }
        const json = await postAudit({
          action: 'session_start',
          viewerName: viewerName.trim(),
          viewerEmail: viewerEmail.trim() || null,
          meta: { path: typeof window !== 'undefined' ? window.location.pathname : '' },
        });
        if (!alive) return;
        const sid = json.sessionId as string;
        setSessionId(sid);
        window.sessionStorage.setItem(sessionKey(tenantSlug), sid);
      } catch {
        if (alive) setError('Could not start a secure viewing session. Try again.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [gateDone, viewerName, viewerEmail, sessionId, postAudit, tenantSlug]);

  useEffect(() => {
    if (!sessionId) return;
    const hb = window.setInterval(() => {
      void postAudit({ action: 'heartbeat', sessionId }).catch(() => {});
    }, 25_000);
    return () => window.clearInterval(hb);
  }, [sessionId, postAudit]);

  useEffect(() => {
    if (!sessionId) return;
    const onVis = () => {
      const v = document.visibilityState === 'visible' ? 'visible' : 'hidden';
      if (v === 'visible') {
        visibleSince.current = Date.now();
        void postAudit({ action: 'visibility', sessionId, visibility: 'visible' }).catch(() => {});
      } else {
        const dur =
          visibleSince.current != null ? Math.max(0, Date.now() - visibleSince.current) : null;
        visibleSince.current = null;
        void postAudit({
          action: 'visibility',
          sessionId,
          visibility: 'hidden',
          durationMs: dur,
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [sessionId, postAudit]);

  function onSubmitGate(e: FormEvent) {
    e.preventDefault();
    const n = viewerName.trim();
    if (n.length < 2) {
      setError('Please enter at least 2 characters for your name.');
      return;
    }
    setError(null);
    try {
      window.localStorage.setItem(nameKey(tenantSlug), n.slice(0, 200));
      window.localStorage.setItem(emailKey(tenantSlug), viewerEmail.trim().slice(0, 320));
    } catch {
      /* private mode */
    }
    setGateDone(true);
  }

  if (!gateDone) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <h2 className="text-lg font-semibold text-zinc-900">Identify yourself to view</h2>
        <p className="mt-2 text-sm text-zinc-600">
          This helps protect confidential materials with on-screen watermarking and an access log for the workspace
          owner.
        </p>
        <form onSubmit={onSubmitGate} className="mt-8 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700" htmlFor="vn">
              Full name
            </label>
            <input
              id="vn"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              value={viewerName}
              onChange={(e) => setViewerName(e.target.value)}
              autoComplete="name"
              required
              minLength={2}
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700" htmlFor="ve">
              Email (optional)
            </label>
            <input
              id="ve"
              type="email"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              value={viewerEmail}
              onChange={(e) => setViewerEmail(e.target.value)}
              autoComplete="email"
              maxLength={320}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Continue to deck
          </button>
        </form>
      </div>
    );
  }

  if (error) {
    return <p className="px-6 py-10 text-center text-sm text-red-600">{error}</p>;
  }

  if (!sessionId) {
    return <p className="px-6 py-10 text-center text-sm text-zinc-600">Starting secure session…</p>;
  }

  const src = embedUrl.trim();
  if (!src.startsWith('https://')) {
    return (
      <p className="px-6 py-10 text-center text-sm text-zinc-600">
        Deck URL must be <code className="rounded bg-zinc-100 px-1">https://</code> for embedding.
      </p>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <div className="relative min-h-[72vh] flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-inner">
        <iframe title="Deck" src={src} className="absolute inset-0 h-full w-full border-0" allowFullScreen />
        {watermarkEnabled ? <DeckWatermarkOverlay viewerName={viewerName} viewerEmail={viewerEmail || null} /> : null}
      </div>
      <p className="mt-3 text-center text-xs text-zinc-500">
        Third-party decks (Gamma, Slides, etc.) cannot report per-slide dwell time unless the provider exposes analytics.
        We still log session open, tab focus, and heartbeats.
      </p>
    </div>
  );
}
