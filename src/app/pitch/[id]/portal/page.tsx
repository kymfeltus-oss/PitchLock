import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { InvestorPortalClient } from '@/components/pitch/InvestorPortalClient';
import { investorPitchCookieName } from '@/lib/pitch-cookies';
import { isInvestorRevoked } from '@/lib/investor-revocation';
import { verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Props = { params: Promise<{ id: string }> };

export default async function InvestorPortalPage({ params }: Props) {
  const { id } = await params;
  const jar = await cookies();
  const raw = jar.get(investorPitchCookieName(id))?.value;
  if (!raw) redirect(`/pitch/${id}/gate`);

  let email: string;
  try {
    const v = await verifyInvestorPitchJwt(raw);
    if (v.pitch_id !== id) redirect(`/pitch/${id}/gate`);
    email = v.email;
  } catch {
    redirect(`/pitch/${id}/gate`);
  }

  const admin = getSupabaseAdmin();
  if (admin && (await isInvestorRevoked(admin, id, email))) {
    redirect(`/pitch/${id}/gate`);
  }

  return <InvestorPortalClient pitchId={id} />;
}
