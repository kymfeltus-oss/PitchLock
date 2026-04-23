import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchWorkspaceBySlug, isValidWorkspaceSlug, toPublicWorkspace } from '@/lib/workspace';

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  if (!isValidWorkspaceSlug(slug)) {
    return NextResponse.json({ ok: false, error: 'invalid_slug' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }

  const row = await fetchWorkspaceBySlug(admin, slug);
  if (!row) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, workspace: toPublicWorkspace(row) });
}
