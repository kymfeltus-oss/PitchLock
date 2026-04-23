// Supabase Edge Function (Deno) — deploy with `supabase functions deploy nda-automation`
// Optional hook after `nda_logs` insert. Enable from app with SUPABASE_EDGE_NDA_AUTOMATION=1.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let body: { nda_log_id?: string };
  try {
    body = (await req.json()) as { nda_log_id?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const id = typeof body.nda_log_id === 'string' ? body.nda_log_id : '';
  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: 'nda_log_id_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extend: re-send email, virus-scan PDF, push CRM, etc.
  console.log('[nda-automation] received nda_log_id', id);

  return new Response(JSON.stringify({ ok: true, received: id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
