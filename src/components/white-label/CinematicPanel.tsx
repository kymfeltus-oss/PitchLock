'use client';

import type { ReactNode } from 'react';

export function CinematicPanel({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-950/55 p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_24px_80px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl transition duration-500 ease-out hover:border-white/15">
      {eyebrow ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">{eyebrow}</p>
      ) : null}
      <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
      {subtitle ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">{subtitle}</p> : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}
