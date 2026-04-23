'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';

type LedgerRow = {
  email: string;
  signedAt: string | null;
  lastDeckActivity: string | null;
  revoked: boolean;
};

type Props = {
  pitchId: string;
  pitchTitle: string;
  initialYieldJson: string;
  initialPreviewUrl: string;
};

export function CommandCenterClient({ pitchId, pitchTitle, initialYieldJson, initialPreviewUrl }: Props) {
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerErr, setLedgerErr] = useState<string | null>(null);
  const [yieldJson, setYieldJson] = useState(initialYieldJson);
  const [previewUrl, setPreviewUrl] = useState(initialPreviewUrl);
  const [revokeEmail, setRevokeEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadLedger = useCallback(async () => {
    setLedgerErr(null);
    const res = await fetch(`/api/admin/pitch/${encodeURIComponent(pitchId)}/ledger`, { credentials: 'include' });
    const j = (await res.json()) as { ok?: boolean; rows?: LedgerRow[]; error?: string };
    if (!res.ok || !j.ok) {
      setLedgerErr(j.error || 'load_failed');
      return;
    }
    setLedger(Array.isArray(j.rows) ? j.rows : []);
  }, [pitchId]);

  useEffect(() => {
    queueMicrotask(() => void loadLedger());
  }, [loadLedger]);

  async function onUploadDeck(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    setBusy('upload');
    const res = await fetch(`/api/admin/pitch/${encodeURIComponent(pitchId)}/deck/upload`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    setBusy(null);
    if (!res.ok || !j.ok) {
      setMsg(j.error || 'Upload failed');
      return;
    }
    setMsg('Deck uploaded. Investors can load the PDF in the workspace.');
    e.currentTarget.reset();
  }

  async function onSaveYield(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(yieldJson) as unknown;
    } catch {
      setMsg('Yield config must be valid JSON.');
      return;
    }
    setBusy('yield');
    const res = await fetch(`/api/admin/pitch/${encodeURIComponent(pitchId)}/yield-config`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yieldConfig: parsed }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    setBusy(null);
    if (!res.ok || !j.ok) {
      setMsg(j.error || 'Save failed');
      return;
    }
    setMsg('Yield model saved.');
  }

  async function onSavePreview(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy('preview');
    const res = await fetch(`/api/admin/pitch/${encodeURIComponent(pitchId)}/preview-url`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: previewUrl.trim() || null }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    setBusy(null);
    if (!res.ok || !j.ok) {
      setMsg(j.error || 'Save failed');
      return;
    }
    setMsg('Preview URL saved (HTTPS embeds only).');
  }

  async function onRevoke(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const email = revokeEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      setMsg('Enter a valid email to revoke.');
      return;
    }
    setBusy('revoke');
    const res = await fetch(`/api/admin/pitch/${encodeURIComponent(pitchId)}/revoke`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    setBusy(null);
    if (!res.ok || !j.ok) {
      setMsg(j.error || 'Revoke failed');
      return;
    }
    setMsg(`Session access revoked for ${email}. Their JWT remains until expiry but APIs reject revoked accounts.`);
    setRevokeEmail('');
    void loadLedger();
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/admin/command/${encodeURIComponent(pitchId)}/intelligence`}
        className="inline-flex w-fit rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.15)] transition hover:bg-cyan-400/20"
      >
        Mission control · engagement analytics
      </Link>
      {msg ? (
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100/90 backdrop-blur-md">
          {msg}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 shadow-[0_0_40px_rgba(34,211,238,0.06)] backdrop-blur-xl">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Pitch deck (PDF)</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Upload a PDF for <span className="text-zinc-200">{pitchTitle}</span>. Investors see it in the strategic deck card
          with dwell analytics.
        </p>
        <form onSubmit={(ev) => void onUploadDeck(ev)} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <input name="file" type="file" accept="application/pdf" required className="text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-white" />
          <button
            type="submit"
            disabled={busy === 'upload'}
            className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
          >
            {busy === 'upload' ? 'Uploading…' : 'Upload PDF'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Investor proof ledger</h2>
          <button
            type="button"
            onClick={() => void loadLedger()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
        {ledgerErr ? <p className="mt-3 text-sm text-rose-300/90">{ledgerErr}</p> : null}
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-white/10 bg-black/30 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Signed</th>
                <th className="px-3 py-2">Last deck activity</th>
                <th className="px-3 py-2">Revoked</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                    No rows yet.
                  </td>
                </tr>
              ) : (
                ledger.map((r) => (
                  <tr key={r.email} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 font-mono text-[11px] text-cyan-100/90">{r.email}</td>
                    <td className="px-3 py-2 text-zinc-400">{r.signedAt ? new Date(r.signedAt).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-zinc-400">
                      {r.lastDeckActivity ? new Date(r.lastDeckActivity).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2">{r.revoked ? <span className="text-rose-300/90">Yes</span> : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 backdrop-blur-xl">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Global kill-switch</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Invalidate portal access for a specific email. The session cookie may still exist until it expires, but deck,
          analytics, and portal APIs refuse revoked identities.
        </p>
        <form onSubmit={(ev) => void onRevoke(ev)} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={revokeEmail}
            onChange={(e) => setRevokeEmail(e.target.value)}
            type="email"
            placeholder="investor@company.com"
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy === 'revoke'}
            className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
          >
            {busy === 'revoke' ? 'Revoking…' : 'Revoke access'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 backdrop-blur-xl">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Base formulas (yield JSON)</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Host-defined model: <code className="rounded bg-black/40 px-1 text-[11px] text-cyan-200/90">revenueExpr</code> and{' '}
          <code className="rounded bg-black/40 px-1 text-[11px] text-cyan-200/90">profitExpr</code> optional; sliders drive
          stress ranges.
        </p>
        <form onSubmit={(ev) => void onSaveYield(ev)} className="mt-4 flex flex-col gap-3">
          <textarea
            value={yieldJson}
            onChange={(e) => setYieldJson(e.target.value)}
            rows={14}
            className="w-full rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-cyan-100/90 focus:border-cyan-400/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy === 'yield'}
            className="self-start rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {busy === 'yield' ? 'Saving…' : 'Save yield config'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 backdrop-blur-xl">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Preview embed (HTTPS)</h2>
        <form onSubmit={(ev) => void onSavePreview(ev)} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={previewUrl}
            onChange={(e) => setPreviewUrl(e.target.value)}
            type="url"
            placeholder="https://www.figma.com/embed/..."
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy === 'preview'}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {busy === 'preview' ? 'Saving…' : 'Save URL'}
          </button>
        </form>
      </section>
    </div>
  );
}
