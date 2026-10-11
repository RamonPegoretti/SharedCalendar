-- Step 4: push notifications.
--
-- 1. Items get reminders (minutes before they start; untimed items count from
--    9:00 that day).
-- 2. Each phone that turns notifications on leaves its push address in
--    push_subscriptions.
-- 3. Every minute pg_cron asks the `push` Edge Function to send reminders that
--    are due. When someone adds, changes or deletes an item, a trigger asks the
--    same function to tell the other person.
--
-- No keys have to be copied around by hand: the database makes up the secret
-- it shares with the function, and the function creates its own VAPID key pair
-- (the keys push services use to check who is sending) on its first run.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- reminders on items ----------

alter table public.items
  add column reminders smallint[] not null default '{}',
  add constraint items_reminders_choices check (reminders <@ '{0,15,60,1440}'::smallint[]);

-- ---------- per-person settings ----------

alter table public.profiles
  add column notify_partner boolean not null default true,
  add column time_zone text not null default 'Europe/Rome' check (char_length(time_zone) between 1 and 64);

-- ---------- where to send notifications ----------

create table public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Only the push function (service role) reads these; phones go through the
-- two functions below.
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Saves this phone's push address for the signed-in person. If the phone was
-- used by the other account before, it now belongs to whoever is signed in.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  -- Keep at most 10 phones/browsers per person.
  delete from public.push_subscriptions
  where endpoint in (
    select endpoint from public.push_subscriptions
    where user_id = auth.uid()
    order by created_at desc
    offset 10
  );
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path to ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- ---------- keys ----------

-- One row. `hook_secret` proves to the push function that a call comes from
-- this database. `vapid` (private + public key) is filled in by the function.
create table public.push_keys (
  id boolean primary key default true check (id),
  hook_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  vapid jsonb,
  vapid_public text
);
alter table public.push_keys enable row level security;
revoke all on public.push_keys from anon, authenticated;
insert into public.push_keys default values;

-- The public half is what phones need to sign up; it is safe to hand out.
create or replace function public.vapid_public_key()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select vapid_public from public.push_keys;
$$;
revoke execute on function public.vapid_public_key() from public, anon;
grant execute on function public.vapid_public_key() to authenticated;

-- ---------- reminders already sent ----------

-- So a reminder goes out once even though the function looks back a few
-- minutes on every run. `item_id` + `day` name the occurrence (for a series:
-- the series and which day of it).
create table public.push_sent (
  item_id uuid not null,
  day date not null,
  minutes smallint not null,
  user_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (item_id, day, minutes, user_id)
);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;

-- ---------- calling the function ----------

create or replace function private.call_push(body jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform net.http_post(
    url := 'https://eqwxzvgglodkefwutapi.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', (select hook_secret from public.push_keys)
    ),
    body := body,
    timeout_milliseconds := 10000
  );
end;
$$;

-- Tells the other person about a change. Only changes a person made directly
-- count: rows the database moves or removes on its own as a side effect
-- (series follow-ups, cascades) would just repeat the same news.
create or replace function private.ping_partner()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return null;
  end if;
  perform private.call_push(jsonb_build_object(
    'type', 'activity',
    'op', lower(tg_op),
    'actor', auth.uid(),
    'item', case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end,
    'old', case when tg_op = 'UPDATE' then to_jsonb(old) end
  ));
  return null;
end;
$$;

create trigger items_ping_partner
  after insert or update or delete on public.items
  for each row execute function private.ping_partner();

-- Reminders: every minute.
select cron.schedule('push-reminders', '* * * * *', $$select private.call_push('{"type":"reminders"}'::jsonb)$$);

-- ---------- rate limit ----------

-- The push function reads and writes with the service role from shared
-- servers; it must not be slowed down by the per-IP write limit.
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
     or nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role'
     or ip is null then
    return;
  end if;

  perform private.hit('write', ip, 120, interval '5 minutes');
end;
$$;
