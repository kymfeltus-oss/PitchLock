import { notFound } from 'next/navigation';
import { NdaGateForm } from '@/components/pitch/NdaGateForm';
import { resolveLegalTemplateForPitch } from '@/lib/legal-templates';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Props = { params: Promise<{ id: string }> };

export default async function PitchGatePage({ params }: Props) {
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) {
    return <p className="px-6 py-20 text-center text-sm text-zinc-400">Supabase is not configured.</p>;
  }
  const bundle = await fetchPitchBundleById(admin, id);
  if (!bundle) notFound();

  const template = await resolveLegalTemplateForPitch(admin, bundle.pitch.nda_version);
  const ndaBody = template?.body?.trim() || bundle.pitch.nda_document_text?.trim() || 'NDA text is not yet configured.';
  const legalVersion = template?.version?.trim() || bundle.pitch.nda_version || 'unknown';
  const ndaTitle = template?.title?.trim() || `${bundle.workspace.name} — confidential access`;

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-8">
        <div className="flex items-center gap-3">
          {bundle.workspace.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bundle.workspace.logo_url} alt="" className="h-9 w-auto max-w-[160px] object-contain" />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-cyan-500/20 shadow-[0_0_24px_rgba(0,242,255,0.25)]" />
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Investor portal</p>
            <p className="text-sm font-semibold text-white">{bundle.pitch.title}</p>
          </div>
        </div>
      </header>
      <NdaGateForm pitchId={id} ndaTitle={ndaTitle} ndaBody={ndaBody} legalVersion={legalVersion} />
    </div>
  );
}
