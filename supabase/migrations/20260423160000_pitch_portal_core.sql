-- Investor Pitch Portal: pitches, NDA signatures, sessions, deck state, recordings.
-- Service-role API routes perform investor writes; founders use authenticated RLS when workspace_members is populated.

create table if not exists public.pitches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null,
  public_code text not null,
  primary_deck_path text,
  nda_document_text text,
  nda_version text not null default 'v1',
  settings jsonb not null default '{}'::jsonb,
  constraint pitches_public_code_format_ck check (public_code ~ '^[a-z0-9][a-z0-9-]{2,48}$'),
  constraint pitches_public_code_uidx unique (public_code)
);

create index if not exists pitches_workspace_idx on public.pitches (workspace_id);

create table if not exists public.nda_signatures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  email text not null,
  printed_name text not null,
  signature_text text not null,
  document_snapshot text not null,
  document_version text not null,
  client_ip text,
  user_agent text,
  pdf_storage_path text,
  constraint nda_signatures_email_len_ck check (char_length(email) between 3 and 320)
);

create index if not exists nda_signatures_pitch_idx on public.nda_signatures (pitch_id, created_at desc);

create table if not exists public.pitch_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  room_secret uuid not null default gen_random_uuid(),
  status text not null default 'live' check (status in ('live', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint pitch_sessions_room_secret_uidx unique (room_secret)
);

create index if not exists pitch_sessions_pitch_idx on public.pitch_sessions (pitch_id, created_at desc);

create table if not exists public.pitch_deck_state (
  session_id uuid primary key references public.pitch_sessions (id) on delete cascade,
  slide_index integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint pitch_deck_state_slide_ck check (slide_index >= 0 and slide_index < 10_000)
);

create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pitch_session_id uuid not null references public.pitch_sessions (id) on delete cascade,
  nda_signature_id uuid references public.nda_signatures (id) on delete set null,
  storage_path text not null,
  duration_seconds integer,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  meta jsonb
);

create index if not exists recordings_session_idx on public.recordings (pitch_session_id);

create table if not exists public.recording_views (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  recording_id uuid not null references public.recordings (id) on delete cascade,
  viewer_email text,
  watch_seconds integer not null default 0,
  last_position_seconds integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists recording_views_recording_idx on public.recording_views (recording_id);

comment on table public.pitches is 'Founder-owned pitch; linked to workspace for white-label.';
comment on table public.nda_signatures is 'Investor NDA capture; PDF path optional until pipeline runs.';
comment on table public.pitch_sessions is 'Live session container for deck sync + recording linkage.';
comment on table public.recordings is 'Private storage object path; access via signed URLs from trusted API only.';

alter table public.pitches enable row level security;
alter table public.nda_signatures enable row level security;
alter table public.pitch_sessions enable row level security;
alter table public.pitch_deck_state enable row level security;
alter table public.recordings enable row level security;
alter table public.recording_views enable row level security;

-- Workspace members (founders) may read pitches for their workspace when using Supabase Auth in the browser.
create policy pitches_select_members
  on public.pitches for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pitches.workspace_id and wm.auth_user_id = auth.uid()
    )
  );

create policy pitches_write_members
  on public.pitches for insert to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pitches.workspace_id and wm.auth_user_id = auth.uid()
    )
  );

create policy pitches_update_members
  on public.pitches for update to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pitches.workspace_id and wm.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pitches.workspace_id and wm.auth_user_id = auth.uid()
    )
  );

-- NDA rows: founders of the owning workspace may read; no broad anon access.
create policy nda_signatures_select_members
  on public.nda_signatures for select to authenticated
  using (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = nda_signatures.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

create policy pitch_sessions_select_members
  on public.pitch_sessions for select to authenticated
  using (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = pitch_sessions.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

create policy deck_state_select_members
  on public.pitch_deck_state for select to authenticated
  using (
    exists (
      select 1 from public.pitch_sessions ps
      join public.pitches p on p.id = ps.pitch_id
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where ps.id = pitch_deck_state.session_id and wm.auth_user_id = auth.uid()
    )
  );

-- Recordings: founders only; investors must never read this table directly (use signed URLs from API).
create policy recordings_select_members
  on public.recordings for select to authenticated
  using (
    exists (
      select 1 from public.pitch_sessions ps
      join public.pitches p on p.id = ps.pitch_id
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where ps.id = recordings.pitch_session_id and wm.auth_user_id = auth.uid()
    )
  );

create policy recording_views_select_members
  on public.recording_views for select to authenticated
  using (
    exists (
      select 1 from public.recordings r
      join public.pitch_sessions ps on ps.id = r.pitch_session_id
      join public.pitches p on p.id = ps.pitch_id
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where r.id = recording_views.recording_id and wm.auth_user_id = auth.uid()
    )
  );

-- Seed pitch for demo workspace (idempotent on public_code).
insert into public.pitches (workspace_id, title, public_code, nda_version, nda_document_text)
select w.id,
  'Demo live pitch',
  'demo-live',
  'v1',
  'Mutual confidentiality — development placeholder. Replace with counsel-approved text before production.'
from public.workspaces w
where w.slug = 'demo'
  and not exists (select 1 from public.pitches p where p.public_code = 'demo-live');
