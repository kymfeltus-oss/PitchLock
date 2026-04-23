-- Multi-tenant core + domain tables scoped by workspace_id.
-- Run in Supabase SQL Editor (or supabase db push) on a dedicated project for this app.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slug text not null,
  name text not null,
  contact_email text,
  deck_embed_url text,
  scheduling_url text,
  primary_color text,
  logo_url text,
  nda_document_text text,
  nda_version_label text,
  constraint workspaces_slug_lower_ck check (slug = lower(slug)),
  constraint workspaces_slug_format_ck check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

create unique index if not exists workspaces_slug_uidx on public.workspaces (slug);

comment on table public.workspaces is 'Tenant: one pitch room / org; resolved from URL path /w/[slug].';

-- Future: tie rows to Supabase Auth when dashboard ships.
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  auth_user_id uuid not null,
  role text not null default 'admin' check (role in ('owner', 'admin', 'member')),
  constraint workspace_members_workspace_user_uidx unique (workspace_id, auth_user_id)
);

create index if not exists workspace_members_auth_user_idx on public.workspace_members (auth_user_id);

-- NDA / agreement storage (aligned with common e-sign capture fields).
create table if not exists public.investor_agreements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  agreement_version text not null,
  document_snapshot text not null,
  printed_name text not null,
  signature text not null,
  email text not null,
  client_ip text,
  user_agent text
);

create index if not exists investor_agreements_workspace_created_idx
  on public.investor_agreements (workspace_id, created_at desc);
create index if not exists investor_agreements_workspace_email_idx on public.investor_agreements (workspace_id, email);

-- Meeting registration / evidence (calendar flow hooks up later).
create table if not exists public.meeting_nda_evidence (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  email text not null,
  nda_version text not null,
  acknowledged boolean not null default false,
  client_ip text,
  user_agent text,
  room_suffix text,
  confirmation_email_sent_at timestamptz,
  last_cal_notified_uid text
);

create index if not exists meeting_nda_evidence_workspace_created_idx
  on public.meeting_nda_evidence (workspace_id, created_at desc);
create index if not exists meeting_nda_evidence_workspace_email_room_idx
  on public.meeting_nda_evidence (workspace_id, email, room_suffix, created_at desc);

-- Optional pre-NDA gate acknowledgments.
create table if not exists public.legal_signatures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  nda_version text not null,
  ip_address text,
  browser_info text,
  signed_at timestamptz not null default now()
);

create index if not exists legal_signatures_workspace_signed_idx
  on public.legal_signatures (workspace_id, signed_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.investor_agreements enable row level security;
alter table public.meeting_nda_evidence enable row level security;
alter table public.legal_signatures enable row level security;

-- Default: no policies for anon/authenticated; server uses service role (bypasses RLS).
-- Add policies when moving reads/writes to user JWTs.

insert into public.workspaces (slug, name, contact_email, nda_version_label)
select 'demo', 'Demo workspace', 'hello@example.com', 'draft-v0'
where not exists (select 1 from public.workspaces w where w.slug = 'demo');
