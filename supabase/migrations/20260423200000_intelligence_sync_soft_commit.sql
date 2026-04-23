-- Guided sync state, intelligence ledger, soft commitments, multi-asset war room.

create table if not exists public.pitch_session_sync (
  session_id uuid primary key references public.pitch_sessions (id) on delete cascade,
  presenter_active boolean not null default false,
  slide_index integer not null default 0,
  scroll_ratio double precision not null default 0 check (scroll_ratio >= 0 and scroll_ratio <= 1),
  zoom double precision not null default 1 check (zoom >= 0.5 and zoom <= 3),
  cursor_x double precision,
  cursor_y double precision,
  updated_at timestamptz not null default now(),
  constraint pitch_session_sync_slide_ck check (slide_index >= 0 and slide_index < 10000)
);

comment on table public.pitch_session_sync is 'Low-latency presenter sync snapshot; investors poll or subscribe.';

alter table public.pitch_session_sync enable row level security;

create policy pitch_session_sync_select_members
  on public.pitch_session_sync for select to authenticated
  using (
    exists (
      select 1 from public.pitch_sessions ps
      join public.pitches p on p.id = ps.pitch_id
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where ps.id = pitch_session_sync.session_id and wm.auth_user_id = auth.uid()
    )
  );

create table if not exists public.pitch_intelligence (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  session_id uuid not null references public.pitch_sessions (id) on delete cascade,
  investor_email text not null,
  total_view_seconds double precision not null default 0 check (total_view_seconds >= 0 and total_view_seconds < 1e8),
  time_per_slide jsonb not null default '[]'::jsonb,
  zoom_events jsonb not null default '[]'::jsonb,
  focus_out_seconds double precision not null default 0 check (focus_out_seconds >= 0 and focus_out_seconds < 1e8),
  last_slide_index integer not null default 0,
  session_meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint pitch_intelligence_email_len_ck check (char_length(investor_email) between 3 and 320),
  constraint pitch_intelligence_session_email_uidx unique (session_id, investor_email)
);

create index if not exists pitch_intelligence_pitch_idx on public.pitch_intelligence (pitch_id, updated_at desc);

comment on table public.pitch_intelligence is 'Ghost-mode engagement: dwell, zoom, focus loss; upsert from investor client.';

alter table public.pitch_intelligence enable row level security;

create policy pitch_intelligence_select_members
  on public.pitch_intelligence for select to authenticated
  using (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = pitch_intelligence.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

create table if not exists public.pitch_soft_interests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  investor_email text not null,
  commitment_amount numeric(18, 2),
  value_add_notes text,
  nda_signature_id uuid references public.nda_signatures (id) on delete set null,
  summary_pdf_storage_path text,
  constraint pitch_soft_interests_email_len_ck check (char_length(investor_email) between 3 and 320)
);

create index if not exists pitch_soft_interests_pitch_idx on public.pitch_soft_interests (pitch_id, created_at desc);

comment on table public.pitch_soft_interests is 'Non-binding soft interest; PDF summary stored in pitch-assets bucket path.';

alter table public.pitch_soft_interests enable row level security;

create policy pitch_soft_interests_select_members
  on public.pitch_soft_interests for select to authenticated
  using (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = pitch_soft_interests.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

create table if not exists public.pitch_assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  slot_key text not null,
  title text not null,
  storage_path text,
  restricted boolean not null default false,
  sort_order integer not null default 0,
  constraint pitch_assets_slot_uidx unique (pitch_id, slot_key),
  constraint pitch_assets_slot_ck check (slot_key ~ '^[a-z0-9][a-z0-9_-]{1,48}$')
);

create index if not exists pitch_assets_pitch_idx on public.pitch_assets (pitch_id, sort_order);

comment on table public.pitch_assets is 'Multi-file war room assets; optional per-investor grants when restricted.';

alter table public.pitch_assets enable row level security;

create policy pitch_assets_select_members
  on public.pitch_assets for select to authenticated
  using (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = pitch_assets.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

create policy pitch_assets_write_members
  on public.pitch_assets for insert to authenticated
  with check (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = pitch_assets.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

create policy pitch_assets_update_members
  on public.pitch_assets for update to authenticated
  using (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = pitch_assets.pitch_id and wm.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = pitch_assets.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

create table if not exists public.pitch_asset_investor_access (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  asset_id uuid not null references public.pitch_assets (id) on delete cascade,
  investor_email text not null,
  can_view boolean not null default true,
  constraint pitch_asset_access_uidx unique (asset_id, investor_email),
  constraint pitch_asset_access_email_ck check (char_length(investor_email) between 3 and 320)
);

create index if not exists pitch_asset_access_asset_idx on public.pitch_asset_investor_access (asset_id);

comment on table public.pitch_asset_investor_access is 'Per-investor unlock when parent asset is restricted.';

alter table public.pitch_asset_investor_access enable row level security;

create policy pitch_asset_access_select_members
  on public.pitch_asset_investor_access for select to authenticated
  using (
    exists (
      select 1 from public.pitch_assets a
      join public.pitches p on p.id = a.pitch_id
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where a.id = pitch_asset_investor_access.asset_id and wm.auth_user_id = auth.uid()
    )
  );

create policy pitch_asset_access_write_members
  on public.pitch_asset_investor_access for insert to authenticated
  with check (
    exists (
      select 1 from public.pitch_assets a
      join public.pitches p on p.id = a.pitch_id
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where a.id = pitch_asset_investor_access.asset_id and wm.auth_user_id = auth.uid()
    )
  );

create policy pitch_asset_access_update_members
  on public.pitch_asset_investor_access for update to authenticated
  using (
    exists (
      select 1 from public.pitch_assets a
      join public.pitches p on p.id = a.pitch_id
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where a.id = pitch_asset_investor_access.asset_id and wm.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.pitch_assets a
      join public.pitches p on p.id = a.pitch_id
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where a.id = pitch_asset_investor_access.asset_id and wm.auth_user_id = auth.uid()
    )
  );

create policy pitch_asset_access_delete_members
  on public.pitch_asset_investor_access for delete to authenticated
  using (
    exists (
      select 1 from public.pitch_assets a
      join public.pitches p on p.id = a.pitch_id
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where a.id = pitch_asset_investor_access.asset_id and wm.auth_user_id = auth.uid()
    )
  );

-- Seed asset slots for demo pitch (paths null until founder uploads).
insert into public.pitch_assets (pitch_id, slot_key, title, storage_path, restricted, sort_order)
select p.id, v.slot_key, v.title, null, false, v.sort_order
from public.pitches p
cross join (
  values
    ('primary_deck', 'Primary pitch deck', 0),
    ('technical_whitepaper', 'Technical whitepaper', 1),
    ('executive_summary', 'Executive summary', 2),
    ('cap_table_preview', 'Cap table preview', 3)
) as v(slot_key, title, sort_order)
where p.public_code = 'demo-live'
on conflict (pitch_id, slot_key) do nothing;
