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
