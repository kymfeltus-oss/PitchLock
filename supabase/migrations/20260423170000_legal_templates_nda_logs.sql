-- Versioned legal copy + immutable NDA audit log (incl. scroll engagement for owner review).

create table if not exists public.legal_templates (
  version text primary key,
  title text not null,
  body text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.legal_templates is 'NDA / confidentiality text; owners update versions without redeploying app code.';

create index if not exists legal_templates_active_idx on public.legal_templates (is_active) where is_active = true;

create table if not exists public.nda_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pitch_id uuid references public.pitches (id) on delete set null,
  legal_template_version text,
  full_name text not null,
  email text not null,
  ip_address text,
  user_agent text,
  signed_at timestamptz not null default now(),
  scroll_max_depth_percent integer not null default 0 check (scroll_max_depth_percent between 0 and 100),
  reached_document_end boolean not null default false,
  scroll_events jsonb,
  nda_body_snapshot text not null,
  pdf_storage_path text,
  nda_signature_id uuid references public.nda_signatures (id) on delete set null,
  owner_review_token text not null default encode(gen_random_bytes(32), 'hex'),
  constraint nda_logs_owner_review_token_uidx unique (owner_review_token)
);

create index if not exists nda_logs_pitch_idx on public.nda_logs (pitch_id, signed_at desc);
create index if not exists nda_logs_email_idx on public.nda_logs (email);

comment on table public.nda_logs is 'Compliance log + scroll engagement; owner_review_token powers email deep-link heatmap.';
comment on column public.nda_logs.scroll_max_depth_percent is 'Max scroll depth observed in the NDA viewport (0–100).';
comment on column public.nda_logs.reached_document_end is 'True when the reader scrolled to the bottom region (e.g. >= 98%).';

alter table public.legal_templates enable row level security;
alter table public.nda_logs enable row level security;

-- No broad anon/authenticated policies: server uses service role for writes; founders read via trusted API.

create policy nda_logs_select_members
  on public.nda_logs for select to authenticated
  using (
    exists (
      select 1 from public.pitches p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = nda_logs.pitch_id and wm.auth_user_id = auth.uid()
    )
  );

insert into public.legal_templates (version, title, body, is_active)
values (
  '2026-03-nda-nc-v1',
  'Mutual confidentiality (template)',
  'This is a placeholder mutual confidentiality and restricted-use agreement for development. Replace with counsel-approved language in Supabase (legal_templates.body) before production.',
  true
)
on conflict (version) do nothing;

-- Prefer template-driven copy on the demo pitch when present.
update public.pitches p
set nda_version = '2026-03-nda-nc-v1'
where p.public_code = 'demo-live';
