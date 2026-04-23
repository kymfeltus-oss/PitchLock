import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { investorPitchCookieName } from '@/lib/pitch-cookies';
import { isInvestorRevoked } from '@/lib/investor-revocation';
import { verifyInvestorPitchJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Props = { params: Promise<{ id: string }> };

export default async function PitchStartPage({ params }: Props) {
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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-300/70">Step 3 of 3</p>
        <div className="mt-2 flex gap-1.5">
          <span className="h-1 w-8 rounded-full bg-cyan-400/30" />
          <span className="h-1 w-8 rounded-full bg-cyan-400/30" />
          <span className="h-1 w-8 rounded-full bg-cyan-400" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">You are cleared</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Your session is active for 24 hours on this device. Open the live room when you are ready — the deck stays
          locked to signed participants and the host.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/pitch/${id}/portal`}
          className="inline-flex flex-1 items-center justify-center rounded-xl bg-cyan-400/15 px-5 py-3 text-center text-sm font-semibold text-cyan-200 ring-1 ring-cyan-400/40 transition hover:bg-cyan-400/25"
        >
          Open investor workspace
        </Link>
        <Link
          href={`/pitch/${id}/room`}
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
        >
          Enter live room only
        </Link>
      </div>
    </div>
  );
}
