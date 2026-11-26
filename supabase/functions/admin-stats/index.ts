// supabase/functions/admin-stats/index.ts
// Edge Function: Admin KPI aggregation query.
// Single source of truth: the browser gateway and local gateway import this SQL.
//
// "Today" is evaluated per order in its shop's market timezone (markets.timezone),
// so an order placed at 01:30 in Addis Ababa counts as today, not yesterday (UTC).

export const ADMIN_STATS_SQL = `
WITH today_orders AS (
  SELECT o.status, o.total_minor
  FROM public.orders o
  JOIN public.shops s ON s.id = o.shop_id
  JOIN public.markets m ON m.code = s.market_code
  WHERE o.deleted_at IS NULL
    AND (o.placed_at AT TIME ZONE m.timezone)::date = (now() AT TIME ZONE m.timezone)::date
)
SELECT jsonb_build_object(
  'customers_count', (SELECT COUNT(*) FROM public.profiles WHERE role = 'customer'),
  'shop_owners_count', (SELECT COUNT(*) FROM public.profiles WHERE role = 'shop_owner'),
  'admins_count', (SELECT COUNT(*) FROM public.profiles WHERE role = 'admin'),
  'shops_count', (SELECT COUNT(*) FROM public.shops WHERE deleted_at IS NULL),
  'active_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active'),
  'trial_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'trial'),
  'expired_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status IN ('expired', 'suspended')),
  'orders_today', (SELECT COUNT(*) FROM today_orders),
  'gmv_today_minor', COALESCE((
    SELECT SUM(total_minor) FROM today_orders WHERE status NOT IN ('rejected', 'cancelled')
  ), 0)
) AS stats;
`;
