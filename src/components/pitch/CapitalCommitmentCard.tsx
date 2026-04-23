'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

type Props = {
  pitchId: string;
  deckCoverageRatio: number;
  hasPdfDeck: boolean;
};

export function CapitalCommitmentCard({ pitchId, deckCoverageRatio, hasPdfDeck }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unlocked = hasPdfDeck && deckCoverageRatio >= 0.69;

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/soft-commit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commitmentAmount: amount,
          valueAddNotes: notes,
          deckCoverageRatio,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error === 'deck_not_engaged_enough' ? 'Review more of the deck to unlock this step.' : 'Unable to submit.');
        return;
      }
      setDone(true);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-fuchsia-500/20 bg-zinc-950/50 p-4 shadow-[0_0_48px_rgba(217,70,239,0.12)] backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-fuchsia-200/90">Capital commitment</h2>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Non-binding soft interest. Creates a PDF record for the founder and links to your signed gate agreement.
          </p>
        </div>
        {!unlocked ? (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100/90">
            {Math.round(deckCoverageRatio * 100)}% explored · need 70%
          </span>
        ) : null}
      </div>
      <button
        type="button"
        disabled={!unlocked || done}
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 py-3 text-xs font-semibold uppercase tracking-wide text-fuchsia-100 shadow-[0_0_24px_rgba(217,70,239,0.25)] transition hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {done ? 'Commitment logged' : unlocked ? 'Open closer' : 'Locked until deck engagement'}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 backdrop-blur-md sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal
              className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 p-6 shadow-[0_0_60px_rgba(34,211,238,0.18)]"
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300/80">Soft interest</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Signal conviction</h3>
              <p className="mt-2 text-xs text-zinc-500">Illustrative amount and how you would add value — not a legal commitment.</p>
              <label className="mt-4 block text-[11px] text-zinc-400">
                Soft interest amount
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
                  placeholder="$500,000"
                />
              </label>
              <label className="mt-3 block text-[11px] text-zinc-400">
                Primary value add
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
                  placeholder="Operator playbooks, portfolio intros, technical diligence…"
                />
              </label>
              {err ? <p className="mt-2 text-xs text-rose-300/90">{err}</p> : null}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-zinc-200"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="flex-1 rounded-lg border border-cyan-400/50 bg-cyan-400/15 py-2.5 text-xs font-semibold text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                  onClick={() => void submit()}
                >
                  {busy ? 'Submitting…' : 'Log commitment'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {done ? (
          <motion.div
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/88 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.p
              className="text-sm font-semibold text-cyan-200"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [1, 1.06, 1], opacity: 1 }}
              transition={{ duration: 0.6 }}
            >
              Commitment logged
            </motion.p>
            <p className="text-[11px] text-zinc-500">The founder has been emailed with your summary PDF.</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
