-- 0008: Walk-in customers, a ledger keyed by shop customer, balance payments,
-- and payment-path security fixes (Build Plan §5, §17.1, §17.2, §4 Payments, §10).
--
-- Must stay idempotent: the browser demo re-executes every migration on reset.
--
-- What changes:
--   * shop_customers.customer_id becomes nullable: NULL = walk-in without an app account.
--   * ledger_entries and payments gain shop_customer_id (the authoritative key).
--     customer_id stays as a denormalised copy for RLS ("my own rows").
--     A BEFORE INSERT trigger fills whichever side is missing and rejects any row whose
--     shop customer belongs to another shop, so older RPCs keep working unchanged.
--   * Payments without an order are allocated to the oldest open charges first (§17.2).
--   * New owner RPCs: add_walk_in_customer, update_shop_customer, record_manual_charge,
--     record_customer_payment. New customer/owner RPC: init_payment.
--   * Security: complete_online_payment is no longer callable by app users, and the two
--     reporting views now respect RLS (security_invoker).

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

-- Not used in this file: a new enum value cannot be used in the transaction that adds it.
ALTER TYPE payment_purpose ADD VALUE IF NOT EXISTS 'balance';

ALTER TABLE public.shop_customers ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.shop_customers ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.shop_customers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.shop_customers ADD COLUMN IF NOT EXISTS promised_pay_at date;
ALTER TABLE public.shop_customers ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles (id);

ALTER TABLE public.shop_customers DROP CONSTRAINT IF EXISTS shop_customers_identity;
ALTER TABLE public.shop_customers ADD CONSTRAINT shop_customers_identity
  CHECK (customer_id IS NOT NULL OR length(btrim(COALESCE(display_name, ''))) > 0);

ALTER TABLE public.shop_customers DROP CONSTRAINT IF EXISTS shop_customers_display_name_len;
ALTER TABLE public.shop_customers ADD CONSTRAINT shop_customers_display_name_len
  CHECK (display_name IS NULL OR length(display_name) <= 120);

-- One walk-in per phone number per shop.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_customers_walk_in_phone
  ON public.shop_customers (shop_id, phone)
  WHERE customer_id IS NULL AND phone IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS shop_customer_id uuid REFERENCES public.shop_customers (id);
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.ledger_entries ALTER COLUMN customer_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_entries_idempotency_key
  ON public.ledger_entries (idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS shop_customer_id uuid REFERENCES public.shop_customers (id);
ALTER TABLE public.payments ALTER COLUMN payer_id DROP NOT NULL;

-- Backfill: every (shop, customer) pair on the ledger gets a shop_customers row.
INSERT INTO public.shop_customers (shop_id, customer_id, first_order_at, last_order_at)
SELECT le.shop_id, le.customer_id, MIN(le.created_at), MAX(le.created_at)
FROM public.ledger_entries le
WHERE le.customer_id IS NOT NULL AND le.shop_customer_id IS NULL
GROUP BY le.shop_id, le.customer_id
ON CONFLICT (shop_id, customer_id) DO NOTHING;

UPDATE public.ledger_entries le
SET shop_customer_id = sc.id
FROM public.shop_customers sc
WHERE le.shop_customer_id IS NULL
  AND sc.shop_id = le.shop_id
  AND sc.customer_id = le.customer_id;

UPDATE public.payments p
SET shop_customer_id = sc.id
FROM public.shop_customers sc
WHERE p.shop_customer_id IS NULL
  AND p.purpose::text <> 'subscription'
  AND sc.shop_id = p.shop_id
  AND sc.customer_id = p.payer_id;

ALTER TABLE public.ledger_entries ALTER COLUMN shop_customer_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_shop_customer
  ON public.ledger_entries (shop_customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_shop_customer
  ON public.payments (shop_customer_id) WHERE shop_customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Integrity triggers
-- ---------------------------------------------------------------------------

-- Resolve or validate the shop customer on every ledger row. This is the tenancy guard:
-- a row can never point at another shop's customer.
CREATE OR REPLACE FUNCTION public.ledger_resolve_shop_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sc public.shop_customers%ROWTYPE;
BEGIN
  IF NEW.shop_customer_id IS NULL THEN
    IF NEW.customer_id IS NULL THEN
      RAISE EXCEPTION 'LEDGER_CUSTOMER_REQUIRED';
    END IF;
    INSERT INTO public.shop_customers (shop_id, customer_id)
    VALUES (NEW.shop_id, NEW.customer_id)
    ON CONFLICT (shop_id, customer_id) DO NOTHING;
    SELECT id INTO NEW.shop_customer_id
    FROM public.shop_customers
    WHERE shop_id = NEW.shop_id AND customer_id = NEW.customer_id;
  ELSE
    SELECT * INTO v_sc FROM public.shop_customers WHERE id = NEW.shop_customer_id;
    IF v_sc.id IS NULL OR v_sc.shop_id <> NEW.shop_id THEN
      RAISE EXCEPTION 'SHOP_CUSTOMER_MISMATCH';
    END IF;
    IF NEW.customer_id IS NULL THEN
      NEW.customer_id := v_sc.customer_id;
    ELSIF v_sc.customer_id IS DISTINCT FROM NEW.customer_id THEN
      RAISE EXCEPTION 'SHOP_CUSTOMER_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_resolve_shop_customer ON public.ledger_entries;
CREATE TRIGGER trg_ledger_resolve_shop_customer
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_resolve_shop_customer();

CREATE OR REPLACE FUNCTION public.payments_resolve_shop_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sc public.shop_customers%ROWTYPE;
BEGIN
  IF NEW.purpose::text = 'subscription' THEN
    RETURN NEW;
  END IF;
  IF NEW.shop_customer_id IS NULL THEN
    IF NEW.payer_id IS NOT NULL THEN
      INSERT INTO public.shop_customers (shop_id, customer_id)
      VALUES (NEW.shop_id, NEW.payer_id)
      ON CONFLICT (shop_id, customer_id) DO NOTHING;
      SELECT id INTO NEW.shop_customer_id
      FROM public.shop_customers
      WHERE shop_id = NEW.shop_id AND customer_id = NEW.payer_id;
    END IF;
  ELSE
    SELECT * INTO v_sc FROM public.shop_customers WHERE id = NEW.shop_customer_id;
    IF v_sc.id IS NULL OR v_sc.shop_id <> NEW.shop_id THEN
      RAISE EXCEPTION 'SHOP_CUSTOMER_MISMATCH';
    END IF;
    IF NEW.payer_id IS NULL THEN
      NEW.payer_id := v_sc.customer_id;
    ELSIF v_sc.customer_id IS DISTINCT FROM NEW.payer_id THEN
      RAISE EXCEPTION 'SHOP_CUSTOMER_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_resolve_shop_customer ON public.payments;
CREATE TRIGGER trg_payments_resolve_shop_customer
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_resolve_shop_customer();

-- The owner may edit limits and notes, but never move a customer to another shop or
-- re-point a row at a different app account.
CREATE OR REPLACE FUNCTION public.shop_customers_guard_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.shop_id IS DISTINCT FROM OLD.shop_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id)
     AND NOT public.is_admin()
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'SHOP_CUSTOMER_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shop_customers_guard_identity ON public.shop_customers;
CREATE TRIGGER trg_shop_customers_guard_identity
  BEFORE UPDATE ON public.shop_customers
  FOR EACH ROW EXECUTE FUNCTION public.shop_customers_guard_identity();

-- ---------------------------------------------------------------------------
-- 3. Allocation (§17.2): payments without an order settle the oldest charges first
-- ---------------------------------------------------------------------------

-- For each live order charge of a shop customer: how much of it is paid, counting
-- payments made against that order plus unallocated credit applied oldest-first.
-- Manual charges (goods on credit with no order) take their place in the queue too.
CREATE OR REPLACE FUNCTION public.shop_customer_allocation(p_shop_customer_id uuid)
RETURNS TABLE (alloc_order_id uuid, alloc_total_minor bigint, alloc_paid_minor bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool bigint;
  v_due bigint;
  v_take bigint;
  r record;
BEGIN
  SELECT COALESCE(-SUM(le.amount_minor), 0)
  INTO v_pool
  FROM public.ledger_entries le
  WHERE le.shop_customer_id = p_shop_customer_id
    AND le.order_id IS NULL
    AND le.amount_minor < 0;

  FOR r IN
    SELECT d.kind, d.ref_id, d.total, d.direct_paid
    FROM (
      SELECT
        'order'::text AS kind,
        o.id AS ref_id,
        o.total_minor AS total,
        COALESCE((
          SELECT -SUM(p.amount_minor)
          FROM public.ledger_entries p
          WHERE p.order_id = o.id AND p.type = 'payment'
        ), 0) AS direct_paid,
        c.created_at AS at,
        o.id::text AS tiebreak
      FROM public.ledger_entries c
      JOIN public.orders o ON o.id = c.order_id
      WHERE c.shop_customer_id = p_shop_customer_id
        AND c.type = 'charge'
        AND o.status NOT IN ('rejected', 'cancelled')
      UNION ALL
      SELECT 'manual', m.id, m.amount_minor, 0::bigint, m.created_at, m.id::text
      FROM public.ledger_entries m
      WHERE m.shop_customer_id = p_shop_customer_id
        AND m.order_id IS NULL
        AND m.amount_minor > 0
    ) d
    ORDER BY d.at, d.tiebreak
  LOOP
    v_due := GREATEST(r.total - r.direct_paid, 0);
    v_take := LEAST(v_pool, v_due);
    v_pool := v_pool - v_take;
    IF r.kind = 'order' THEN
      alloc_order_id := r.ref_id;
      alloc_total_minor := r.total;
      alloc_paid_minor := r.direct_paid + v_take;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_customer_payment_statuses(p_shop_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_current payment_status;
  v_next payment_status;
BEGIN
  FOR r IN SELECT * FROM public.shop_customer_allocation(p_shop_customer_id) LOOP
    SELECT payment_status INTO v_current FROM public.orders WHERE id = r.alloc_order_id;
    IF r.alloc_total_minor > 0 AND r.alloc_paid_minor >= r.alloc_total_minor THEN
      v_next := 'paid';
    ELSIF r.alloc_paid_minor > 0 THEN
      v_next := 'partially_paid';
    ELSIF v_current = 'on_credit' THEN
      v_next := 'on_credit';
    ELSE
      v_next := 'unpaid';
    END IF;
    IF v_next IS DISTINCT FROM v_current THEN
      UPDATE public.orders
      SET payment_status = v_next, updated_at = now()
      WHERE id = r.alloc_order_id;
    END IF;
  END LOOP;
END;
$$;

-- Same signature as 0004, now following the allocation rule for the whole customer.
CREATE OR REPLACE FUNCTION public.recompute_order_payment_status(p_order_id uuid)
RETURNS payment_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_sc_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RETURN 'unpaid';
  END IF;
  SELECT id INTO v_sc_id
  FROM public.shop_customers
  WHERE shop_id = v_order.shop_id AND customer_id = v_order.customer_id;
  IF v_sc_id IS NOT NULL THEN
    PERFORM public.recompute_customer_payment_statuses(v_sc_id);
  END IF;
  SELECT payment_status INTO v_order.payment_status FROM public.orders WHERE id = p_order_id;
  RETURN v_order.payment_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.order_amount_due(p_order_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_sc_id uuid;
  v_paid bigint;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RETURN 0;
  END IF;
  SELECT id INTO v_sc_id
  FROM public.shop_customers
  WHERE shop_id = v_order.shop_id AND customer_id = v_order.customer_id;
  SELECT a.alloc_paid_minor INTO v_paid
  FROM public.shop_customer_allocation(v_sc_id) a
  WHERE a.alloc_order_id = p_order_id;
  RETURN GREATEST(v_order.total_minor - COALESCE(v_paid, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_customer_balance(p_shop_customer_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount_minor), 0)::bigint
  FROM public.ledger_entries
  WHERE shop_customer_id = p_shop_customer_id AND deleted_at IS NULL;
$$;

-- ---------------------------------------------------------------------------
-- 4. Owner RPCs: walk-ins, limits, manual charges, payments
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_shop_owner(p_shop_id uuid)
RETURNS public.shops
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop public.shops%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id AND deleted_at IS NULL;
  IF v_shop.id IS NULL THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND';
  END IF;
  IF v_shop.owner_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN v_shop;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_market_phone(p_phone text, p_market_code text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market public.markets%ROWTYPE;
  v_phone text;
BEGIN
  v_phone := NULLIF(regexp_replace(COALESCE(p_phone, ''), '[\s().-]', '', 'g'), '');
  IF v_phone IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_market FROM public.markets WHERE code = p_market_code;
  -- Local format (0911…) → international (+251911…), using the market's country code.
  IF v_phone ~ '^0\d+$' AND v_market.phone_country_code IS NOT NULL THEN
    v_phone := v_market.phone_country_code || substr(v_phone, 2);
  END IF;
  IF v_market.phone_regex IS NOT NULL AND v_phone !~ v_market.phone_regex THEN
    RAISE EXCEPTION 'INVALID_PHONE';
  END IF;
  RETURN v_phone;
END;
$$;

-- Add a customer who is not on the app. p_id is client-generated, so a retried
-- outbox call returns the same row.
CREATE OR REPLACE FUNCTION public.add_walk_in_customer(
  p_id uuid,
  p_shop_id uuid,
  p_display_name text,
  p_phone text DEFAULT NULL,
  p_credit_limit_minor bigint DEFAULT NULL
)
RETURNS public.shop_customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop public.shops%ROWTYPE;
  v_existing public.shop_customers%ROWTYPE;
  v_phone text;
  v_row public.shop_customers%ROWTYPE;
BEGIN
  v_shop := public.assert_shop_owner(p_shop_id);

  SELECT * INTO v_existing FROM public.shop_customers WHERE id = p_id;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.shop_id <> p_shop_id THEN
      RAISE EXCEPTION 'SHOP_CUSTOMER_MISMATCH';
    END IF;
    RETURN v_existing;
  END IF;

  IF length(btrim(COALESCE(p_display_name, ''))) = 0 THEN
    RAISE EXCEPTION 'NAME_REQUIRED';
  END IF;
  IF p_credit_limit_minor IS NOT NULL AND p_credit_limit_minor < 0 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_LIMIT';
  END IF;

  v_phone := public.normalize_market_phone(p_phone, v_shop.market_code);

  IF v_phone IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.shop_customers sc
    LEFT JOIN public.profiles pr ON pr.id = sc.customer_id
    WHERE sc.shop_id = p_shop_id
      AND sc.deleted_at IS NULL
      AND (sc.phone = v_phone OR pr.phone = v_phone)
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_PHONE_EXISTS';
  END IF;

  INSERT INTO public.shop_customers (
    id, shop_id, customer_id, display_name, phone, credit_limit_minor, created_by
  ) VALUES (
    p_id, p_shop_id, NULL, btrim(p_display_name), v_phone, p_credit_limit_minor, auth.uid()
  )
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, payload)
  VALUES (auth.uid(), 'add_walk_in_customer', 'shop_customers', v_row.id::text,
          jsonb_build_object('shop_id', p_shop_id, 'display_name', v_row.display_name));

  RETURN v_row;
END;
$$;

-- Partial update: only keys present in p_changes are applied, so a JSON null clears a value.
CREATE OR REPLACE FUNCTION public.update_shop_customer(p_shop_customer_id uuid, p_changes jsonb)
RETURNS public.shop_customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sc public.shop_customers%ROWTYPE;
  v_shop public.shops%ROWTYPE;
  v_limit bigint;
BEGIN
  SELECT * INTO v_sc FROM public.shop_customers WHERE id = p_shop_customer_id AND deleted_at IS NULL;
  IF v_sc.id IS NULL THEN
    RAISE EXCEPTION 'SHOP_CUSTOMER_NOT_FOUND';
  END IF;
  v_shop := public.assert_shop_owner(v_sc.shop_id);

  IF p_changes ? 'display_name' THEN
    IF v_sc.customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'APP_CUSTOMER_NAME_READ_ONLY';
    END IF;
    IF length(btrim(COALESCE(p_changes ->> 'display_name', ''))) = 0 THEN
      RAISE EXCEPTION 'NAME_REQUIRED';
    END IF;
    v_sc.display_name := btrim(p_changes ->> 'display_name');
  END IF;

  IF p_changes ? 'phone' THEN
    IF v_sc.customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'APP_CUSTOMER_PHONE_READ_ONLY';
    END IF;
    v_sc.phone := public.normalize_market_phone(p_changes ->> 'phone', v_shop.market_code);
  END IF;

  IF p_changes ? 'credit_limit_minor' THEN
    v_limit := (p_changes ->> 'credit_limit_minor')::bigint;
    IF v_limit IS NOT NULL AND v_limit < 0 THEN
      RAISE EXCEPTION 'INVALID_CREDIT_LIMIT';
    END IF;
    v_sc.credit_limit_minor := v_limit;
  END IF;

  IF p_changes ? 'promised_pay_at' THEN
    v_sc.promised_pay_at := (p_changes ->> 'promised_pay_at')::date;
  END IF;

  IF p_changes ? 'notes' THEN
    v_sc.notes := NULLIF(btrim(COALESCE(p_changes ->> 'notes', '')), '');
  END IF;

  UPDATE public.shop_customers
  SET display_name = v_sc.display_name,
      phone = v_sc.phone,
      credit_limit_minor = v_sc.credit_limit_minor,
      promised_pay_at = v_sc.promised_pay_at,
      notes = v_sc.notes,
      updated_at = now()
  WHERE id = v_sc.id
  RETURNING * INTO v_sc;

  RETURN v_sc;
END;
$$;

-- "Goods on credit" written into the dubie book without an app order (§17.1).
CREATE OR REPLACE FUNCTION public.record_manual_charge(
  p_idempotency_key text,
  p_shop_customer_id uuid,
  p_amount_minor bigint,
  p_note text DEFAULT NULL
)
RETURNS public.ledger_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.ledger_entries%ROWTYPE;
  v_sc public.shop_customers%ROWTYPE;
  v_shop public.shops%ROWTYPE;
  v_market public.markets%ROWTYPE;
  v_balance bigint;
  v_entry public.ledger_entries%ROWTYPE;
BEGIN
  IF COALESCE(length(p_idempotency_key), 0) < 6 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  SELECT * INTO v_existing FROM public.ledger_entries WHERE idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.shop_customer_id <> p_shop_customer_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN v_existing;
  END IF;

  -- Lock the customer row so concurrent charges cannot both pass the limit check.
  SELECT * INTO v_sc FROM public.shop_customers
  WHERE id = p_shop_customer_id AND deleted_at IS NULL
  FOR UPDATE;
  IF v_sc.id IS NULL THEN
    RAISE EXCEPTION 'SHOP_CUSTOMER_NOT_FOUND';
  END IF;
  v_shop := public.assert_shop_owner(v_sc.shop_id);

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  v_balance := public.shop_customer_balance(v_sc.id);
  IF v_sc.credit_limit_minor IS NOT NULL AND v_balance + p_amount_minor > v_sc.credit_limit_minor THEN
    RAISE EXCEPTION 'CREDIT_LIMIT_EXCEEDED:%', v_sc.credit_limit_minor;
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE code = v_shop.market_code;

  INSERT INTO public.ledger_entries (
    shop_id, shop_customer_id, customer_id, type, amount_minor, currency_code,
    description, created_by, idempotency_key
  ) VALUES (
    v_sc.shop_id, v_sc.id, v_sc.customer_id, 'charge', p_amount_minor, v_market.currency_code,
    COALESCE(NULLIF(btrim(p_note), ''), 'Goods on credit'), auth.uid(), p_idempotency_key
  )
  RETURNING * INTO v_entry;

  UPDATE public.shop_customers SET last_order_at = now(), updated_at = now() WHERE id = v_sc.id;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, payload)
  VALUES (auth.uid(), 'record_manual_charge', 'ledger_entries', v_entry.id::text,
          jsonb_build_object('shop_customer_id', v_sc.id, 'amount_minor', p_amount_minor));

  RETURN v_entry;
END;
$$;

-- A payment recorded by the shop (cash or other) for any shop customer, walk-in or app.
-- Without p_order_id it is a balance payment, allocated oldest-first.
CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_idempotency_key text,
  p_shop_customer_id uuid,
  p_amount_minor bigint,
  p_method text DEFAULT 'cash',
  p_note text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.payments%ROWTYPE;
  v_sc public.shop_customers%ROWTYPE;
  v_shop public.shops%ROWTYPE;
  v_market public.markets%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_balance bigint;
  v_payment public.payments%ROWTYPE;
BEGIN
  IF COALESCE(length(p_idempotency_key), 0) < 6 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  SELECT * INTO v_existing FROM public.payments WHERE idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.shop_customer_id IS DISTINCT FROM p_shop_customer_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN v_existing;
  END IF;

  SELECT * INTO v_sc FROM public.shop_customers
  WHERE id = p_shop_customer_id AND deleted_at IS NULL
  FOR UPDATE;
  IF v_sc.id IS NULL THEN
    RAISE EXCEPTION 'SHOP_CUSTOMER_NOT_FOUND';
  END IF;
  v_shop := public.assert_shop_owner(v_sc.shop_id);

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE code = v_shop.market_code;

  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND shop_id = v_sc.shop_id;
    IF v_order.id IS NULL OR v_order.customer_id IS DISTINCT FROM v_sc.customer_id THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status = 'pending' THEN
      RAISE EXCEPTION 'CANNOT_PAY_PENDING_ORDER';
    END IF;
    IF v_order.currency_code <> v_market.currency_code THEN
      RAISE EXCEPTION 'CURRENCY_MISMATCH';
    END IF;
  END IF;

  v_balance := public.shop_customer_balance(v_sc.id);
  IF p_amount_minor > v_balance AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_OUTSTANDING:%', v_balance;
  END IF;

  INSERT INTO public.payments (
    purpose, order_id, shop_id, shop_customer_id, payer_id, amount_minor, currency_code,
    method_code, provider, provider_ref, status, idempotency_key, recorded_by, paid_at
  ) VALUES (
    (CASE WHEN p_order_id IS NULL THEN 'balance' ELSE 'order' END)::payment_purpose,
    p_order_id, v_sc.shop_id, v_sc.id, v_sc.customer_id, p_amount_minor, v_market.currency_code,
    CASE WHEN p_method IN ('chapa', 'telebirr', 'cbe_birr', 'cash', 'other') THEN p_method ELSE 'cash' END,
    'manual', 'MAN-' || substr(md5(p_idempotency_key), 1, 10), 'succeeded', p_idempotency_key,
    auth.uid(), now()
  )
  RETURNING * INTO v_payment;

  INSERT INTO public.ledger_entries (
    shop_id, shop_customer_id, customer_id, order_id, payment_id, type, amount_minor,
    currency_code, description, created_by
  ) VALUES (
    v_sc.shop_id, v_sc.id, v_sc.customer_id, p_order_id, v_payment.id, 'payment', -p_amount_minor,
    v_market.currency_code, COALESCE(NULLIF(btrim(p_note), ''), 'Cash payment recorded'), auth.uid()
  );

  PERFORM public.recompute_customer_payment_statuses(v_sc.id);

  IF v_sc.promised_pay_at IS NOT NULL AND public.shop_customer_balance(v_sc.id) <= 0 THEN
    UPDATE public.shop_customers SET promised_pay_at = NULL, updated_at = now() WHERE id = v_sc.id;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, payload)
  VALUES (auth.uid(), 'record_customer_payment', 'payments', v_payment.id::text,
          jsonb_build_object('shop_customer_id', v_sc.id, 'order_id', p_order_id,
                             'amount_minor', p_amount_minor, 'method', p_method));

  RETURN v_payment;
END;
$$;

-- Original signature kept for queued outbox operations; now delegates.
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
  v_sc_id uuid;
BEGIN
  PERFORM public.assert_shop_owner(p_shop_id);
  SELECT id INTO v_sc_id
  FROM public.shop_customers
  WHERE shop_id = p_shop_id AND customer_id = p_customer_id;
  IF v_sc_id IS NULL THEN
    RAISE EXCEPTION 'SHOP_CUSTOMER_NOT_FOUND';
  END IF;
  RETURN public.record_customer_payment(
    p_idempotency_key, v_sc_id, p_amount_minor, p_method, p_note, p_order_id
  );
END;
$$;

-- set_order_on_credit: same behaviour, balance now read by shop customer.
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

  SELECT * INTO v_sc FROM public.shop_customers
  WHERE shop_id = v_order.shop_id AND customer_id = v_order.customer_id;

  -- The charge was written on acceptance, so the balance already includes this order.
  v_balance := COALESCE(public.shop_customer_balance(v_sc.id), 0);
  IF v_sc.credit_limit_minor IS NOT NULL AND v_balance > v_sc.credit_limit_minor THEN
    RAISE EXCEPTION 'CREDIT_LIMIT_EXCEEDED:%', v_sc.credit_limit_minor;
  END IF;

  UPDATE public.orders
  SET payment_status = CASE
        WHEN payment_status IN ('paid', 'partially_paid') THEN payment_status
        ELSE 'on_credit'::payment_status
      END,
      updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Online payments: one validated entry point, settlement is server-only
-- ---------------------------------------------------------------------------

-- Creates the pending payment row for an online checkout. The caller must be the
-- order's customer, the shop customer paying their own balance, or the shop owner
-- renewing a subscription. The amount is always computed here, never trusted.
CREATE OR REPLACE FUNCTION public.init_payment(
  p_purpose text,
  p_shop_id uuid,
  p_order_id uuid,
  p_amount_minor bigint,
  p_method_code text,
  p_idempotency_key text,
  p_provider text,
  p_provider_ref text DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_shop public.shops%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_sc public.shop_customers%ROWTYPE;
  v_amount bigint;
  v_currency text;
  v_balance bigint;
  v_payment public.payments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF COALESCE(length(p_idempotency_key), 0) < 6 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;
  IF p_method_code NOT IN ('chapa', 'telebirr', 'cbe_birr', 'demo') THEN
    RAISE EXCEPTION 'METHOD_NOT_ONLINE';
  END IF;
  IF p_provider NOT IN ('chapa', 'telebirr', 'cbe_birr', 'demo') THEN
    RAISE EXCEPTION 'INVALID_PROVIDER';
  END IF;

  SELECT * INTO v_existing FROM public.payments WHERE idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.payer_id IS DISTINCT FROM v_uid AND v_existing.recorded_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN v_existing;
  END IF;

  IF p_purpose = 'order' THEN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL OR v_order.customer_id <> v_uid THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status = 'pending' THEN
      RAISE EXCEPTION 'CANNOT_PAY_PENDING_ORDER';
    END IF;
    IF v_order.status IN ('rejected', 'cancelled') THEN
      RAISE EXCEPTION 'ORDER_CLOSED';
    END IF;
    v_amount := public.order_amount_due(v_order.id);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'ORDER_ALREADY_PAID';
    END IF;
    v_shop.id := v_order.shop_id;
    v_currency := v_order.currency_code;
  ELSIF p_purpose = 'balance' THEN
    SELECT * INTO v_sc FROM public.shop_customers
    WHERE shop_id = p_shop_id AND customer_id = v_uid AND deleted_at IS NULL
    FOR UPDATE;
    IF v_sc.id IS NULL THEN
      RAISE EXCEPTION 'NO_BALANCE';
    END IF;
    v_balance := public.shop_customer_balance(v_sc.id);
    v_amount := COALESCE(p_amount_minor, v_balance);
    IF v_balance <= 0 THEN
      RAISE EXCEPTION 'NO_BALANCE';
    END IF;
    IF v_amount <= 0 OR v_amount > v_balance THEN
      RAISE EXCEPTION 'AMOUNT_EXCEEDS_OUTSTANDING:%', v_balance;
    END IF;
    SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id;
    SELECT m.currency_code INTO v_currency FROM public.markets m WHERE m.code = v_shop.market_code;
  ELSIF p_purpose = 'subscription' THEN
    v_shop := public.assert_shop_owner(p_shop_id);
    SELECT * INTO v_sub FROM public.subscriptions WHERE shop_id = p_shop_id;
    IF v_sub.id IS NULL THEN
      RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND';
    END IF;
    SELECT * INTO v_plan FROM public.plans WHERE id = v_sub.plan_id;
    v_amount := v_plan.price_minor;
    v_currency := v_plan.currency_code;
  ELSE
    RAISE EXCEPTION 'INVALID_PURPOSE';
  END IF;

  INSERT INTO public.payments (
    purpose, order_id, subscription_id, shop_id, shop_customer_id, payer_id, amount_minor,
    currency_code, method_code, provider, provider_ref, status, idempotency_key
  ) VALUES (
    p_purpose::payment_purpose,
    CASE WHEN p_purpose = 'order' THEN v_order.id END,
    v_sub.id,
    COALESCE(v_shop.id, p_shop_id),
    v_sc.id,
    v_uid,
    v_amount,
    v_currency,
    p_method_code,
    p_provider,
    p_provider_ref,
    'pending',
    p_idempotency_key
  )
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;

-- Settlement. Only the webhook / demo-confirm server paths call this (service role).
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
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_base_end timestamptz;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  IF v_payment.status = 'succeeded' THEN
    RETURN v_payment;
  END IF;

  IF p_status = 'failed' THEN
    UPDATE public.payments
    SET status = 'failed', provider_ref = COALESCE(p_provider_ref, provider_ref), updated_at = now()
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

  IF v_payment.purpose::text IN ('order', 'balance') THEN
    INSERT INTO public.ledger_entries (
      shop_id, shop_customer_id, customer_id, order_id, payment_id, type, amount_minor,
      currency_code, description, created_by
    ) VALUES (
      v_payment.shop_id,
      v_payment.shop_customer_id,
      v_payment.payer_id,
      v_payment.order_id,
      v_payment.id,
      'payment',
      -v_payment.amount_minor,
      v_payment.currency_code,
      'Online payment (' || v_payment.method_code || ') ref ' || COALESCE(v_payment.provider_ref, ''),
      v_payment.payer_id
    );
    IF v_payment.shop_customer_id IS NOT NULL THEN
      PERFORM public.recompute_customer_payment_statuses(v_payment.shop_customer_id);
    ELSIF v_payment.order_id IS NOT NULL THEN
      PERFORM public.recompute_order_payment_status(v_payment.order_id);
    END IF;
  ELSIF v_payment.purpose::text = 'subscription' AND v_payment.subscription_id IS NOT NULL THEN
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

-- ---------------------------------------------------------------------------
-- 6. Views respect RLS; balances by shop customer
-- ---------------------------------------------------------------------------

-- v_customer_balances (0005) groups by customer_id, which would merge every walk-in of a
-- shop into one row. Leave its shape alone (0005 re-runs on reset and must not conflict)
-- and add a view keyed by shop customer.
CREATE OR REPLACE VIEW public.v_shop_customer_balances AS
SELECT
  le.shop_id,
  le.shop_customer_id,
  le.currency_code,
  COALESCE(SUM(le.amount_minor), 0)::bigint AS balance_minor,
  MAX(le.created_at) AS last_activity
FROM public.ledger_entries le
WHERE le.deleted_at IS NULL
GROUP BY le.shop_id, le.shop_customer_id, le.currency_code;

GRANT SELECT ON public.v_shop_customer_balances TO authenticated, service_role;
ALTER VIEW public.v_shop_customer_balances SET (security_invoker = true);
ALTER VIEW public.v_customer_balances SET (security_invoker = true);
ALTER VIEW public.v_shop_sales_daily SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 7. Privileges
-- ---------------------------------------------------------------------------

-- Functions are executable by PUBLIC by default; internal helpers must not be.
REVOKE ALL ON FUNCTION public.complete_online_payment(uuid, text, payment_tx_status) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.recompute_order_payment_status(uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.recompute_customer_payment_statuses(uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.shop_customer_allocation(uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.order_amount_due(uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.shop_customer_balance(uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.assert_shop_owner(uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.normalize_market_phone(text, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.complete_online_payment(uuid, text, payment_tx_status) TO service_role;

REVOKE ALL ON FUNCTION public.add_walk_in_customer(uuid, uuid, text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_shop_customer(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_manual_charge(text, uuid, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_customer_payment(text, uuid, bigint, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.init_payment(text, uuid, uuid, bigint, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_walk_in_customer(uuid, uuid, text, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_shop_customer(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_manual_charge(text, uuid, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(text, uuid, bigint, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.init_payment(text, uuid, uuid, bigint, text, text, text, text) TO authenticated, service_role;
