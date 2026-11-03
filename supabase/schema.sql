-- Passage Group cloud sync.
-- Run once in the Supabase SQL editor (role postgres). Do not ship a service role key.
--
-- Data is stored for the fixed owner id "larry", not per auth.uid().
-- auth.uid() is only used to prove which Google account is signed in.
-- A mapping row (auth user → larry) can be created only when that email
-- is on public.sync_allowlist. Add Larry's Gmail addresses after this script:
--
--   insert into public.sync_allowlist (email) values ('you@gmail.com');
--
-- The client merges before it writes. There is no DELETE policy, so a signed-in
-- browser cannot erase cloud rows. Empty payloads are also refused in js/sync.js.

create table if not exists public.sync_allowlist (
  email text primary key,
  owner_id text not null default 'larry',
  created_at timestamptz not null default now(),
  constraint sync_allowlist_email_lower check (email = lower(email)),
  constraint sync_allowlist_owner_chk check (owner_id = 'larry')
);

create table if not exists public.user_mapping (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  owner_id text not null,
  email text not null,
  created_at timestamptz not null default now(),
  constraint user_mapping_owner_chk check (owner_id = 'larry'),
  constraint user_mapping_email_lower check (email = lower(email))
);

-- One JSON document per localStorage key, for owner "larry".
-- doc_key is the localStorage key. payload is the parsed object
-- ({ sessions } or { quizzes, chunks, passages, sentences, sentenceUnits }).
-- passages is the Passage timeline. sentences is a legacy mirror of passages.
-- sentenceUnits is the middle Sentence layer (groupSlug:sentenceId).
-- revision is the optimistic-concurrency counter (not auth.uid()).
create table if not exists public.sync_snapshots (
  owner_id text not null,
  doc_key text not null,
  payload jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (owner_id, doc_key),
  constraint sync_snapshots_owner_chk check (owner_id = 'larry'),
  constraint sync_snapshots_doc_chk check (
    doc_key in (
      'website-manager-timing-v1',
      'website-manager-progress-v2'
    )
  ),
  constraint sync_snapshots_payload_obj check (jsonb_typeof(payload) = 'object')
);

alter table public.sync_allowlist enable row level security;
alter table public.user_mapping enable row level security;
alter table public.sync_snapshots enable row level security;

-- No policies on sync_allowlist: signed-in users cannot read or edit it.
-- security definer functions below read it as the function owner (postgres).

create or replace function public.auth_email()
returns text
language sql
stable
as $$
  select lower(
    coalesce(
      nullif(auth.jwt() ->> 'email', ''),
      nullif(auth.jwt() -> 'user_metadata' ->> 'email', '')
    )
  );
$$;

create or replace function public.email_is_allowlisted(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sync_allowlist a
    where a.email = lower(check_email)
      and a.owner_id = 'larry'
  );
$$;

create or replace function public.current_owner_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.owner_id
  from public.user_mapping m
  where m.auth_user_id = auth.uid()
  limit 1
$$;

revoke all on function public.auth_email() from public;
revoke all on function public.email_is_allowlisted(text) from public;
revoke all on function public.current_owner_id() from public;
grant execute on function public.auth_email() to authenticated;
grant execute on function public.email_is_allowlisted(text) to authenticated;
grant execute on function public.current_owner_id() to authenticated;

revoke all on table public.sync_allowlist from public, anon, authenticated;
revoke all on table public.user_mapping from public, anon, authenticated;
revoke all on table public.sync_snapshots from public, anon, authenticated;

grant select, insert, update on table public.user_mapping to authenticated;
grant select, insert, update on table public.sync_snapshots to authenticated;

drop policy if exists user_mapping_select on public.user_mapping;
drop policy if exists user_mapping_insert on public.user_mapping;
drop policy if exists user_mapping_update on public.user_mapping;
drop policy if exists sync_snapshots_select on public.sync_snapshots;
drop policy if exists sync_snapshots_insert on public.sync_snapshots;
drop policy if exists sync_snapshots_update on public.sync_snapshots;

create policy user_mapping_select
  on public.user_mapping
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy user_mapping_insert
  on public.user_mapping
  for insert
  to authenticated
  with check (
    auth_user_id = auth.uid()
    and owner_id = 'larry'
    and email = public.auth_email()
    and public.email_is_allowlisted(email)
  );

create policy user_mapping_update
  on public.user_mapping
  for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and owner_id = 'larry'
    and email = public.auth_email()
    and public.email_is_allowlisted(email)
  );

-- Snapshots: only rows for the mapped owner (larry). No delete policy.
create policy sync_snapshots_select
  on public.sync_snapshots
  for select
  to authenticated
  using (owner_id = public.current_owner_id());

create policy sync_snapshots_insert
  on public.sync_snapshots
  for insert
  to authenticated
  with check (owner_id = public.current_owner_id());

create policy sync_snapshots_update
  on public.sync_snapshots
  for update
  to authenticated
  using (owner_id = public.current_owner_id())
  with check (owner_id = public.current_owner_id());
