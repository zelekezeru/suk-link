-- 0004_functions.sql
-- Section 5 & Section 6: Ledger recomputation and Server-side RPC functions (SECURITY DEFINER)

-- 1. Recompute order payment status from append-only ledger_entries
CREATE OR REPLACE FUNCTION public.recompute_order_payment_status(p_order_id uuid)
RETURNS payment_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_paid_minor bigint;
  v_new_status payment_status;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RETURN 'unpaid';
  END IF;

  -- Paid amount for this order = -SUM(payment entries for that order)
  SELECT COALESCE(-SUM(amount_minor), 0)
  INTO v_paid_minor
  FROM public.ledger_entries
  WHERE order_id = p_order_id
    AND type = 'payment';

  IF v_paid_minor >= v_order.total_minor AND v_order.total_minor > 0 THEN
    v_new_status := 'paid';
  ELSIF v_paid_minor > 0 AND v_paid_minor < v_order.total_minor THEN
    v_new_status := 'partially_paid';
  ELSIF v_order.payment_status = 'on_credit' THEN
    v_new_status := 'on_credit';
  ELSE
    v_new_status := 'unpaid';
  END IF;

  UPDATE public.orders
  SET payment_status = v_new_status,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_new_status;
END;
$$;

-- 2. place_order
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
  v_seq int;
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

  -- Generate per-shop order number sequence (e.g. SL-0042)
  SELECT COUNT(*) + 1 INTO v_seq FROM public.orders WHERE shop_id = p_shop_id;
  v_order_number := 'SL-' || lpad(v_seq::text, 4, '0');

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

-- 3. update_order_status
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_to_status order_status,
  p_reason text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_order public.orders%ROWTYPE;
  v_shop public.shops%ROWTYPE;
  v_is_owner boolean;
  v_is_customer boolean;
  v_is_admin boolean;
  v_has_charge boolean;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Idempotent no-op if already in target status
  IF v_order.status = p_to_status THEN
    RETURN v_order;
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = v_order.shop_id;
  v_is_owner := (v_shop.owner_id = v_actor_id);
  v_is_customer := (v_order.customer_id = v_actor_id);
  v_is_admin := public.is_admin();

  IF NOT (v_is_owner OR v_is_customer OR v_is_admin) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Customer can only cancel while pending
  IF v_is_customer AND NOT v_is_owner AND NOT v_is_admin THEN
    IF NOT (v_order.status = 'pending' AND p_to_status = 'cancelled') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
  END IF;

  -- Enforce transition table
  IF v_order.status = 'pending' AND p_to_status IN ('accepted', 'rejected', 'cancelled') THEN
    -- valid
  ELSIF v_order.status = 'accepted' AND p_to_status = 'processing' THEN
    -- valid
  ELSIF v_order.status = 'processing' AND p_to_status = 'completed' THEN
    -- valid
  ELSIF (v_is_owner OR v_is_admin) AND v_order.status IN ('accepted', 'processing') AND p_to_status IN ('cancelled', 'rejected') THEN
    -- Section 5: If an accepted order is later cancelled or rejected by admin or shop owner with a reason
  ELSE
    RAISE EXCEPTION 'INVALID_TRANSITION:%_TO_%', v_order.status, p_to_status;
  END IF;

  IF p_to_status IN ('rejected', 'cancelled') AND COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  -- Update order timestamps and status
  UPDATE public.orders
  SET status = p_to_status,
      rejection_reason = CASE WHEN p_to_status IN ('rejected', 'cancelled') THEN p_reason ELSE rejection_reason END,
      accepted_at = CASE WHEN p_to_status = 'accepted' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
      completed_at = CASE WHEN p_to_status = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
      updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- Append order_event
  INSERT INTO public.order_events (
    order_id,
    from_status,
    to_status,
    actor_id,
    reason
  ) VALUES (
    p_order_id,
    v_order.status,
    p_to_status,
    v_actor_id,
    p_reason
  );

  -- Fix from_status in just-inserted event
  UPDATE public.order_events
  SET from_status = (
    SELECT to_status FROM public.order_events
    WHERE order_id = p_order_id AND id <> currval(pg_get_serial_sequence('public.order_events', 'id'))
    ORDER BY created_at DESC LIMIT 1
  )
  WHERE FALSE; -- No-op placeholder; let's insert with accurate from_status below

  -- Section 5 Confirmed Rule: When shop accepts an order (pending -> accepted), write one charge of +total
  IF p_to_status = 'accepted' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ledger_entries
      WHERE order_id = p_order_id AND type = 'charge'
    ) INTO v_has_charge;

    IF NOT v_has_charge THEN
      INSERT INTO public.ledger_entries (
        shop_id,
        customer_id,
        order_id,
        type,
        amount_minor,
        currency_code,
        description,
        created_by
      ) VALUES (
        v_order.shop_id,
        v_order.customer_id,
        v_order.id,
        'charge',
        v_order.total_minor,
        v_order.currency_code,
        'Order ' || v_order.order_number || ' accepted',
        v_actor_id
      );
    END IF;
    PERFORM public.recompute_order_payment_status(p_order_id);
  END IF;

  -- If an order that already had a charge is cancelled/rejected, write a compensating adjustment of -total
  IF p_to_status IN ('rejected', 'cancelled') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ledger_entries
      WHERE order_id = p_order_id AND type = 'charge'
    ) INTO v_has_charge;

    IF v_has_charge THEN
      INSERT INTO public.ledger_entries (
        shop_id,
        customer_id,
        order_id,
        type,
        amount_minor,
        currency_code,
        description,
        created_by
      ) VALUES (
        v_order.shop_id,
        v_order.customer_id,
        v_order.id,
        'adjustment',
        -v_order.total_minor,
        v_order.currency_code,
        'Order ' || v_order.order_number || ' ' || p_to_status::text || ': ' || COALESCE(p_reason, ''),
        v_actor_id
      );
      PERFORM public.recompute_order_payment_status(p_order_id);
    END IF;
  END IF;

  -- Notify customer of status change
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    data
  ) VALUES (
    v_order.customer_id,
    'order_status',
    'Order ' || v_order.order_number || ' ' || initcap(p_to_status::text),
    'Your order ' || v_order.order_number || ' is now ' || p_to_status::text || '.',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'status', p_to_status,
      'reason', p_reason
    )
  );

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  RETURN v_order;
END;
$$;

-- Clean override for update_order_status to record exact from_status in order_events
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_to_status order_status,
  p_reason text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_order public.orders%ROWTYPE;
  v_prev_status order_status;
  v_shop public.shops%ROWTYPE;
  v_is_owner boolean;
  v_is_customer boolean;
  v_is_admin boolean;
  v_has_charge boolean;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  v_prev_status := v_order.status;

  -- Idempotent no-op if already in target status
  IF v_prev_status = p_to_status THEN
    RETURN v_order;
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = v_order.shop_id;
  v_is_owner := (v_shop.owner_id = v_actor_id);
  v_is_customer := (v_order.customer_id = v_actor_id);
  v_is_admin := public.is_admin();

  IF NOT (v_is_owner OR v_is_customer OR v_is_admin) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Customer can only cancel while pending
  IF v_is_customer AND NOT v_is_owner AND NOT v_is_admin THEN
    IF NOT (v_prev_status = 'pending' AND p_to_status = 'cancelled') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
  END IF;

  -- Enforce transition table
  IF v_prev_status = 'pending' AND p_to_status IN ('accepted', 'rejected', 'cancelled') THEN
    -- valid
  ELSIF v_prev_status = 'accepted' AND p_to_status = 'processing' THEN
    -- valid
  ELSIF v_prev_status = 'processing' AND p_to_status = 'completed' THEN
    -- valid
  ELSIF (v_is_owner OR v_is_admin) AND v_prev_status IN ('accepted', 'processing') AND p_to_status IN ('cancelled', 'rejected') THEN
    -- valid compensating cancellation/rejection
  ELSE
    RAISE EXCEPTION 'INVALID_TRANSITION:%_TO_%', v_prev_status, p_to_status;
  END IF;

  IF p_to_status IN ('rejected', 'cancelled') AND COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  UPDATE public.orders
  SET status = p_to_status,
      rejection_reason = CASE WHEN p_to_status IN ('rejected', 'cancelled') THEN p_reason ELSE rejection_reason END,
      accepted_at = CASE WHEN p_to_status = 'accepted' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
      completed_at = CASE WHEN p_to_status = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
      updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.order_events (
    order_id,
    from_status,
    to_status,
    actor_id,
    reason
  ) VALUES (
    p_order_id,
    v_prev_status,
    p_to_status,
    v_actor_id,
    p_reason
  );

  IF p_to_status = 'accepted' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ledger_entries
      WHERE order_id = p_order_id AND type = 'charge'
    ) INTO v_has_charge;

    IF NOT v_has_charge THEN
      INSERT INTO public.ledger_entries (
        shop_id,
        customer_id,
        order_id,
        type,
        amount_minor,
        currency_code,
        description,
        created_by
      ) VALUES (
        v_order.shop_id,
        v_order.customer_id,
        v_order.id,
        'charge',
        v_order.total_minor,
        v_order.currency_code,
        'Order ' || v_order.order_number || ' accepted',
        v_actor_id
      );
    END IF;
    PERFORM public.recompute_order_payment_status(p_order_id);
  END IF;

  IF p_to_status IN ('rejected', 'cancelled') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ledger_entries
      WHERE order_id = p_order_id AND type = 'charge'
    ) INTO v_has_charge;

    IF v_has_charge THEN
      INSERT INTO public.ledger_entries (
        shop_id,
        customer_id,
        order_id,
        type,
        amount_minor,
        currency_code,
        description,
        created_by
      ) VALUES (
        v_order.shop_id,
        v_order.customer_id,
        v_order.id,
        'adjustment',
        -v_order.total_minor,
        v_order.currency_code,
        'Order ' || v_order.order_number || ' ' || p_to_status::text || ': ' || COALESCE(p_reason, ''),
        v_actor_id
      );
      PERFORM public.recompute_order_payment_status(p_order_id);
    END IF;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    data
  ) VALUES (
    v_order.customer_id,
    'order_status',
    'Order ' || v_order.order_number || ' ' || initcap(p_to_status::text),
    'Your order ' || v_order.order_number || ' is now ' || p_to_status::text || '.',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'status', p_to_status,
      'reason', p_reason
    )
  );

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  RETURN v_order;
END;
$$;

-- 4. record_payment (manual cash or other payment by shop owner)
CREATE OR REPLACE FUNCTION public.record_payment(
  p_idempotency_key text,
  p_shop_id uuid,
  p_customer_id uuid,
  p_order_id uuid DEFAULT NULL,
  p_amount_minor bigint DEFAULT 0,
  p_method text DEFAULT 'cash',
  p_note text DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_shop public.shops%ROWTYPE;
  v_market public.markets%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_outstanding bigint;
  v_payment public.payments%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- Idempotency check
  SELECT * INTO v_existing FROM public.payments WHERE idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id;
  IF v_shop.id IS NULL THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND';
  END IF;

  IF v_shop.owner_id <> v_actor_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE code = v_shop.market_code;

  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND shop_id = p_shop_id;
    IF v_order.id IS NULL THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status = 'pending' THEN
      RAISE EXCEPTION 'CANNOT_PAY_PENDING_ORDER';
    END IF;
    IF v_order.currency_code <> v_market.currency_code THEN
      RAISE EXCEPTION 'CURRENCY_MISMATCH';
    END IF;
  END IF;

  -- Check customer outstanding balance at this shop
  SELECT COALESCE(SUM(amount_minor), 0)
  INTO v_outstanding
  FROM public.ledger_entries
  WHERE shop_id = p_shop_id
    AND customer_id = p_customer_id;

  IF p_amount_minor > v_outstanding AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_OUTSTANDING:%', v_outstanding;
  END IF;

  INSERT INTO public.payments (
    purpose,
    order_id,
    shop_id,
    payer_id,
    amount_minor,
    currency_code,
    method_code,
    provider,
    provider_ref,
    status,
    idempotency_key,
    recorded_by,
    paid_at
  ) VALUES (
    'order',
    p_order_id,
    p_shop_id,
    p_customer_id,
    p_amount_minor,
    v_market.currency_code,
    CASE WHEN p_method IN ('chapa', 'telebirr', 'cbe_birr', 'cash', 'credit', 'demo', 'other') THEN p_method ELSE 'cash' END,
    'manual',
    'MAN-' || substr(md5(p_idempotency_key), 1, 10),
    'succeeded',
    p_idempotency_key,
    v_actor_id,
    now()
  )
  RETURNING * INTO v_payment;

  INSERT INTO public.ledger_entries (
    shop_id,
    customer_id,
    order_id,
    payment_id,
    type,
    amount_minor,
    currency_code,
    description,
    created_by
  ) VALUES (
    p_shop_id,
    p_customer_id,
    p_order_id,
    v_payment.id,
    'payment',
    -p_amount_minor,
    v_market.currency_code,
    COALESCE(NULLIF(trim(p_note), ''), 'Cash payment recorded'),
    v_actor_id
  );

  IF p_order_id IS NOT NULL THEN
    PERFORM public.recompute_order_payment_status(p_order_id);
  END IF;

  -- Audit log for manual payment record (Section 10)
  INSERT INTO public.audit_log (
    actor_id,
    action,
    entity,
    entity_id,
    payload
  ) VALUES (
    v_actor_id,
    'record_payment',
    'payments',
    v_payment.id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'customer_id', p_customer_id,
      'order_id', p_order_id,
      'amount_minor', p_amount_minor,
      'method', p_method
    )
  );

  RETURN v_payment;
END;
$$;

-- 5. set_order_on_credit
CREATE OR REPLACE FUNCTION public.set_order_on_credit(p_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_order public.orders%ROWTYPE;
  v_shop public.shops%ROWTYPE;
  v_sc public.shop_customers%ROWTYPE;
  v_balance bigint;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.status = 'pending' THEN
    RAISE EXCEPTION 'ORDER_NOT_ACCEPTED_YET';
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = v_order.shop_id;
  IF v_order.customer_id <> v_actor_id AND v_shop.owner_id <> v_actor_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_shop.accepts_credit = false THEN
    RAISE EXCEPTION 'SHOP_DOES_NOT_ACCEPT_CREDIT';
  END IF;

  SELECT * INTO v_sc
  FROM public.shop_customers
  WHERE shop_id = v_order.shop_id AND customer_id = v_order.customer_id;

  -- Check credit limit if set (note: charge was already added on acceptance)
  SELECT COALESCE(SUM(amount_minor), 0)
  INTO v_balance
  FROM public.ledger_entries
  WHERE shop_id = v_order.shop_id AND customer_id = v_order.customer_id;

  IF v_sc.credit_limit_minor IS NOT NULL AND v_balance > v_sc.credit_limit_minor THEN
    RAISE EXCEPTION 'CREDIT_LIMIT_EXCEEDED:%', v_sc.credit_limit_minor;
  END IF;

  UPDATE public.orders
  SET payment_status = CASE
        WHEN payment_status = 'paid'::payment_status THEN 'paid'::payment_status
        ELSE 'on_credit'::payment_status
      END,
      updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

-- 6. admin_set_subscription
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  p_shop_id uuid,
  p_action text,
  p_reason text,
  p_reference text DEFAULT NULL
)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_base_date timestamptz;
BEGIN
  v_actor_id := auth.uid();
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_ONLY';
  END IF;

  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE shop_id = p_shop_id FOR UPDATE;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND';
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = v_sub.plan_id;

  IF p_action = 'activate' THEN
    UPDATE public.subscriptions
    SET status = 'active',
        current_period_start = now(),
        current_period_end = now() + make_interval(days => COALESCE(v_plan.duration_days, 365)),
        last_paid_minor = COALESCE(v_plan.price_minor, last_paid_minor),
        suspended_reason = NULL,
        updated_at = now()
    WHERE shop_id = p_shop_id
    RETURNING * INTO v_sub;
  ELSIF p_action = 'extend' THEN
    v_base_date := GREATEST(now(), v_sub.current_period_end);
    UPDATE public.subscriptions
    SET status = 'active',
        current_period_end = v_base_date + make_interval(days => COALESCE(v_plan.duration_days, 365)),
        suspended_reason = NULL,
        updated_at = now()
    WHERE shop_id = p_shop_id
    RETURNING * INTO v_sub;
  ELSIF p_action = 'suspend' THEN
    UPDATE public.subscriptions
    SET status = 'suspended',
        suspended_reason = p_reason,
        updated_at = now()
    WHERE shop_id = p_shop_id
    RETURNING * INTO v_sub;
  ELSIF p_action = 'unsuspend' THEN
    UPDATE public.subscriptions
    SET status = CASE WHEN current_period_end > now() THEN 'active'::subscription_status ELSE 'expired'::subscription_status END,
        suspended_reason = NULL,
        updated_at = now()
    WHERE shop_id = p_shop_id
    RETURNING * INTO v_sub;
  ELSE
    RAISE EXCEPTION 'INVALID_SUBSCRIPTION_ACTION';
  END IF;

  INSERT INTO public.audit_log (
    actor_id,
    action,
    entity,
    entity_id,
    payload
  ) VALUES (
    v_actor_id,
    'admin_set_subscription:' || p_action,
    'subscriptions',
    v_sub.id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action', p_action,
      'reason', p_reason,
      'reference', p_reference,
      'new_status', v_sub.status,
      'current_period_end', v_sub.current_period_end
    )
  );

  RETURN v_sub;
END;
$$;

-- 7. mark_notifications_read
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  UPDATE public.notifications
  SET read_at = COALESCE(read_at, now()),
      updated_at = now()
  WHERE id = ANY(p_ids)
    AND user_id = auth.uid();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 8. Server helper to settle an online payment (called by payments-webhook / payments-demo-confirm)
CREATE OR REPLACE FUNCTION public.complete_online_payment(
  p_payment_id uuid,
  p_provider_ref text,
  p_status payment_tx_status
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_base_end timestamptz;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  -- Idempotent if already succeeded
  IF v_payment.status = 'succeeded' THEN
    RETURN v_payment;
  END IF;

  IF p_status = 'failed' THEN
    UPDATE public.payments
    SET status = 'failed',
        provider_ref = COALESCE(p_provider_ref, provider_ref),
        updated_at = now()
    WHERE id = p_payment_id
    RETURNING * INTO v_payment;
    RETURN v_payment;
  END IF;

  UPDATE public.payments
  SET status = 'succeeded',
      provider_ref = COALESCE(p_provider_ref, provider_ref),
      paid_at = now(),
      updated_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  IF v_payment.purpose = 'order' AND v_payment.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_payment.order_id;
    INSERT INTO public.ledger_entries (
      shop_id,
      customer_id,
      order_id,
      payment_id,
      type,
      amount_minor,
      currency_code,
      description,
      created_by
    ) VALUES (
      v_payment.shop_id,
      v_payment.payer_id,
      v_payment.order_id,
      v_payment.id,
      'payment',
      -v_payment.amount_minor,
      v_payment.currency_code,
      'Online payment (' || v_payment.method_code || ') ref ' || COALESCE(v_payment.provider_ref, ''),
      v_payment.payer_id
    );
    PERFORM public.recompute_order_payment_status(v_payment.order_id);
  ELSIF v_payment.purpose = 'subscription' AND v_payment.subscription_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_payment.subscription_id FOR UPDATE;
    SELECT * INTO v_plan FROM public.plans WHERE id = v_sub.plan_id;
    v_base_end := GREATEST(now(), v_sub.current_period_end);

    UPDATE public.subscriptions
    SET status = 'active',
        last_paid_minor = v_payment.amount_minor,
        current_period_end = v_base_end + make_interval(days => COALESCE(v_plan.duration_days, 365)),
        suspended_reason = NULL,
        updated_at = now()
    WHERE id = v_sub.id;
  END IF;

  RETURN v_payment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_order_payment_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, uuid, jsonb, fulfilment_type, text, text, timestamptz, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, order_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_payment(text, uuid, uuid, uuid, bigint, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_order_on_credit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_online_payment(uuid, text, payment_tx_status) TO authenticated, service_role;

