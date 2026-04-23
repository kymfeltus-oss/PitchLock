import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getCachedWorkspaceRowBySlug, isValidWorkspaceSlug, toPublicWorkspace } from '@/lib/workspace';

type Props = { params: Promise<{ slug: string }> };

export default async function WorkspaceHomePage({ params }: Props) {
  const { slug } = await params;
  if (!isValidWorkspaceSlug(slug)) notFound();

  const row = await getCachedWorkspaceRowBySlug(slug);
  if (!row) {
    const admin = getSupabaseAdmin();
    if (!admin) {
      return (
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">Server storage not configured</h1>
          <p className="mt-3 text-sm text-zinc-600">
            Set <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code>, run the SQL
            migrations in <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">supabase/migrations</code>, then
            reload.
          </p>
        </div>
      );
    }
    notFound();
  }

  const w = toPublicWorkspace(row);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Overview</p>
      <p className="mt-2 text-sm text-zinc-600">
        Tenant slug <code className="rounded bg-white px-1.5 py-0.5 text-xs ring-1 ring-zinc-200">{w.slug}</code>
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href={`/w/${w.slug}/deck`}
          className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Open deck viewer
        </a>
        <a
          href={`/w/${w.slug}/security`}
          className="inline-flex rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Audit log (needs token)
        </a>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Security dashboard: <code className="rounded bg-zinc-100 px-1">/w/{w.slug}/security?token=…</code> — use{' '}
        <code className="rounded bg-zinc-100 px-1">audit_dashboard_token</code> from Supabase.
      </p>

      <dl className="mt-8 space-y-4 text-sm">
        <div>
          <dt className="font-medium text-zinc-800">Contact</dt>
          <dd className="mt-0.5 text-zinc-600">{w.contact_email ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-800">NDA version label</dt>
          <dd className="mt-0.5 text-zinc-600">{w.nda_version_label ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-800">Deck embed</dt>
          <dd className="mt-0.5 break-all text-zinc-600">{w.deck_embed_url ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-800">Scheduling</dt>
          <dd className="mt-0.5 break-all text-zinc-600">{w.scheduling_url ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-800">NDA document on file</dt>
          <dd className="mt-0.5 text-zinc-600">{w.has_nda_document ? 'Yes' : 'No'}</dd>
        </div>
      </dl>
    </div>
  );
}
