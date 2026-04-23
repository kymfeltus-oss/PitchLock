import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FOUNDER_SESSION_COOKIE } from '@/lib/pitch-cookies';
import { fetchPitchBundleById } from '@/lib/pitch-data';
import { verifyFounderJwt } from '@/lib/pitch-session';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Ctx = { params: Promise<{ pitchId: string; assetId: string }> };

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'asset.pdf';
}

export async function POST(req: Request, ctx: Ctx) {
  const { pitchId, assetId } = await ctx.params;
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

  const { data: asset } = await admin.from('pitch_assets').select('id').eq('id', assetId).eq('pitch_id', pitchId).maybeSingle();
  if (!asset?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

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
  if (file.size > 45 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${pitchId}/assets/${assetId}/${Date.now()}-${safeFilename(file.name)}`;
  const up = await admin.storage.from('pitch-decks').upload(path, buf, {
    contentType: file.type || 'application/pdf',
    upsert: true,
  });
  if (up.error) {
    console.error('[asset/upload]', up.error.message);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  const db = await admin.from('pitch_assets').update({ storage_path: path }).eq('id', assetId);
  if (db.error) {
    return NextResponse.json({ ok: false, error: 'db_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path });
}
