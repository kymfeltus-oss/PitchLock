-- Deck viewing: audit trail + workspace flags for watermarking.

alter table public.workspaces add column if not exists deck_watermark_enabled boolean not null default true;
alter table public.workspaces add column if not exists audit_dashboard_token text;

comment on column public.workspaces.deck_watermark_enabled is
  'When true, /w/[slug]/deck shows a dynamic viewer watermark overlay on top of the embed.';
comment on column public.workspaces.audit_dashboard_token is
  'Secret for /w/[slug]/security?token=… founder dashboard; rotate in Supabase.';

-- One row per browser session viewing the deck.
create table if not exists public.deck_view_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  viewer_name text not null,
  viewer_email text,
  user_agent text,
  client_ip text,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  constraint deck_view_sessions_viewer_name_len_ck check (char_length(viewer_name) between 1 and 200)
);

create index if not exists deck_view_sessions_workspace_started_idx
  on public.deck_view_sessions (workspace_id, started_at desc);

-- Append-only audit stream (heartbeats, focus, deck open, optional slide hints).
create table if not exists public.deck_audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  session_id uuid not null references public.deck_view_sessions (id) on delete cascade,
  event_type text not null,
  slide_key text,
  duration_ms integer,
  meta jsonb,
  constraint deck_audit_events_slide_key_len_ck check (slide_key is null or char_length(slide_key) <= 300)
);

create index if not exists deck_audit_events_workspace_created_idx
  on public.deck_audit_events (workspace_id, created_at desc);
create index if not exists deck_audit_events_session_created_idx
  on public.deck_audit_events (session_id, created_at desc);

comment on table public.deck_view_sessions is 'Deck viewer session for audit / compliance.';
comment on table public.deck_audit_events is 'Deck viewer events; slide_key populated when embed integration sends hints.';

alter table public.deck_view_sessions enable row level security;
alter table public.deck_audit_events enable row level security;

-- Issue a dashboard token for any workspace missing one (including existing demo row).
update public.workspaces w
set audit_dashboard_token = coalesce(nullif(trim(audit_dashboard_token), ''), gen_random_uuid()::text)
where w.audit_dashboard_token is null or trim(w.audit_dashboard_token) = '';
