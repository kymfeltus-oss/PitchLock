import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { verifyFounderJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export default async function AdminHomePage() {
  const jar = await cookies();
  const raw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  if (!raw) redirect('/admin/login');

  let workspaceId: string;
  try {
    workspaceId = (await verifyFounderJwt(raw)).workspace_id;
  } catch {
    redirect('/admin/login');
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return <p className="p-10 text-sm text-zinc-600">Supabase not configured.</p>;
  }

  const { data: pitchList } = await admin
    .from('pitches')
    .select('id, title, public_code, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  const pitchRows = Array.isArray(pitchList) ? pitchList : [];
  const pitchIds = pitchRows.map((p: { id: string }) => p.id).filter(Boolean);

  const ndaPromise =
    pitchIds.length > 0
      ? admin.from('nda_signatures').select('id, pitch_id, email, created_at').in('pitch_id', pitchIds).order('created_at', { ascending: false }).limit(80)
      : Promise.resolve({ data: [] as Record<string, unknown>[] });

  const sessPromise =
    pitchIds.length > 0
      ? admin
          .from('pitch_sessions')
          .select('id, pitch_id, status, started_at')
          .in('pitch_id', pitchIds)
          .order('started_at', { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] as Record<string, unknown>[] });

  const [{ data: ndaData }, { data: sessData }] = await Promise.all([ndaPromise, sessPromise]);
  const ndaRows = Array.isArray(ndaData) ? ndaData : [];
  const sessRows = Array.isArray(sessData) ? sessData : [];

  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000';

  return (
    <div className="min-h-full bg-zinc-50 px-6 py-12 text-zinc-900">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Founder dashboard</h1>
            <p className="mt-1 text-sm text-zinc-600">Pitch links, NDA intake, and session visibility.</p>
          </div>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100">
              Sign out
            </button>
          </form>
        </header>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Pitches</h2>
          <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {pitchRows.length === 0 ? (
              <li className="px-4 py-6 text-sm text-zinc-500">No pitches yet. Run SQL seed or insert a row.</li>
            ) : (
              pitchRows.map((p: Record<string, unknown>) => {
                const id = String(p.id);
                const gate = `${origin}/pitch/${id}/gate`;
                const lastSess = sessRows.find((s: Record<string, unknown>) => String(s.pitch_id) === id);
                const roomHost = lastSess ? `${origin}/pitch/${id}/room?session=${String(lastSess.id)}` : null;
                return (
                  <li key={id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{String(p.title)}</p>
                      <p className="text-xs text-zinc-500">
                        code <code className="rounded bg-zinc-100 px-1">{String(p.public_code)}</code>
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 text-sm sm:items-end">
                      <Link className="text-cyan-700 underline" href={`/admin/command/${id}`}>
                        Command center
                      </Link>
                      <Link className="text-cyan-700 underline" href={gate}>
                        Investor gate link
                      </Link>
                      {roomHost ? (
                        <span className="text-right text-xs text-zinc-500">
                          Host room:{' '}
                          <Link className="text-cyan-700 underline" href={roomHost}>
                            open
                          </Link>
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500">Host room link appears after a live session exists.</span>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">NDA signatures</h2>
            <ul className="mt-3 max-h-72 overflow-auto rounded-xl border border-zinc-200 bg-white text-sm">
              {ndaRows.length === 0 ? (
                <li className="px-3 py-4 text-zinc-500">No signatures yet.</li>
              ) : (
                ndaRows.map((n: Record<string, unknown>) => (
                  <li key={String(n.id)} className="border-b border-zinc-100 px-3 py-2 last:border-0">
                    <span className="font-medium">{String(n.email)}</span>
                    <span className="text-zinc-500"> · pitch {String(n.pitch_id).slice(0, 8)}…</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent sessions</h2>
            <ul className="mt-3 max-h-72 overflow-auto rounded-xl border border-zinc-200 bg-white text-sm">
              {sessRows.length === 0 ? (
                <li className="px-3 py-4 text-zinc-500">No sessions yet.</li>
              ) : (
                sessRows.map((s: Record<string, unknown>) => (
                  <li key={String(s.id)} className="border-b border-zinc-100 px-3 py-2 last:border-0">
                    <span className="font-mono text-xs">{String(s.id).slice(0, 8)}…</span>
                    <span className="text-zinc-500"> · {String(s.status)}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
