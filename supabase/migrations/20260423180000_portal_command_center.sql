-- Investor portal GO: deck dwell analytics, PDF path, yield model, embed URL, host presence, session kill-switch.

alter table public.pitches
  add column if not exists deck_pdf_storage_path text,
  add column if not exists yield_config jsonb not null default '{}'::jsonb,
  add column if not exists preview_embed_url text;

alter table public.pitch_sessions
  add column if not exists host_present_at timestamptz;

create table if not exists public.deck_analytics (
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  investor_email text not null,
  page_index integer not null,
  seconds_on_page double precision not null default 0 check (seconds_on_page >= 0 and seconds_on_page < 1e9),
  updated_at timestamptz not null default now(),
  primary key (pitch_id, investor_email, page_index),
  constraint deck_analytics_email_len_ck check (char_length(investor_email) between 3 and 320),
  constraint deck_analytics_page_ck check (page_index >= 0 and page_index < 10000)
);

create index if not exists deck_analytics_pitch_idx on public.deck_analytics (pitch_id, updated_at desc);

create table if not exists public.investor_access_revocations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  email text not null,
  constraint investor_access_revocations_pitch_email_uidx unique (pitch_id, email),
  constraint investor_access_revocations_email_len_ck check (char_length(email) between 3 and 320)
);

create index if not exists investor_access_revocations_pitch_idx on public.investor_access_revocations (pitch_id);

comment on table public.deck_analytics is 'Per-page dwell time for strategic deck engagement.';
comment on table public.investor_access_revocations is 'Revokes investor portal access for a pitch; enforced in APIs and server pages.';

alter table public.deck_analytics enable row level security;
alter table public.investor_access_revocations enable row level security;

create policy deck_analytics_select_members
  on public.deck_analytics for select to authenticated
  using (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = deck_analytics.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

create policy revocations_select_members
  on public.investor_access_revocations for select to authenticated
  using (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = investor_access_revocations.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

create policy revocations_insert_members
  on public.investor_access_revocations for insert to authenticated
  with check (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = investor_access_revocations.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

create policy revocations_delete_members
  on public.investor_access_revocations for delete to authenticated
  using (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = investor_access_revocations.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

update public.pitches
set yield_config =
  '{"revenueBase":2500000,"years":5,"sliders":[{"id":"g","label":"Growth rate","min":0.05,"max":0.22,"step":0.005,"default":0.12},{"id":"m","label":"Operating margin","min":0.18,"max":0.38,"step":0.01,"default":0.26}]}'::jsonb
where public_code = 'demo-live';
