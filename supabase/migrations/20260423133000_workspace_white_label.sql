-- White-label fields on workspaces (safe to run after init migration).

alter table public.workspaces add column if not exists tagline text;
alter table public.workspaces add column if not exists show_powered_by boolean not null default false;

comment on column public.workspaces.tagline is 'Short subtitle under the tenant name in the /w/[slug] chrome.';
comment on column public.workspaces.show_powered_by is 'If true, show optional platform footer when NEXT_PUBLIC_SHOW_PLATFORM_FOOTER is enabled.';

update public.workspaces
set
  primary_color = coalesce(nullif(trim(primary_color), ''), '#2563eb'),
  tagline = coalesce(nullif(trim(tagline), ''), 'Confidential investor materials')
where slug = 'demo';
