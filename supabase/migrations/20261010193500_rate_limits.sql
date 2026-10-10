-- Rate limits and size caps for everything people can send to the database.
--
-- 1. Every write request to the Data API (inserts, updates, deletes, function
--    calls) counts against the caller's IP: more than 120 in 5 minutes and
--    further writes are refused with HTTP 429 until the window passes.
-- 2. The username lookup used by the login screen is open to people who are
--    not signed in, so it gets a much stricter limit of its own.
-- 3. Text columns get length caps so nobody can store huge values.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.rate_limits (
  bucket text not null,
  ip inet,
  request_at timestamptz not null default now()
);
create index if not exists rate_limits_lookup_idx
  on private.rate_limits (bucket, ip, request_at desc);

-- Records one hit and refuses the request when the bucket is over its limit.
-- A null ip means "count everyone together".
create or replace function private.hit(p_bucket text, p_ip inet, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
  from private.rate_limits
  where bucket = p_bucket
    and ip is not distinct from p_ip
    and request_at > now() - p_window;

  if recent >= p_max then
    raise sqlstate 'PGRST' using
      message = json_build_object('message', 'Too many requests, try again in a few minutes')::text,
      detail = json_build_object('status', 429, 'status_text', 'Too Many Requests')::text;
  end if;

  insert into private.rate_limits (bucket, ip) values (p_bucket, p_ip);

  -- Old rows are useless; clear them out now and then.
  if random() < 0.02 then
    delete from private.rate_limits where request_at < now() - interval '1 day';
  end if;
end;
$$;

-- The caller's IP as seen by Supabase, or null when it is missing or garbled.
create or replace function private.request_ip()
returns inet
language plpgsql
stable
set search_path to ''
as $$
begin
  return nullif(trim(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1)), '')::inet;
exception when others then
  return null;
end;
$$;

-- Runs before every Data API request.
create or replace function public.check_request()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  ip inet := private.request_ip();
begin
  -- Reads can't be counted (they run read-only); they only ever return rows
  -- that row-level security already allows.
  if current_setting('request.method', true) in ('GET', 'HEAD')
     or current_setting('transaction_read_only') = 'on'
     or ip is null then
    return;
  end if;

  perform private.hit('write', ip, 120, interval '5 minutes');
end;
$$;
-- PostgREST runs this as the caller's role, so callers must be able to execute it.
revoke execute on function public.check_request() from public;
grant execute on function public.check_request() to anon, authenticated;

alter role authenticator set pgrst.db_pre_request = 'public.check_request';
notify pgrst, 'reload config';

-- Login lookup: 10 tries per IP every 10 minutes, and 300 per hour from
-- everyone combined as a backstop. Logging in with the email address
-- does not use this lookup, so it keeps working even if the backstop trips.
-- Switched from STABLE to VOLATILE so it can record hits.
create or replace function public.email_for_username(p_username text)
returns text
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  result text;
begin
  perform private.hit('username_lookup', private.request_ip(), 10, interval '10 minutes');
  perform private.hit('username_lookup_all', null, 300, interval '1 hour');

  if p_username is null or char_length(p_username) > 64 then
    return null;
  end if;

  select u.email::text into result
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.username = lower(trim(p_username));
  return result;
end;
$$;
-- Signed-in people never need it; only the login screen does.
revoke execute on function public.email_for_username(text) from public, authenticated;
grant execute on function public.email_for_username(text) to anon;

-- Size caps (username already has its own pattern check).
alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) between 1 and 50);
