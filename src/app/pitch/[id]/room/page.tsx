import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { WarRoomShell } from '@/components/pitch/WarRoomShell';
import { FOUNDER_SESSION_COOKIE, investorPitchCookieName } from '@/lib/pitch-cookies';
import { isInvestorRevoked } from '@/lib/investor-revocation';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt, verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ session?: string }> };

export default async function PitchRoomPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const admin = getSupabaseAdmin();
  if (!admin) {
    return <p className="px-6 py-20 text-center text-sm text-zinc-400">Supabase is not configured.</p>;
  }

  const bundle = await fetchPitchBundleById(admin, id);
  if (!bundle) notFound();

  const jar = await cookies();
  const founderRaw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  let founderWorkspace: string | null = null;
  if (founderRaw) {
    try {
      founderWorkspace = (await verifyFounderJwt(founderRaw)).workspace_id;
    } catch {
      founderWorkspace = null;
    }
  }

  const isFounder = founderWorkspace != null && founderWorkspace === bundle.pitch.workspace_id;
  const querySession = typeof sp.session === 'string' && /^[0-9a-f-]{36}$/i.test(sp.session) ? sp.session : null;

  const invRaw = jar.get(investorPitchCookieName(id))?.value;
  let sessionId: string | null = null;
  if (invRaw) {
    try {
      const inv = await verifyInvestorPitchJwt(invRaw);
      if (inv.pitch_id === id) {
        if (await isInvestorRevoked(admin, id, inv.email)) {
          redirect(`/pitch/${id}/gate`);
        }
        sessionId = inv.session_id;
      }
    } catch {
      sessionId = null;
    }
  }

  if (!sessionId && isFounder && querySession) {
    const ok = await admin
      .from('pitch_sessions')
      .select('id')
      .eq('id', querySession)
      .eq('pitch_id', id)
      .maybeSingle();
    if (ok.data?.id) sessionId = querySession;
  }

  if (!sessionId) {
    redirect(`/pitch/${id}/gate`);
  }

  return <WarRoomShell pitchId={id} sessionId={sessionId} deckEmbedUrl={bundle.workspace.deck_embed_url} />;
}
