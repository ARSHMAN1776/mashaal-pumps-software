# Mashaal Petroleum – Setup & Operations

## 1. One-time database setup (Supabase)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/setup.sql` and press **Run**.
   - It is safe to run more than once (idempotent, guarded by `migration_log`).
   - Your existing data is **not dropped**: old tables are renamed to `legacy_*` and locked.
   - Everything in the old station JSON and the old side tables is imported into the new tables, and old balances are preserved exactly.
   - The last query result is a verification table (row counts per station). Check it looks right.
3. Make sure `.env` contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. `npm install` then `npm run dev` (or `npm run build` for production).

## 2. First login

| User | Password (first time only) | Role |
|---|---|---|
| owner | mashaal@owner | Owner, both stations |
| owner.parco | parco@owner | Owner, SITE-01 |
| owner.pso | pso@owner | Owner, SITE-02 |
| naveed.akhtar / tariq.manager / station.manager | manager123 | Manager |
| tariq.cashier / kamran.cashier / station.cashier | cashier123 | Cashier |

Every account is forced to choose a new password at first sign-in. Owners can add,
edit, reset and remove users in **Station Setup → Users**.

## 3. Data layout

- Each station has its own physical tables: `s01_*` (SITE-01), `s02_*` (SITE-02).
- Shared tables: `stations`, `profiles`, `profile_stations`, `migration_log`.
- Only facts are stored (sales, slips, payments…). Balances (customer, safe, bank,
  tank, meters, OMC, stock) are always calculated, so they cannot drift.
- Nothing is stored in the browser except the sign-in token.
- Adding a third station: `node scripts/build-sql.mjs --add-station` and run the output.
  After editing anything in `supabase/parts/`, regenerate with `npm run build:sql`.

## 4. Customer deletion rule

- No history → permanently deleted.
- Has history, balance 0 → archived (hidden, history kept).
- Balance not 0 → refused until settled.

## 5. Try it without a database

```
npm run dev:preview
```
Sample data in memory only (password for every user: `Preview#123`). Not in production builds.

## 6. Checks

```
npm test          # business rules + real-SQL tests (PGlite)
npx tsc --noEmit
npm run build
```

Backups: **Station Setup → Backup** exports a full file and restores it (old-format files too).
