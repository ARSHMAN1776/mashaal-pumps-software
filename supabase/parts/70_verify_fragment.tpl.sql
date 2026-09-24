select {site}::text as station, 'customers'::text as item, count(*)::numeric as value from public.{p}_customers
union all select {site}, 'customer receivable (Rs)',
  (select coalesce(sum(opening_balance), 0) from public.{p}_customers)
  + (select coalesce(sum(total_amount), 0) from public.{p}_credit_slips)
  - (select coalesce(sum(amount), 0) from public.{p}_customer_recoveries)
union all select {site}, 'safe cash (Rs)', (select coalesce(sum(cash_in - cash_out), 0) from public.{p}_daybook_entries)
union all select {site}, 'daybook entries', count(*) from public.{p}_daybook_entries
union all select {site}, 'fuel sales', count(*) from public.{p}_fuel_sales
union all select {site}, 'credit slips', count(*) from public.{p}_credit_slips
union all select {site}, 'customer recoveries', count(*) from public.{p}_customer_recoveries
union all select {site}, 'expenses', count(*) from public.{p}_expenses
union all select {site}, 'tanks', count(*) from public.{p}_tanks
union all select {site}, 'nozzles', count(*) from public.{p}_nozzles
union all select {site}, 'staff advances outstanding (Rs)', (select coalesce(sum(amount), 0) from public.{p}_staff_advances where status = 'Outstanding')
union all select {site}, 'OMC invoices', count(*) from public.{p}_omc_invoices
union all select {site}, 'bank accounts', count(*) from public.{p}_bank_accounts
