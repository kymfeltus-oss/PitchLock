import Link from "next/link";

const defaultSlug = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_SLUG?.trim().toLowerCase() || "demo";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24">
      <main className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Client hub</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Operator landing page. Your tenants live under <code className="rounded bg-zinc-100 px-1">/w/…</code> with
          their own name, logo, and colors—no product branding in that shell unless you enable it.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href={`/w/${defaultSlug}`}
            className="inline-flex rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Open sample workspace
          </Link>
          <Link
            href="/admin/login"
            className="inline-flex rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Founder dashboard
          </Link>
        </div>
        <p className="mt-6 max-w-lg text-xs leading-relaxed text-zinc-500">
          Pitch portal: use <code className="rounded bg-zinc-100 px-1">select id from pitches where public_code = &apos;demo-live&apos;;</code> then open{' '}
          <code className="rounded bg-zinc-100 px-1">/pitch/&lt;uuid&gt;/gate</code>.
        </p>
      </main>
    </div>
  );
}
