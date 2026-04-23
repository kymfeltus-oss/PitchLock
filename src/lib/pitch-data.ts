import type { SupabaseClient } from '@supabase/supabase-js';

export type PitchWithWorkspace = {
  pitch: {
    id: string;
    title: string;
    public_code: string;
    nda_document_text: string | null;
    nda_version: string;
    primary_deck_path: string | null;
    deck_pdf_storage_path: string | null;
    yield_config: unknown;
    preview_embed_url: string | null;
    workspace_id: string;
  };
  workspace: {
    id: string;
    slug: string;
    name: string;
    primary_color: string | null;
    logo_url: string | null;
    tagline: string | null;
    deck_embed_url: string | null;
    contact_email: string | null;
  };
};

export async function fetchPitchBundleById(
  admin: SupabaseClient,
  pitchId: string,
): Promise<PitchWithWorkspace | null> {
  const { data: pitch, error } = await admin.from('pitches').select('*').eq('id', pitchId).maybeSingle();
  if (error || !pitch) return null;
  const ws = await admin.from('workspaces').select('*').eq('id', (pitch as { workspace_id: string }).workspace_id).maybeSingle();
  if (ws.error || !ws.data) return null;
  const p = pitch as Record<string, unknown>;
  const w = ws.data as Record<string, unknown>;
  return {
    pitch: {
      id: String(p.id),
      title: String(p.title),
      public_code: String(p.public_code),
      nda_document_text: p.nda_document_text != null ? String(p.nda_document_text) : null,
      nda_version: String(p.nda_version ?? 'v1'),
      primary_deck_path: p.primary_deck_path != null ? String(p.primary_deck_path) : null,
      deck_pdf_storage_path: p.deck_pdf_storage_path != null ? String(p.deck_pdf_storage_path) : null,
      yield_config: p.yield_config ?? {},
      preview_embed_url: p.preview_embed_url != null ? String(p.preview_embed_url) : null,
      workspace_id: String(p.workspace_id),
    },
    workspace: {
      id: String(w.id),
      slug: String(w.slug),
      name: String(w.name),
      primary_color: w.primary_color != null ? String(w.primary_color) : null,
      logo_url: w.logo_url != null ? String(w.logo_url) : null,
      tagline: w.tagline != null ? String(w.tagline) : null,
      deck_embed_url: w.deck_embed_url != null ? String(w.deck_embed_url) : null,
      contact_email: w.contact_email != null ? String(w.contact_email) : null,
    },
  };
}
