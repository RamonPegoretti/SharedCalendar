# SharedCalendar

Our shared calendar: events, tasks and notes for two, on both phones.

**Live app:** https://ramonpegoretti.github.io/SharedCalendar/

## Install it on your phone
- **Android (Chrome):** open the link, tap the ⋮ menu, then **Add to Home screen** / **Install app**.
- **iPhone (Safari):** open the link, tap the Share button, then **Add to Home Screen**.

## How it's built
- React + TypeScript + Vite, installable as a PWA.
- Login and data on Supabase (free tier). Only two accounts can ever be created.
- Every push to `main` is built and published to GitHub Pages by `.github/workflows/deploy.yml`.

## Run it locally
```
npm install
npm run dev
```

## Database changes
SQL changes to Supabase live in `supabase/migrations/`, oldest first. They are applied to the live project by hand (Supabase SQL editor or the Supabase connector), not by the deploy workflow.

## Notifications
- Turn them on per phone in **Settings → Notifications on this phone**. On iPhone this only works from the Home Screen app (iOS 16.4 or newer).
- Reminders and "the other person changed something" pings are sent by the Supabase Edge Function in `supabase/functions/push`. pg_cron calls it every minute for reminders; a trigger on `items` calls it on every change.
- Repeating items are expanded by `supabase/functions/_shared/recurrence.ts`, the same file the app uses, so reminders fall on the days the calendar shows.
- Tests for the reminder logic: `deno test supabase/functions/push`.
- Deploy the function with the Supabase CLI (`supabase functions deploy push --no-verify-jwt`) or the Supabase connector. It checks its own secret, which the database creates; its VAPID keys are created on its first run.
