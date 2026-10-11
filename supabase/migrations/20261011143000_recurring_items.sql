-- Step 3: recurring events, tasks and notes.
--
-- A repeating item is a single row: its `day` is the first occurrence and the
-- rule says how it repeats. The app works out the occurrences for the days on
-- screen, so a "forever" series costs one row.
--
-- Changing a single occurrence ("only this one") adds a separate row that
-- points back at the series (`series_id`) and says which occurrence it
-- replaces (`series_day`). Ticking off one occurrence of a recurring task
-- works the same way. Deleting a single occurrence adds its date to
-- `skip_days` on the series.

alter table public.items
  add column repeat text check (repeat in ('daily', 'weekly', 'monthly', 'yearly')),
  add column repeat_every smallint not null default 1 check (repeat_every between 1 and 99),
  -- Last day the series can occur on; null means forever.
  add column repeat_until date,
  add column skip_days date[] not null default '{}',
  add column series_id uuid references public.items (id) on delete cascade,
  add column series_day date,
  add constraint items_repeat_until_after_start check (repeat_until is null or (repeat is not null and repeat_until >= day)),
  add constraint items_repeat_until_range check (repeat_until is null or repeat_until <= date '2100-12-31'),
  add constraint items_skip_days_max check (cardinality(skip_days) <= 1000),
  add constraint items_skip_days_series_only check (repeat is not null or cardinality(skip_days) = 0),
  -- A replaced occurrence knows which occurrence it stands in for, and can't
  -- itself repeat.
  add constraint items_series_pair check ((series_id is null) = (series_day is null)),
  add constraint items_override_single check (series_id is null or repeat is null),
  add constraint items_done_not_series check (repeat is null or not done);

create index items_series_idx on public.items (series_id, series_day);
-- Finding the series that reach into the days on screen.
create index items_repeat_idx on public.items (day) where repeat is not null;

-- Keep a series' replaced and deleted occurrences lined up when the whole
-- series moves to another day, and drop them when it stops repeating.
create or replace function private.follow_series()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  shift integer := new.day - old.day;
begin
  if old.repeat is null then
    return new;
  end if;

  if new.repeat is null then
    delete from public.items where series_id = new.id;
    new.skip_days := '{}';
    new.repeat_until := null;
    return new;
  end if;

  if shift <> 0 then
    -- Occurrences that weren't moved to another day move along with the series.
    update public.items
      set day = case when day = series_day then day + shift else day end,
          series_day = series_day + shift
      where series_id = new.id;
    new.skip_days := array(select d + shift from unnest(old.skip_days) as d);
  end if;
  return new;
end;
$$;

create trigger items_follow_series
  before update of day, repeat on public.items
  for each row execute function private.follow_series();
