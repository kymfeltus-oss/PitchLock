import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchWorkspaceBySlug, isValidWorkspaceSlug } from '@/lib/workspace';

type Body = {
  action: 'session_start' | 'heartbeat' | 'visibility' | 'slide_hint';
  sessionId?: string;
  viewerName?: string;
  viewerEmail?: string | null;
  visibility?: 'visible' | 'hidden';
  slideKey?: string | null;
  durationMs?: number | null;
  meta?: Record<string, unknown> | null;
};

function trimStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = req.headers.get('x-real-ip')?.trim();
  return real ? real.slice(0, 64) : null;
}

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  if (!isValidWorkspaceSlug(slug)) {
    return NextResponse.json({ ok: false, error: 'invalid_slug' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }

  const workspace = await fetchWorkspaceBySlug(admin, slug);
  if (!workspace) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const ua = req.headers.get('user-agent')?.slice(0, 512) || null;
  const ip = clientIp(req);

  if (body.action === 'session_start') {
    const viewerName = trimStr(body.viewerName, 200);
    if (viewerName.length < 2) {
      return NextResponse.json({ ok: false, error: 'viewer_name_required' }, { status: 400 });
    }
    const viewerEmail = trimStr(body.viewerEmail, 320) || null;

    const ins = await admin
      .from('deck_view_sessions')
      .insert({
        workspace_id: workspace.id,
        viewer_name: viewerName,
        viewer_email: viewerEmail || null,
        user_agent: ua,
        client_ip: ip,
      })
      .select('id')
      .single();

    if (ins.error || !ins.data?.id) {
      console.error('[deck/audit] session_start', ins.error?.message);
      return NextResponse.json({ ok: false, error: 'persist_failed' }, { status: 500 });
    }

    const sessionId = ins.data.id as string;

    const ev = await admin.from('deck_audit_events').insert({
      workspace_id: workspace.id,
      session_id: sessionId,
      event_type: 'deck_open',
      meta: body.meta ?? null,
    });
    if (ev.error) {
      console.error('[deck/audit] deck_open event', ev.error.message);
    }

    return NextResponse.json({ ok: true, sessionId });
  }

  const sessionId = trimStr(body.sessionId, 80);
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ ok: false, error: 'session_required' }, { status: 400 });
  }

  const sess = await admin
    .from('deck_view_sessions')
    .select('id, workspace_id')
    .eq('id', sessionId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();

  if (sess.error || !sess.data) {
    return NextResponse.json({ ok: false, error: 'session_not_found' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  await admin.from('deck_view_sessions').update({ last_heartbeat_at: nowIso }).eq('id', sessionId);

  if (body.action === 'heartbeat') {
    const { data: lastHbRows } = await admin
      .from('deck_audit_events')
      .select('created_at')
      .eq('session_id', sessionId)
      .eq('event_type', 'heartbeat')
      .order('created_at', { ascending: false })
      .limit(1);

    const lastRow = Array.isArray(lastHbRows) ? lastHbRows[0] : null;
    const lastAt = lastRow?.created_at ? new Date(lastRow.created_at as string).getTime() : 0;
    const shouldInsert = Date.now() - lastAt > 15_000;

    if (shouldInsert) {
      await admin.from('deck_audit_events').insert({
        workspace_id: workspace.id,
        session_id: sessionId,
        event_type: 'heartbeat',
        meta: body.meta ?? null,
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === 'visibility') {
    const v = body.visibility === 'hidden' ? 'hidden' : 'visible';
    await admin.from('deck_audit_events').insert({
      workspace_id: workspace.id,
      session_id: sessionId,
      event_type: v === 'visible' ? 'tab_visible' : 'tab_hidden',
      duration_ms: typeof body.durationMs === 'number' && body.durationMs >= 0 ? Math.min(body.durationMs, 86_400_000) : null,
      meta: body.meta ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'slide_hint') {
    const slideKey = trimStr(body.slideKey, 300) || null;
    if (!slideKey) {
      return NextResponse.json({ ok: false, error: 'slide_key_required' }, { status: 400 });
    }
    await admin.from('deck_audit_events').insert({
      workspace_id: workspace.id,
      session_id: sessionId,
      event_type: 'slide_hint',
      slide_key: slideKey,
      duration_ms: typeof body.durationMs === 'number' && body.durationMs >= 0 ? Math.min(body.durationMs, 86_400_000) : null,
      meta: body.meta ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'unknown_action' }, { status: 400 });
}
