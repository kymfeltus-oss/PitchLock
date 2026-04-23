import { notFound } from 'next/navigation';
import { safeEqualToken } from '@/lib/audit-token';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Props = { params: Promise<{ logId: string }>; searchParams: Promise<{ t?: string }> };

export default async function NdaReviewPage({ params, searchParams }: Props) {
  const { logId } = await params;
  const { t } = await searchParams;
  const admin = getSupabaseAdmin();
  if (!admin) {
    return <p className="p-12 text-center text-sm text-zinc-500">Server not configured.</p>;
  }

  const { data: row, error } = await admin.from('nda_logs').select('*').eq('id', logId).maybeSingle();
  if (error || !row) notFound();

  const token = typeof row.owner_review_token === 'string' ? row.owner_review_token : '';
  if (!safeEqualToken(t, token)) {
    return (
      <div className="min-h-full bg-zinc-950 px-6 py-24 text-center text-sm text-zinc-400">
        <h1 className="text-lg font-semibold text-white">Invalid or missing link</h1>
        <p className="mt-3">Use the full URL from your notification email.</p>
      </div>
    );
  }

  const depth = typeof row.scroll_max_depth_percent === 'number' ? row.scroll_max_depth_percent : 0;
  const reached = Boolean(row.reached_document_end);
  const verdict =
    reached && depth >= 98
      ? 'High engagement — they reached the bottom of the agreement.'
      : depth < 35
        ? 'Low scroll depth before signing — they may have skimmed or jumped to the signature block.'
        : 'Moderate engagement — they moved through a meaningful portion of the text.';

  return (
    <div className="min-h-full bg-zinc-950 px-6 py-16 text-zinc-100">
      <div className="mx-auto max-w-xl rounded-2xl border border-cyan-500/25 bg-zinc-900/60 p-8 shadow-[0_0_60px_-20px_rgba(0,242,255,0.35)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">NDA read-through</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">{String(row.full_name)}</h1>
        <p className="mt-1 text-sm text-zinc-400">{String(row.email)}</p>
        <p className="mt-8 text-sm text-zinc-300">{verdict}</p>
        <dl className="mt-8 grid gap-4 text-sm">
          <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
            <dt className="text-zinc-500">Max scroll depth</dt>
            <dd className="font-mono text-cyan-200">{depth}%</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
            <dt className="text-zinc-500">Reached document end</dt>
            <dd>{reached ? 'Yes' : 'No'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
            <dt className="text-zinc-500">Signed (UTC)</dt>
            <dd className="font-mono text-xs text-zinc-300">{String(row.signed_at).replace('T', ' ').slice(0, 19)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Template version</dt>
            <dd className="font-mono text-xs text-zinc-300">{String(row.legal_template_version ?? '—')}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
