import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string }> };

function safeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
  return base || 'deck.pdf';
}

export async function POST(req: Request, ctx: Ctx) {
  const { pitchId } = await ctx.params;
  const jar = await cookies();
  const founderRaw = jar.get(FOUNDER_SESSION_COOKIE)?.value;
  if (!founderRaw) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let founderWs: string;
  try {
    founderWs = (await verifyFounderJwt(founderRaw)).workspace_id;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_founder' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });

  const bundle = await fetchPitchBundleById(admin, pitchId);
  if (!bundle || bundle.pitch.workspace_id !== founderWs) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'missing_file' }, { status: 400 });
  }
  if (file.size > 40 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${pitchId}/${Date.now()}-${safeFilename(file.name)}`;
  const contentType = file.type === 'application/pdf' ? 'application/pdf' : 'application/pdf';

  const up = await admin.storage.from('pitch-decks').upload(path, buf, {
    contentType,
    upsert: true,
  });
  if (up.error) {
    console.error('[admin/deck/upload]', up.error.message);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  const { error: dbErr } = await admin.from('pitches').update({ deck_pdf_storage_path: path }).eq('id', pitchId);
  if (dbErr) {
    console.error('[admin/deck/upload] db', dbErr.message);
    return NextResponse.json({ ok: false, error: 'db_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path });
}
