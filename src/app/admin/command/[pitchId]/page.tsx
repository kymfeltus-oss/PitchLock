import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { CommandCenterClient } from '@/components/admin/CommandCenterClient';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Props = { params: Promise<{ pitchId: string }> };

export default async function CommandCenterPage({ params }: Props) {
  const { pitchId } = await params;
  const jar = await cookies();
  const founderRaw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  if (!founderRaw) redirect('/admin/login');

  let founderWs: string;
  try {
    founderWs = (await verifyFounderJwt(founderRaw)).workspace_id;
  } catch {
    redirect('/admin/login');
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return <p className="p-10 text-sm text-zinc-500">Supabase not configured.</p>;
  }

  const bundle = await fetchPitchBundleById(admin, pitchId);
  if (!bundle || bundle.pitch.workspace_id !== founderWs) notFound();

  const initialYieldJson = JSON.stringify(bundle.pitch.yield_config ?? {}, null, 2);
  const initialPreview = bundle.pitch.preview_embed_url ?? '';

  return (
    <div className="min-h-full bg-zinc-950 px-4 py-10 text-zinc-100 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/admin" className="text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-400/80 hover:text-cyan-300">
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Command center</h1>
            <p className="mt-1 text-sm text-zinc-500">{bundle.pitch.title}</p>
          </div>
          <form action="/api/admin/logout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </div>
        <CommandCenterClient
          pitchId={pitchId}
          pitchTitle={bundle.pitch.title}
          initialYieldJson={initialYieldJson}
          initialPreviewUrl={initialPreview}
        />
      </div>
    </div>
  );
}
