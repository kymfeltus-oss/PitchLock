'use client';

import { useEffect, useState } from 'react';

type Props = {
  viewerName: string;
  viewerEmail?: string | null;
  /** Lower opacity = subtler; still visible on screenshots. */
  opacity?: number;
};

export function DeckWatermarkOverlay({ viewerName, viewerEmail, opacity = 0.11 }: Props) {
  const [, setClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClock((c) => c + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const linePrimary = `Viewing for ${viewerName}`;
  const lineSecondary = viewerEmail?.trim() ? `${viewerEmail.trim()} · ` : '';
  const time = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const tiles = Array.from({ length: 18 }, (_, i) => (
    <span key={i} className="block whitespace-nowrap px-8 py-10 text-sm font-semibold tracking-wide text-zinc-900">
      {linePrimary}
      <span className="font-normal text-zinc-700"> · {lineSecondary}</span>
      {time} UTC
    </span>
  ));

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden"
      style={{ opacity }}
      aria-hidden
    >
      <div
        className="absolute -left-1/2 -top-1/2 flex h-[200%] w-[200%] flex-wrap content-start justify-center"
        style={{ transform: 'rotate(-14deg)' }}
      >
        {tiles}
      </div>
    </div>
  );
}
