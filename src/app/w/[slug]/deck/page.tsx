import { notFound } from 'next/navigation';
import { DeckViewerShell } from '@/components/deck/DeckViewerShell';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getCachedWorkspaceRowBySlug, isValidWorkspaceSlug } from '@/lib/workspace';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ viewer?: string; email?: string }>;
};

export default async function WorkspaceDeckPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!isValidWorkspaceSlug(slug)) notFound();

  const row = await getCachedWorkspaceRowBySlug(slug);
  if (!row) {
    if (!getSupabaseAdmin()) {
      return (
        <div className="mx-auto max-w-lg px-6 py-16 text-center text-sm text-zinc-600">
          Configure Supabase to load the deck viewer.
        </div>
      );
    }
    notFound();
  }

  const embedUrl = row.deck_embed_url?.trim() ?? '';
  const watermarkEnabled = row.deck_watermark_enabled !== false;

  if (!embedUrl) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-zinc-600">
        <p className="font-medium text-zinc-900">Deck not configured</p>
        <p className="mt-2">
          Set <code className="rounded bg-zinc-100 px-1">deck_embed_url</code> on this workspace in Supabase (HTTPS
          embed link).
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <DeckViewerShell
        tenantSlug={slug}
        embedUrl={embedUrl}
        watermarkEnabled={watermarkEnabled}
        initialViewerName={sp.viewer ?? null}
        initialViewerEmail={sp.email ?? null}
      />
    </div>
  );
}
