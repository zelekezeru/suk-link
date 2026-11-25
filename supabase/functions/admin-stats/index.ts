// supabase/functions/admin-stats/index.ts
// Edge Function: Admin KPI aggregation query

export const ADMIN_STATS_SQL = `
SELECT jsonb_build_object(
  'customers_count', (SELECT COUNT(*) FROM public.profiles WHERE role = 'customer'),
  'shop_owners_count', (SELECT COUNT(*) FROM public.profiles WHERE role = 'shop_owner'),
  'admins_count', (SELECT COUNT(*) FROM public.profiles WHERE role = 'admin'),
  'shops_count', (SELECT COUNT(*) FROM public.shops WHERE deleted_at IS NULL),
  'active_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active'),
  'trial_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'trial'),
  'expired_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status IN ('expired', 'suspended')),
  'orders_today', (SELECT COUNT(*) FROM public.orders WHERE placed_at >= date_trunc('day', now())),
  'gmv_today_minor', COALESCE((
    SELECT SUM(total_minor)
    FROM public.orders
    WHERE placed_at >= date_trunc('day', now())
      AND status NOT IN ('rejected', 'cancelled')
  ), 0)
) AS stats;
`;

