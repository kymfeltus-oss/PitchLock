'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { normalizeWorkspacePrimaryColor } from '@/lib/branding';

export type WhiteLabelWorkspace = {
  name: string;
  slug: string;
  primary_color: string | null;
  logo_url: string | null;
  tagline: string | null;
};

export function WhiteLabelRoot({
  workspace,
  children,
}: {
  workspace: WhiteLabelWorkspace;
  children: ReactNode;
}) {
  const primary = normalizeWorkspacePrimaryColor(workspace.primary_color) ?? '#38bdf8';
  const style = useMemo(
    () =>
      ({
        ['--wl-primary' as string]: primary,
        ['--wl-glow' as string]: `${primary}55`,
      }) as CSSProperties,
    [primary],
  );

  return (
    <div
      style={style}
      className="relative min-h-full bg-zinc-950 text-zinc-100 [--ring:color-mix(in_oklab,var(--wl-primary)_35%,transparent)]"
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-70"
        aria-hidden
        style={{
          backgroundImage: [
            'radial-gradient(1200px_600px_at_20%_-10%,var(--wl-glow),transparent)',
            'radial-gradient(900px_500px_at_100%_0%,rgba(56,189,248,0.12),transparent)',
            'linear-gradient(180deg,rgba(2,6,23,0.2),rgba(2,6,23,0.92))',
          ].join(','),
        }}
      />
      <div className="relative z-[1] flex min-h-full flex-col">{children}</div>
    </div>
  );
}
