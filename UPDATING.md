# Updating the software safely

The system holds real money records. Every update follows the same routine so nothing is ever lost.

## The routine (every update)

1. **Back up first.** Station Setup → Backup → download the file for each station. Keep a copy somewhere
   other than this PC (USB drive or cloud drive).
2. **Build and test.** Changes are tried on sample data (`npm run dev:preview`) and checked by the automatic
   tests (`npm test`) before anything touches the live system.
3. **If the update needs a database change**, it comes as a small script, `supabase/update.sql`.
   Open Supabase → SQL Editor → New query → paste it → Run. It only **adds** things and never deletes or
   rewrites records. Run it **before** the new app goes live. It is safe to run twice.
4. **Push to GitHub.** Vercel rebuilds the site by itself and the data is untouched.
5. **Check the same day.** Open the screens that changed and confirm the balances did not move.
   The version number is shown at the bottom of the menu and at the bottom of Station Setup.

## If something goes wrong

- **The app misbehaves after an update:** Vercel → your project → Deployments → open the previous
  deployment → **Promote to Production**. This takes about a minute. Database changes only add things, so the
  previous version keeps working.
- **Data was damaged:** restore the backup from step 1 (Station Setup → Backup, owner only).

## Which SQL file is for what

| File | Use it | Careful |
|---|---|---|
| `supabase/update.sql` | on your live system, when an update says so | safe to run twice, only adds |
| `supabase/setup.sql` | only for a **brand-new** Supabase project | running it again does not delete data or recreate default accounts, but it is not meant for updates |
| the wipe-everything script | never on a live system | not kept in this project (see below) |

## The wipe-everything script

There is a script that deletes **all** records of both stations. It is deliberately **not** in this project, so it
cannot be pasted in by mistake. A copy was saved next to the project in `mashal-safe-copies`. To create a fresh
one deliberately:

```
node scripts/build-sql.mjs --reset-blank "C:/somewhere/OUTSIDE/the/project/reset_blank.sql"
```

The command refuses a path inside the project. Only use it when you truly want to start from zero, and only
after saving backups.

## Checks before you trust an update

- `npm test` passes and `npm run build` succeeds.
- The nightly comparison (safe cash, bank balances, customer balances) still matches your records.
