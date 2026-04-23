import type { SupabaseClient } from '@supabase/supabase-js';

export type LegalTemplateRow = {
  version: string;
  title: string;
  body: string;
  is_active: boolean;
};

export async function resolveLegalTemplateForPitch(
  admin: SupabaseClient,
  pitchNdaVersion: string | null | undefined,
): Promise<LegalTemplateRow | null> {
  const v = pitchNdaVersion?.trim();
  if (v) {
    const { data, error } = await admin.from('legal_templates').select('*').eq('version', v).maybeSingle();
    if (!error && data) return data as LegalTemplateRow;
  }
  const { data: active } = await admin
    .from('legal_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return active ? (active as LegalTemplateRow) : null;
}
