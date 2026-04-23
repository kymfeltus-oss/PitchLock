'use client';

import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GlassButton } from '@/components/white-label/GlassButton';
import { CinematicPanel } from '@/components/white-label/CinematicPanel';

export default function AdminLoginPage() {
  const router = useRouter();
  const [slug, setSlug] = useState('demo');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ workspaceSlug: slug, password }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr('Invalid workspace or password.');
        return;
      }
      router.push('/admin');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex min-h-full flex-col items-center justify-center bg-zinc-950 px-4 py-20 text-zinc-100"
      style={{ ['--wl-primary' as string]: '#38bdf8' }}
    >
      <CinematicPanel
        eyebrow="Founder access"
        title="Workspace sign-in"
        subtitle="Development login. Replace with Supabase Auth for production founders."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-400" htmlFor="slug">
              Workspace slug
            </label>
            <input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400" htmlFor="pw">
              Password
            </label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
            />
          </div>
          {err ? <p className="text-sm text-rose-300">{err}</p> : null}
          <GlassButton type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Continue'}
          </GlassButton>
        </form>
      </CinematicPanel>
    </div>
  );
}
