# SharedCalendar

Our shared calendar: events, tasks and notes for two, on both phones.

**Live app:** https://ramonpegoretti.github.io/SharedCalendar/

## Install it on your phone
- **Android (Chrome):** open the link, tap the ⋮ menu, then **Add to Home screen** / **Install app**.
- **iPhone (Safari):** open the link, tap the Share button, then **Add to Home Screen**.

## iPhone widget

Web apps can't have home screen widgets of their own, so the iPhone widget runs in the free
[Scriptable](https://scriptable.app) app. The setup steps are at
[/SharedCalendar/widget.html](https://ramonpegoretti.github.io/SharedCalendar/widget.html) (also linked at the
bottom of Settings): you paste a short loader script into Scriptable, run it once to log in, and add the widget.

The widget itself is `widget/main.ts`. `npm run build` bundles it into `dist/widget/calendario.js`, and the loader
downloads that file each time the widget refreshes, so the widget updates together with the app. It shows today and
the next two weeks in the small, medium and large Home Screen sizes and on the Lock Screen, with each person's
color and the background photo, and refreshes about every 15 minutes.

## How it's built
- React + TypeScript + Vite, installable as a PWA.
- Login and data on Supabase (free tier). Only two accounts can ever be created, and the app has no sign-up screen.
- Logging in with a username goes through the Edge Function in `supabase/functions/login`, so nobody's email address is ever sent to the browser. Deploy it with `supabase functions deploy login --no-verify-jwt`.
- Every push to `main` is built and published to GitHub Pages by `.github/workflows/deploy.yml`.

## Version number
The faint "v x.y.z" at the bottom of the screen is the `version` in `package.json`. Every pull request raises it by how big the change is, and the deploy workflow fails a PR that doesn't:
- **major** (2.0.0) for a big change, like a redesign or something that works differently,
- **minor** (1.1.0) for a new feature,
- **patch** (1.0.1) for a fix or a small tweak.

Bump it with `npm version patch --no-git-tag-version` (or `minor` / `major`) so `package-lock.json` follows.

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

## HolyExam tests
- Ramon's class tests from HolyExam show up as all-day events tagged as his. The [holyexamViewer](https://github.com/RamonPegoretti/holyexamViewer) job, which already signs in to HolyExam, sends the list to `holyexam_sync_exams` (migration `20261020150000_holyexam_exams.sql`) every time it runs.
- Each imported event keeps the HolyExam test id in `items.external_id`. A changed test updates its event, a removed test removes it, and items made in the app (no `external_id`) are never touched. An empty list removes nothing.
- Editing an imported event in the app works, but the next sync puts back HolyExam's title, notes and date.
