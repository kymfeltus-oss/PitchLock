import { notFound } from 'next/navigation';
import { safeEqualToken } from '@/lib/audit-token';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchWorkspaceBySlug, isValidWorkspaceSlug } from '@/lib/workspace';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function SecurityDashboardPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { token } = await searchParams;
  if (!isValidWorkspaceSlug(slug)) notFound();

  const admin = getSupabaseAdmin();
  if (!admin) {
    return <p className="px-6 py-16 text-center text-sm text-zinc-600">Supabase is not configured.</p>;
  }

  const workspace = await fetchWorkspaceBySlug(admin, slug);
  if (!workspace) notFound();

  if (!safeEqualToken(token, workspace.audit_dashboard_token ?? null)) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center text-sm text-zinc-600">
        <h1 className="text-lg font-semibold text-zinc-900">Access denied</h1>
        <p className="mt-3">Provide a valid <code className="rounded bg-zinc-100 px-1">token</code> query parameter.</p>
      </div>
    );
  }

  const [{ data: sessions }, { data: events }] = await Promise.all([
    admin
      .from('deck_view_sessions')
      .select('id, viewer_name, viewer_email, started_at, last_heartbeat_at, client_ip')
      .eq('workspace_id', workspace.id)
      .order('started_at', { ascending: false })
      .limit(40),
    admin
      .from('deck_audit_events')
      .select('id, session_id, event_type, slide_key, duration_ms, created_at')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(150),
  ]);

  const sessRows = Array.isArray(sessions) ? sessions : [];
  const evRows = Array.isArray(events) ? events : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold text-zinc-900">Deck access & audit</h1>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600">
        Sessions show who identified before viewing. Events include deck open, tab visibility changes, and throttled
        heartbeats while the deck tab stays open. Per-slide dwell time requires the embed vendor to send slide hints
        (optional API hook later).
      </p>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent sessions</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase text-zinc-600">
              <tr>
                <th className="px-3 py-2">Viewer</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Started (UTC)</th>
                <th className="px-3 py-2">Last heartbeat</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {sessRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-zinc-500" colSpan={5}>
                    No deck sessions yet.
                  </td>
                </tr>
              ) : (
                sessRows.map((s: Record<string, unknown>) => (
                  <tr key={String(s.id)} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-zinc-900">{String(s.viewer_name ?? '')}</td>
                    <td className="px-3 py-2 text-zinc-600">{s.viewer_email ? String(s.viewer_email) : '—'}</td>
                    <td className="px-3 py-2 text-zinc-600">{String(s.started_at ?? '').replace('T', ' ').slice(0, 19)}</td>
                    <td className="px-3 py-2 text-zinc-600">
                      {String(s.last_heartbeat_at ?? '').replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{s.client_ip ? String(s.client_ip) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent events</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase text-zinc-600">
              <tr>
                <th className="px-3 py-2">Time (UTC)</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Slide</th>
                <th className="px-3 py-2">Duration ms</th>
                <th className="px-3 py-2">Session</th>
              </tr>
            </thead>
            <tbody>
              {evRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-zinc-500" colSpan={5}>
                    No events yet.
                  </td>
                </tr>
              ) : (
                evRows.map((e: Record<string, unknown>) => (
                  <tr key={String(e.id)} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2 text-zinc-600">{String(e.created_at ?? '').replace('T', ' ').slice(0, 19)}</td>
                    <td className="px-3 py-2 font-medium text-zinc-900">{String(e.event_type ?? '')}</td>
                    <td className="px-3 py-2 text-zinc-600">{e.slide_key ? String(e.slide_key) : '—'}</td>
                    <td className="px-3 py-2 text-zinc-600">{e.duration_ms != null ? String(e.duration_ms) : '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500">{String(e.session_id ?? '').slice(0, 8)}…</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
