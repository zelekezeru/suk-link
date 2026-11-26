-- 0007: Race-safe per-shop order numbers (Build Plan §17.3)
--
-- Before: place_order used COUNT(*) + 1, so two concurrent orders for the same
-- shop could receive the same order_number. There was no unique constraint, so
-- the duplicate was stored silently.
--
-- After: a per-shop counter row is incremented atomically with
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING, which takes a row lock and
-- serialises concurrent callers. A unique index makes any future regression fail
-- loudly instead of storing a duplicate.

CREATE TABLE IF NOT EXISTS public.shop_order_counters (
  shop_id uuid PRIMARY KEY REFERENCES public.shops (id) ON DELETE CASCADE,
  last_number int NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Internal table: only SECURITY DEFINER functions and triggers touch it.
ALTER TABLE public.shop_order_counters ENABLE ROW LEVEL SECURITY;

-- Backfill from any existing orders (numbers look like SL-0042).
INSERT INTO public.shop_order_counters (shop_id, last_number)
SELECT shop_id, MAX((substring(order_number FROM '^SL-(\d+)$'))::int)
FROM public.orders
WHERE order_number ~ '^SL-\d+$'
GROUP BY shop_id
ON CONFLICT (shop_id) DO UPDATE
SET last_number = GREATEST(public.shop_order_counters.last_number, EXCLUDED.last_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shop_order_number
  ON public.orders (shop_id, order_number);

-- Keep the counter ahead of orders inserted directly (seed scripts, imports),
-- so the next place_order never reuses a seeded number.
CREATE OR REPLACE FUNCTION public.sync_shop_order_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num int;
BEGIN
  IF NEW.order_number ~ '^SL-\d+$' THEN
    v_num := (substring(NEW.order_number FROM '^SL-(\d+)$'))::int;
    INSERT INTO public.shop_order_counters (shop_id, last_number)
    VALUES (NEW.shop_id, v_num)
    ON CONFLICT (shop_id) DO UPDATE
    SET last_number = GREATEST(public.shop_order_counters.last_number, EXCLUDED.last_number),
        updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_sync_counter ON public.orders;
CREATE TRIGGER trg_orders_sync_counter
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_shop_order_counter();

-- Atomically reserve the next order number for a shop.
CREATE OR REPLACE FUNCTION public.next_shop_order_number(p_shop_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq int;
BEGIN
  INSERT INTO public.shop_order_counters (shop_id, last_number)
  VALUES (p_shop_id, 1)
  ON CONFLICT (shop_id) DO UPDATE
  SET last_number = public.shop_order_counters.last_number + 1,
      updated_at = now()
  RETURNING last_number INTO v_seq;
  RETURN 'SL-' || lpad(v_seq::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_shop_order_number(uuid) FROM PUBLIC;

-- place_order: identical to 0004 except the order number now comes from
-- next_shop_order_number().
CREATE OR REPLACE FUNCTION public.place_order(
  p_order_id uuid,
  p_shop_id uuid,
  p_items jsonb,
  p_fulfilment fulfilment_type,
  p_address text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_client_created_at timestamptz DEFAULT now(),
  p_expected_total_minor bigint DEFAULT NULL,
  p_preferred_payment_method text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_existing public.orders%ROWTYPE;
  v_shop public.shops%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_market public.markets%ROWTYPE;
  v_recent_count int;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_qty int;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_delivery_fee bigint := 0;
  v_total bigint := 0;
  v_computed_lines jsonb := '[]'::jsonb;
  v_order_number text;
  v_created_order public.orders%ROWTYPE;
BEGIN
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- Idempotency check on p_order_id
  SELECT * INTO v_existing FROM public.orders WHERE id = p_order_id;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.customer_id <> v_customer_id THEN
      RAISE EXCEPTION 'ORDER_ID_CONFLICT';
    END IF;
    RETURN v_existing;
  END IF;

  -- Simple per-user rate limit: max 10 orders per minute (Section 10)
  SELECT COUNT(*) INTO v_recent_count
  FROM public.orders
  WHERE customer_id = v_customer_id
    AND created_at > now() - interval '1 minute';
  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED';
  END IF;

  -- Validate shop
  SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id AND deleted_at IS NULL;
  IF v_shop.id IS NULL THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND';
  END IF;
  IF v_shop.is_open = false THEN
    RAISE EXCEPTION 'SHOP_CLOSED';
  END IF;

  -- Validate subscription is not expired or suspended
  SELECT * INTO v_sub FROM public.subscriptions WHERE shop_id = p_shop_id;
  IF v_sub.id IS NOT NULL AND v_sub.status IN ('expired', 'suspended') THEN
    RAISE EXCEPTION 'SHOP_SUBSCRIPTION_INACTIVE';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE code = v_shop.market_code;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_ORDER_ITEMS';
  END IF;

  -- First pass: validate every item and compute authoritative totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item ->> 'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 999 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item ->> 'product_id')::uuid
      AND shop_id = p_shop_id;

    IF v_product.id IS NULL OR v_product.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND:%', COALESCE(v_item ->> 'product_id', '');
    END IF;

    IF v_product.is_available = false THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE:%', v_product.name;
    END IF;

    v_line_total := v_product.price_minor * v_qty;
    v_subtotal := v_subtotal + v_line_total;
    v_computed_lines := v_computed_lines || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product.id,
        'product_name', v_product.name,
        'unit', v_product.unit,
        'unit_price_minor', v_product.price_minor,
        'quantity', v_qty,
        'line_total_minor', v_line_total
      )
    );
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;

  IF p_expected_total_minor IS NOT NULL AND p_expected_total_minor <> v_total THEN
    RAISE EXCEPTION 'PRICE_CHANGED:%', jsonb_build_object(
      'expected_total_minor', p_expected_total_minor,
      'actual_total_minor', v_total,
      'subtotal_minor', v_subtotal,
      'delivery_fee_minor', v_delivery_fee,
      'items', v_computed_lines
    )::text;
  END IF;

  -- Reserve the next per-shop order number (row-locked counter, §17.3)
  v_order_number := public.next_shop_order_number(p_shop_id);

  INSERT INTO public.orders (
    id,
    order_number,
    shop_id,
    customer_id,
    status,
    payment_status,
    fulfilment,
    currency_code,
    preferred_payment_method,
    delivery_address,
    note,
    subtotal_minor,
    delivery_fee_minor,
    total_minor,
    placed_at,
    client_created_at
  ) VALUES (
    p_order_id,
    v_order_number,
    p_shop_id,
    v_customer_id,
    'pending',
    'unpaid',
    p_fulfilment,
    COALESCE(v_market.currency_code, 'ETB'),
    p_preferred_payment_method,
    p_address,
    p_note,
    v_subtotal,
    v_delivery_fee,
    v_total,
    now(),
    COALESCE(p_client_created_at, now())
  )
  RETURNING * INTO v_created_order;

  -- Insert order_items snapshots
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_computed_lines) LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_snapshot,
      unit_price_minor,
      quantity,
      line_total_minor
    ) VALUES (
      p_order_id,
      (v_item ->> 'product_id')::uuid,
      v_item ->> 'product_name',
      v_item ->> 'unit',
      (v_item ->> 'unit_price_minor')::bigint,
      (v_item ->> 'quantity')::int,
      (v_item ->> 'line_total_minor')::bigint
    );
  END LOOP;

  -- Append initial order_event
  INSERT INTO public.order_events (
    order_id,
    from_status,
    to_status,
    actor_id,
    reason
  ) VALUES (
    p_order_id,
    NULL,
    'pending',
    v_customer_id,
    NULL
  );

  -- Upsert shop_customers
  INSERT INTO public.shop_customers (
    shop_id,
    customer_id,
    first_order_at,
    last_order_at
  ) VALUES (
    p_shop_id,
    v_customer_id,
    now(),
    now()
  )
  ON CONFLICT (shop_id, customer_id) DO UPDATE
  SET last_order_at = now(),
      updated_at = now();

  -- Notify shop owner
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    data
  ) VALUES (
    v_shop.owner_id,
    'new_order',
    'New Order ' || v_order_number,
    'You received a new order (' || v_order_number || ').',
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order_number,
      'shop_id', p_shop_id,
      'total_minor', v_total,
      'currency_code', COALESCE(v_market.currency_code, 'ETB')
    )
  );

  RETURN v_created_order;
END;
$$;
