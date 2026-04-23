import type { SupabaseClient } from '@supabase/supabase-js';

export async function isInvestorRevoked(
  admin: SupabaseClient,
  pitchId: string,
  emailLower: string,
): Promise<boolean> {
  const e = emailLower.trim().toLowerCase();
  if (!e) return false;
  const { data, error } = await admin
    .from('investor_access_revocations')
    .select('id')
    .eq('pitch_id', pitchId)
    .eq('email', e)
    .maybeSingle();
  if (error) {
    console.warn('[revocation]', error.message);
    return false;
  }
  return Boolean(data?.id);
}
