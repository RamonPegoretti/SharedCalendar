-- Step 2: events, tasks and day notes, shared by the two accounts.
--
-- One table holds all three kinds so the month view needs a single query and
-- a single live-update subscription. Dates and times are stored as plain
-- local calendar values (both people live in the same time zone).

create table public.items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event', 'task', 'note')),
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  location text not null default '' check (char_length(location) <= 200),
  day date not null,
  all_day boolean not null default true,
  start_time time,
  end_time time,
  done boolean not null default false,
  -- Whose item it is: one of the two people, or null for "ours".
  -- For tasks this is who the task is assigned to.
  owner_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_day_range check (day between date '2000-01-01' and date '2100-12-31'),
  constraint items_end_after_start check (end_time is null or (start_time is not null and end_time >= start_time)),
  constraint items_timed_event check (kind <> 'event' or all_day or start_time is not null),
  constraint items_notes_untimed check (kind <> 'note' or (start_time is null and end_time is null)),
  constraint items_done_tasks_only check (kind = 'task' or not done)
);

create index items_day_idx on public.items (day);
create index items_owner_idx on public.items (owner_id);
create index items_created_by_idx on public.items (created_by);
create index items_updated_by_idx on public.items (updated_by);

-- Who created / last edited an item and when is filled in by the database,
-- so the app can't fake it.
create or replace function private.stamp_item()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_stamp
  before insert or update on public.items
  for each row execute function private.stamp_item();

-- Everything is shared: both signed-in people can see and change every item.
-- Only two accounts can exist (see the two_user_signup migration).
alter table public.items enable row level security;

create policy "Signed-in people can read items" on public.items
  for select to authenticated using (true);
create policy "Signed-in people can add items" on public.items
  for insert to authenticated with check (true);
create policy "Signed-in people can edit items" on public.items
  for update to authenticated using (true) with check (true);
create policy "Signed-in people can delete items" on public.items
  for delete to authenticated using (true);

revoke all on public.items from anon;
grant select, insert, update, delete on public.items to authenticated;

-- Live updates: changes show up on the other phone without refreshing.
alter publication supabase_realtime add table public.items;

-- Each person's color for their items (the "ours" color is fixed in the app).
alter table public.profiles
  add column color text check (color ~ '^#[0-9a-f]{6}$');

-- private.rate_limits is only touched by security-definer functions and the
-- private schema isn't reachable from the API, but turning RLS on silences
-- the advisor and adds a second lock.
alter table private.rate_limits enable row level security;
