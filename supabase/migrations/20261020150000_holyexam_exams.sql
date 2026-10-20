-- HolyExam tests in the calendar: the holyexamViewer job sends Ramon's class
-- tests here; each one becomes an all-day event tagged as his. Each event
-- remembers which HolyExam test it came from (external_id), so a test that
-- changes date or title updates its event instead of adding a new one, and a
-- test removed from HolyExam removes its event. Items without an external_id
-- (everything made in the app) are never touched.

alter table public.items
  add column external_id text check (char_length(external_id) <= 100);

create unique index items_external_id_key on public.items (external_id);

-- p_exams: [{ "id": "...", "date": "YYYY-MM-DD", "title": "...", "notes": "..." }]
-- Checked with the same token as the other holyexam_* functions.
create or replace function public.holyexam_sync_exams(p_token text, p_exams jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_owner uuid;
  v_ids text[];
  v_changed int := 0;
  v_removed int := 0;
begin
  if not public.holyexam_token_ok(p_token) then
    return null;
  end if;
  if jsonb_typeof(p_exams) <> 'array' or jsonb_array_length(p_exams) > 2000 then
    raise exception 'p_exams must be an array of at most 2000 tests';
  end if;

  -- The first account is Ramon's.
  select id into v_owner from public.profiles order by created_at limit 1;

  with incoming as (
    select distinct on (e->>'id')
      'holyexam:' || (e->>'id') as external_id,
      (e->>'date')::date as day,
      left(coalesce(nullif(btrim(e->>'title'), ''), 'Verifica'), 200) as title,
      left(coalesce(e->>'notes', ''), 2000) as notes
    from jsonb_array_elements(p_exams) e
    where coalesce(e->>'id', '') <> '' and (e->>'date')::date between date '2000-01-01' and date '2100-12-31'
  ), upserted as (
    insert into public.items (kind, title, notes, day, all_day, owner_id, external_id)
    select 'event', i.title, i.notes, i.day, true, v_owner, i.external_id from incoming i
    on conflict (external_id) do update
      set title = excluded.title, notes = excluded.notes, day = excluded.day
      where (public.items.title, public.items.notes, public.items.day)
        is distinct from (excluded.title, excluded.notes, excluded.day)
    returning 1
  )
  select count(*) into v_changed from upserted;

  select coalesce(array_agg('holyexam:' || (e->>'id')), '{}') into v_ids
  from jsonb_array_elements(p_exams) e where coalesce(e->>'id', '') <> '';

  -- An empty list most likely means HolyExam returned nothing, not that every
  -- test was cancelled, so nothing is removed then.
  if cardinality(v_ids) > 0 then
    with gone as (
      delete from public.items
      where external_id like 'holyexam:%' and not (external_id = any (v_ids))
      returning 1
    )
    select count(*) into v_removed from gone;
  end if;

  return jsonb_build_object('changed', v_changed, 'removed', v_removed);
end;
$$;

revoke execute on function public.holyexam_sync_exams(text, jsonb) from public;
grant execute on function public.holyexam_sync_exams(text, jsonb) to anon;
