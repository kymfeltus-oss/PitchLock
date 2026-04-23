import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { PitchSurfaceProvider } from '@/components/white-label/PitchSurfaceContext';
import { WhiteLabelRoot } from '@/components/white-label/WhiteLabelRoot';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Props = { children: ReactNode; params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return { title: 'Pitch', robots: { index: false, follow: false } };
  const bundle = await fetchPitchBundleById(admin, id);
  if (!bundle) return { title: 'Pitch', robots: { index: false, follow: false } };
  return {
    title: `${bundle.pitch.title} · ${bundle.workspace.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function PitchLayout({ children, params }: Props) {
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) {
    return (
      <div className="min-h-full bg-zinc-950 px-6 py-20 text-center text-sm text-zinc-400">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const bundle = await fetchPitchBundleById(admin, id);
  if (!bundle) notFound();

  const jar = await cookies();
  let isHost = false;
  const founderRaw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  if (founderRaw) {
    try {
      const f = await verifyFounderJwt(founderRaw);
      isHost = f.workspace_id === bundle.pitch.workspace_id;
    } catch {
      isHost = false;
    }
  }

  return (
    <WhiteLabelRoot
      workspace={{
        name: bundle.workspace.name,
        slug: bundle.workspace.slug,
        primary_color: bundle.workspace.primary_color,
        logo_url: bundle.workspace.logo_url,
        tagline: bundle.workspace.tagline,
      }}
    >
      <PitchSurfaceProvider pitchId={id} isHost={isHost}>
        {children}
      </PitchSurfaceProvider>
    </WhiteLabelRoot>
  );
}
