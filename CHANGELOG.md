# Change log

Newest first. The version number is shown at the bottom of the menu and in Station Setup.

## Next (screen redesign, no database change)

- New look for laptops: a clean side menu with plain names (Home, Sell fuel, Credit customers, Cash book, Fuel tanks, Fuel deliveries, Bank, Staff & salaries...), a slim top bar, and one main button per page.
- Row buttons are tucked into a "More" menu so tables stay readable.
- Home shows what needs doing today, the key numbers and how full the tanks are.
- Plain-English titles, headings and table columns on the main pages, and a simpler Fuel deliveries table.
- Owner overview and Profit & withdrawals rewritten in plain words.
- Station picker rewritten. PARCO is red and PSO is green everywhere.
- Bank: every deposit, cash-out and bank charge typed here now has an **Edit** button, so a mistake is fixed in place instead of deleted and typed again.
- Credit slips: a **Rate per litre** box. It starts at the Settings price; only an owner or manager can type a different rate (a warning shows the difference and it is recorded). A slip keeps its own rate, so later price changes never change it.
- Customer account: cards for **Fuel taken** (litres by fuel), **Payments made**, **Owes now** and **Credit left**, for any dates. The customer list shows each customer's last fuel and last payment.
- Bank deposits: **Cash**, **Cheque** or **Online transfer**. An online transfer is its own kind of bank line, so the list shows it clearly, and it does not touch the safe.
- **Printing and PDF fixed.** Reports, bills, receipts and statements now print (and "Save as PDF") as a clean A4 page, or as an 80 mm slip, instead of a black or blank page. Long reports continue over several pages with the table headings repeated on each. The row "More" menu also opens on top of pop-up windows now.
- **WhatsApp messages rewritten** (credit slip and customer statement): plain words, shorter, and safe to send. The statement now shows litres taken (by fuel), payments received, what the customer owes now, credit left, the latest entries and where to pay. A customer who paid in advance is told so instead of seeing a minus number. The made-up "Voucher Hash / VERIFIED" line is gone. The message is kept short enough for a WhatsApp link (about 450 to 1,000 characters instead of 2,000 to 3,300). A phone number WhatsApp cannot open (a landline, or too short) no longer causes an error; WhatsApp opens so you can choose the contact.
- **Needs one SQL step:** run `supabase/update.sql` in Supabase (SQL Editor) BEFORE the new version goes live. It only widens the list of allowed bank line types; no record is changed or removed, and it is safe to run twice.

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
