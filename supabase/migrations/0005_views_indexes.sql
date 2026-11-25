-- 0005_views_indexes.sql
-- Section 5: Views and performance/delta-sync indexes

CREATE OR REPLACE VIEW public.v_customer_balances AS
SELECT
  le.shop_id,
  le.customer_id,
  le.currency_code,
  COALESCE(SUM(le.amount_minor), 0)::bigint AS balance_minor,
  MAX(le.created_at) AS last_activity
FROM public.ledger_entries le
GROUP BY le.shop_id, le.customer_id, le.currency_code;

CREATE OR REPLACE VIEW public.v_shop_sales_daily AS
WITH daily_orders AS (
  SELECT
    o.shop_id,
    date_trunc('day', o.placed_at)::date AS day,
    o.currency_code,
    COUNT(o.id)::int AS orders_count,
    COALESCE(SUM(o.total_minor) FILTER (WHERE o.status IN ('accepted', 'processing', 'completed')), 0)::bigint AS gross_minor
  FROM public.orders o
  GROUP BY o.shop_id, date_trunc('day', o.placed_at)::date, o.currency_code
),
daily_payments AS (
  SELECT
    p.shop_id,
    date_trunc('day', COALESCE(p.paid_at, p.created_at))::date AS day,
    p.currency_code,
    COALESCE(SUM(p.amount_minor), 0)::bigint AS collected_minor
  FROM public.payments p
  WHERE p.purpose = 'order'
    AND p.status = 'succeeded'
  GROUP BY p.shop_id, date_trunc('day', COALESCE(p.paid_at, p.created_at))::date, p.currency_code
)
SELECT
  COALESCE(d_o.shop_id, d_p.shop_id) AS shop_id,
  COALESCE(d_o.day, d_p.day) AS day,
  COALESCE(d_o.currency_code, d_p.currency_code) AS currency_code,
  COALESCE(d_o.orders_count, 0)::int AS orders_count,
  COALESCE(d_o.gross_minor, 0)::bigint AS gross_minor,
  COALESCE(d_p.collected_minor, 0)::bigint AS collected_minor
FROM daily_orders d_o
FULL OUTER JOIN daily_payments d_p
  ON d_o.shop_id = d_p.shop_id
  AND d_o.day = d_p.day
  AND d_o.currency_code = d_p.currency_code;

GRANT SELECT ON public.v_customer_balances TO authenticated, service_role;
GRANT SELECT ON public.v_shop_sales_daily TO authenticated, service_role;

-- Indexes from Section 5
CREATE INDEX IF NOT EXISTS idx_orders_shop_status_placed
  ON public.orders (shop_id, status, placed_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_customer_placed
  ON public.orders (customer_id, placed_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_shop_active
  ON public.products (shop_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_shop_customer
  ON public.ledger_entries (shop_id, customer_id);

-- updated_at indexes on every synced table for delta sync
CREATE INDEX IF NOT EXISTS idx_shops_updated_at ON public.shops (updated_at);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON public.products (updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON public.orders (updated_at);
CREATE INDEX IF NOT EXISTS idx_order_items_updated_at ON public.order_items (updated_at);
CREATE INDEX IF NOT EXISTS idx_order_events_updated_at ON public.order_events (updated_at);
CREATE INDEX IF NOT EXISTS idx_payments_updated_at ON public.payments (updated_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_updated_at ON public.ledger_entries (updated_at);
CREATE INDEX IF NOT EXISTS idx_shop_customers_updated_at ON public.shop_customers (updated_at);
CREATE INDEX IF NOT EXISTS idx_notifications_updated_at ON public.notifications (updated_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_at ON public.subscriptions (updated_at);

