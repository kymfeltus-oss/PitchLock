'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';

type AssetRow = { id: string; slotKey: string; title: string; hasFile: boolean };

export function AssetDrawer({ pitchId }: { pitchId: string }) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/investor-assets`, { credentials: 'include' });
      const j = (await res.json()) as { ok?: boolean; assets?: AssetRow[] };
      setAssets(Array.isArray(j.assets) ? j.assets : []);
    } finally {
      setLoading(false);
    }
  }, [pitchId]);

  useEffect(() => {
    if (open) queueMicrotask(() => void load());
  }, [open, load]);

  async function openAsset(a: AssetRow) {
    if (!a.hasFile) return;
    const res = await fetch(`/api/pitch/${encodeURIComponent(pitchId)}/investor-assets/${encodeURIComponent(a.id)}/url`, {
      credentials: 'include',
    });
    const j = (await res.json()) as { ok?: boolean; url?: string };
    if (res.ok && j.ok && j.url) {
      setActiveUrl(j.url);
      setActiveTitle(a.title);
    }
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] rounded-full border border-cyan-400/40 bg-zinc-950/90 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100 shadow-[0_0_32px_rgba(34,211,238,0.35)] backdrop-blur-md"
        whileTap={{ scale: 0.95 }}
        layout
      >
        Assets
      </motion.button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-[65] bg-black/45 backdrop-blur-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 right-0 z-[70] flex w-[min(100vw,320px)] flex-col border-l border-white/10 bg-zinc-950/95 shadow-[-12px_0_48px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            >
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">Asset drawer</p>
                <p className="text-sm font-medium text-white">War room files</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {loading ? <p className="text-xs text-zinc-500">Loading…</p> : null}
                <ul className="flex flex-col gap-2">
                  {assets.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        disabled={!a.hasFile}
                        onClick={() => void openAsset(a)}
                        className="flex w-full flex-col rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left text-xs text-zinc-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/5 disabled:opacity-40"
                      >
                        <span className="font-semibold text-white">{a.title}</span>
                        <span className="mt-0.5 font-mono text-[10px] text-zinc-500">{a.slotKey}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {activeUrl ? (
                <div className="border-t border-white/10 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{activeTitle}</p>
                  <iframe title={activeTitle ?? 'Asset'} src={activeUrl} className="h-48 w-full rounded-lg border border-white/10 bg-black" />
                </div>
              ) : null}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
