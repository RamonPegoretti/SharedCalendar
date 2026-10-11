-- Logging in with a username now happens in the `login` Edge Function, so
-- people's email addresses never reach the browser.
--
-- Before, the login screen asked `email_for_username` for the email that
-- goes with a username, and anyone on the internet could ask the same
-- question. Now only the function (running as the service role) can look a
-- username up; it signs the person in itself and hands back just the session.
--
-- Apply in two steps: part 1 before deploying the function, part 2 once the
-- new app is live (older copies of the app still call the old lookup).

-- Part 1: the lookup, callable by the service role only. The function passes
-- the caller's IP so the same limits as before still apply per device.
create or replace function public.login_email(p_username text, p_ip inet)
returns text
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  result text;
begin
  perform private.hit('username_lookup', p_ip, 10, interval '10 minutes');
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

revoke execute on function public.login_email(text, inet) from public, anon, authenticated;
grant execute on function public.login_email(text, inet) to service_role;

-- Part 2: the old lookup goes away.
drop function if exists public.email_for_username(text);
