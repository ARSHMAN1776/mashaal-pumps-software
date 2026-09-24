# Change log

Newest first. The version number is shown at the bottom of the menu and in Station Setup.

## 1.0.0 — 2026-09-25 (first release for real use)

**Data and safety**
- Everything is saved in Supabase, in separate tables for each station. Nothing is kept in the browser except the sign-in.
- Balances are always worked out from the entries, so they cannot drift.
- Real sign-in with roles (owner, manager, cashier); each person sees only their own station and their own role's screens.
- If two people edit the same record at once, the second save is refused with a clear message.
- Every change is recorded in an audit trail; weekly backup and restore in Station Setup.

**Money handling**
- Cash, bank and supplier postings are saved together with the entry that caused them (all or nothing).
- Prices: a reading or slip dated before a price change keeps the old price; every price change is kept as a history record.
- Cheques or online payments noted by a cashier wait for a manager to choose the bank (one-click Confirm).
- Customers: credit limit and **Credit left** on the list, the customer card and the slip form.
- Salary: days absent and other deductions with a live "You pay" line.
- Lubricant stock bought from a listed supplier adds an unpaid bill to that supplier.
- Owner withdrawals from a bank account or as cash from the safe.
- Nobody can post an entry dated in the future.

**Screens**
- Every form fits a laptop screen without scrolling; on phones the buttons stay pinned.
- Phone layout: slim top bar, one station card per row, readable tables.
- The instruction guide on each page is now at the bottom of the page.
