import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Optional: invoke Supabase Edge Function `nda-automation` after an `nda_logs` row exists.
 * Deploy `supabase/functions/nda-automation` and set `SUPABASE_EDGE_NDA_AUTOMATION` to `1` to enable.
 */
export async function invokeNdaAutomationEdge(ndaLogId: string): Promise<void> {
  if (process.env.SUPABASE_EDGE_NDA_AUTOMATION !== '1') return;
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.functions.invoke('nda-automation', { body: { nda_log_id: ndaLogId } });
  if (error) {
    console.warn('[edge-nda-automation]', error.message);
  }
}
