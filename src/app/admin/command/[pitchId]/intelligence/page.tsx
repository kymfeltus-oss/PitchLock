import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { IntelligenceMissionClient } from '@/components/admin/IntelligenceMissionClient';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Props = { params: Promise<{ pitchId: string }> };

export default async function IntelligenceMissionPage({ params }: Props) {
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

  return (
    <div className="min-h-full bg-zinc-950 px-4 py-10 text-zinc-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/admin/command/${pitchId}`}
          className="text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-400/80 hover:text-cyan-300"
        >
          ← Command center
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Mission control · engagement</h1>
        <p className="mt-1 text-sm text-zinc-500">{bundle.pitch.title}</p>
        <IntelligenceMissionClient pitchId={pitchId} />
      </div>
    </div>
  );
}
