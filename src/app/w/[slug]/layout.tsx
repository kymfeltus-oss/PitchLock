import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { WorkspaceChrome } from '@/components/workspace/WorkspaceChrome';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getCachedWorkspaceRowBySlug, isValidWorkspaceSlug, toPublicWorkspace } from '@/lib/workspace';

type Props = { children: ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isValidWorkspaceSlug(slug)) {
    return { title: 'Workspace' };
  }
  const row = await getCachedWorkspaceRowBySlug(slug);
  if (!row) {
    return { title: 'Workspace' };
  }
  const description = row.tagline?.trim() || undefined;
  return {
    title: row.name,
    description,
    robots: { index: false, follow: false },
    ...(row.logo_url
      ? {
          openGraph: {
            title: row.name,
            description,
            images: [{ url: row.logo_url }],
          },
        }
      : {}),
  };
}

export default async function WorkspaceLayout({ children, params }: Props) {
  const { slug } = await params;
  if (!isValidWorkspaceSlug(slug)) {
    return <div className="flex-1">{children}</div>;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return <div className="flex-1">{children}</div>;
  }

  const row = await getCachedWorkspaceRowBySlug(slug);
  if (!row) notFound();

  return <WorkspaceChrome workspace={toPublicWorkspace(row)}>{children}</WorkspaceChrome>;
}
