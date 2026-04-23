import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/** Lowercase hostname-style segment for /w/[slug]. */
export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

export type WorkspaceRow = {
  id: string;
  created_at: string;
  slug: string;
  name: string;
  contact_email: string | null;
  deck_embed_url: string | null;
  scheduling_url: string | null;
  primary_color: string | null;
  logo_url: string | null;
  nda_document_text: string | null;
  nda_version_label: string | null;
  /** Present after white-label migration; treat as optional at runtime. */
  tagline?: string | null;
  show_powered_by?: boolean | null;
  /** After security migration; default true when column missing. */
  deck_watermark_enabled?: boolean | null;
  /** Never expose via `toPublicWorkspace` or public JSON. */
  audit_dashboard_token?: string | null;
};

export type WorkspacePublic = Pick<
  WorkspaceRow,
  | 'slug'
  | 'name'
  | 'contact_email'
  | 'deck_embed_url'
  | 'scheduling_url'
  | 'primary_color'
  | 'logo_url'
  | 'nda_version_label'
  | 'tagline'
  | 'show_powered_by'
> & { has_nda_document: boolean };

export function isValidWorkspaceSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return s.length > 0 && WORKSPACE_SLUG_PATTERN.test(s);
}

export function toPublicWorkspace(row: WorkspaceRow): WorkspacePublic {
  return {
    slug: row.slug,
    name: row.name,
    contact_email: row.contact_email,
    deck_embed_url: row.deck_embed_url,
    scheduling_url: row.scheduling_url,
    primary_color: row.primary_color,
    logo_url: row.logo_url,
    nda_version_label: row.nda_version_label,
    tagline: row.tagline ?? null,
    show_powered_by: Boolean(row.show_powered_by),
    has_nda_document: Boolean(row.nda_document_text && row.nda_document_text.trim().length > 0),
  };
}

export async function fetchWorkspaceBySlug(
  admin: SupabaseClient,
  slug: string,
): Promise<WorkspaceRow | null> {
  const normalized = slug.trim().toLowerCase();
  if (!isValidWorkspaceSlug(normalized)) return null;

  const { data, error } = await admin.from('workspaces').select('*').eq('slug', normalized).maybeSingle();

  if (error) {
    console.error('[workspace] fetchWorkspaceBySlug', error.message);
    return null;
  }
  return data as WorkspaceRow | null;
}

/**
 * Per-request dedupe for layout + page under the same /w/[slug].
 * Returns null when slug is invalid, admin is missing, or workspace does not exist.
 */
export const getCachedWorkspaceRowBySlug = cache(async (slug: string): Promise<WorkspaceRow | null> => {
  if (!isValidWorkspaceSlug(slug)) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  return fetchWorkspaceBySlug(admin, slug);
});
