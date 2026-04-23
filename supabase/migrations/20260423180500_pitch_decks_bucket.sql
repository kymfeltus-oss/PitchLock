-- Private bucket for founder-uploaded pitch PDFs (signed URLs via service role).

insert into storage.buckets (id, name, public)
values ('pitch-decks', 'pitch-decks', false)
on conflict (id) do nothing;
