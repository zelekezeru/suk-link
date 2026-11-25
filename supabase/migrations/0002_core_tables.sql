-- 0002_core_tables.sql
-- Section 5 & Section 5.1: Configuration tables and Core domain tables
-- All money columns are bigint in minor units (santim for ETB). Never float.

-- Ensure minimal auth schema exists when running outside full Supabase Auth container
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  phone text UNIQUE,
  encrypted_password text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claim.sub', true),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

-- 5.1 Configuration tables

CREATE TABLE IF NOT EXISTS public.markets (
  code text PRIMARY KEY CHECK (char_length(code) = 2),
  name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  currency_code text NOT NULL CHECK (char_length(currency_code) = 3),
  currency_symbol text NOT NULL,
  minor_unit_digits int NOT NULL DEFAULT 2 CHECK (minor_unit_digits BETWEEN 0 AND 4),
  phone_country_code text NOT NULL,
  phone_regex text NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Addis_Ababa',
  default_locale text NOT NULL DEFAULT 'en',
  enabled_locales text[] NOT NULL DEFAULT ARRAY['en', 'am', 'om', 'so', 'ti', 'sw'],
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_markets_single_default
  ON public.markets (is_default)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code text NOT NULL REFERENCES public.markets(code) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN ('chapa', 'telebirr', 'cbe_birr', 'cash', 'credit', 'demo')),
  type payment_method_type NOT NULL,
  routing payment_routing_type NOT NULL,
  name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  icon text NOT NULL DEFAULT 'CreditCard',
  sort_order int NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_code, code)
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Core tables

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'customer',
  full_name text NOT NULL,
  phone text UNIQUE,
  email text UNIQUE,
  avatar_url text,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'am', 'om', 'so', 'ti', 'sw')),
  market_code text NOT NULL DEFAULT 'ET' REFERENCES public.markets(code),
  default_address text,
  is_disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  market_code text NOT NULL DEFAULT 'ET' REFERENCES public.markets(code),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'grocery',
  description text,
  phone text NOT NULL,
  address_text text NOT NULL,
  lat double precision,
  lng double precision,
  logo_url text,
  cover_url text,
  opening_time text NOT NULL DEFAULT '07:00',
  closing_time text NOT NULL DEFAULT '21:00',
  is_open boolean NOT NULL DEFAULT true,
  accepts_credit boolean NOT NULL DEFAULT true,
  offers_delivery boolean NOT NULL DEFAULT true,
  offers_pickup boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  method_code text NOT NULL CHECK (method_code IN ('chapa', 'telebirr', 'cbe_birr', 'cash', 'credit', 'demo')),
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, method_code)
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  unit text NOT NULL DEFAULT 'piece',
  category text NOT NULL DEFAULT 'General',
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code text NOT NULL REFERENCES public.markets(code) ON DELETE CASCADE,
  code text NOT NULL,
  name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency_code text NOT NULL,
  duration_days int NOT NULL DEFAULT 365 CHECK (duration_days > 0),
  trial_days int NOT NULL DEFAULT 30 CHECK (trial_days >= 0),
  grace_days int NOT NULL DEFAULT 7 CHECK (grace_days >= 0),
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_code, code)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL UNIQUE REFERENCES public.shops(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status subscription_status NOT NULL DEFAULT 'trial',
  last_paid_minor bigint NOT NULL DEFAULT 0,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  suspended_reason text,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY,
  order_number text NOT NULL,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status order_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  fulfilment fulfilment_type NOT NULL DEFAULT 'pickup',
  currency_code text NOT NULL DEFAULT 'ETB',
  preferred_payment_method text,
  delivery_address text,
  note text,
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  delivery_fee_minor bigint NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  rejection_reason text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  client_created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name_snapshot text NOT NULL,
  unit_snapshot text NOT NULL,
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0),
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status order_status NULL,
  to_status order_status NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose payment_purpose NOT NULL DEFAULT 'order',
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  subscription_id uuid NULL REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES public.profiles(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency_code text NOT NULL DEFAULT 'ETB',
  method_code text NOT NULL CHECK (method_code IN ('chapa', 'telebirr', 'cbe_birr', 'cash', 'credit', 'demo', 'other')),
  provider text NOT NULL CHECK (provider IN ('chapa', 'telebirr', 'cbe_birr', 'demo', 'manual')),
  provider_ref text,
  status payment_tx_status NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL UNIQUE,
  recorded_by uuid NULL REFERENCES public.profiles(id),
  paid_at timestamptz,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ref
  ON public.payments (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.shop_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credit_limit_minor bigint NULL CHECK (credit_limit_minor IS NULL OR credit_limit_minor >= 0),
  notes text,
  first_order_at timestamptz NOT NULL DEFAULT now(),
  last_order_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  payment_id uuid NULL REFERENCES public.payments(id) ON DELETE SET NULL,
  type ledger_entry_type NOT NULL,
  amount_minor bigint NOT NULL,
  currency_code text NOT NULL DEFAULT 'ETB',
  description text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  status support_ticket_status NOT NULL DEFAULT 'open',
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Attach updated_at triggers
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'markets', 'payment_methods', 'app_settings', 'profiles', 'shops',
    'shop_payment_methods', 'products', 'plans', 'subscriptions', 'orders',
    'order_items', 'order_events', 'payments', 'shop_customers',
    'ledger_entries', 'notifications', 'support_tickets'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t, t);
  END LOOP;
END $$;

-- Auth -> Profiles sync trigger + Role protection trigger
CREATE OR REPLACE FUNCTION public.validate_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_role text;
  v_app_role text;
BEGIN
  v_app_role := NEW.raw_app_meta_data ->> 'role';
  v_requested_role := COALESCE(v_app_role, NEW.raw_user_meta_data ->> 'role', 'customer');

  -- Client self-signup cannot request 'admin' unless raw_app_meta_data already has 'admin'
  IF v_requested_role = 'admin' AND COALESCE(v_app_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN_ROLE_ASSIGNMENT';
  END IF;

  IF v_requested_role NOT IN ('customer', 'shop_owner', 'admin') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;

  -- Mirror role into raw_app_meta_data
  NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_requested_role);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final_role user_role;
  v_market text;
BEGIN
  v_final_role := COALESCE(NEW.raw_app_meta_data ->> 'role', 'customer')::user_role;
  v_market := COALESCE(NEW.raw_user_meta_data ->> 'market_code', 'ET');

  INSERT INTO public.profiles (id, role, full_name, phone, email, locale, market_code)
  VALUES (
    NEW.id,
    v_final_role,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(COALESCE(NEW.email, 'User'), '@', 1)),
    NULLIF(NEW.phone, ''),
    NULLIF(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'locale', 'en'),
    v_market
  )
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      email = COALESCE(EXCLUDED.email, public.profiles.email),
      phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_before_auth_user_created ON auth.users;
CREATE TRIGGER trg_before_auth_user_created
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_new_auth_user();

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Prevent non-admin users from altering their profile role
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' THEN
      RAISE EXCEPTION 'CANNOT_CHANGE_ROLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_role_guard ON public.profiles;
CREATE TRIGGER trg_profiles_role_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- Auto-create 30-day free trial subscription and default shop payment methods when a shop is created
CREATE OR REPLACE FUNCTION public.handle_new_shop()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan
  FROM public.plans
  WHERE market_code = NEW.market_code
    AND is_active = true
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1;

  IF v_plan.id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      shop_id,
      plan_id,
      status,
      last_paid_minor,
      current_period_start,
      current_period_end
    ) VALUES (
      NEW.id,
      v_plan.id,
      'trial',
      0,
      now(),
      now() + make_interval(days => v_plan.trial_days)
    )
    ON CONFLICT (shop_id) DO NOTHING;
  END IF;

  INSERT INTO public.shop_payment_methods (shop_id, method_code, is_enabled)
  SELECT NEW.id, pm.code, true
  FROM public.payment_methods pm
  WHERE pm.market_code = NEW.market_code
    AND pm.is_enabled = true
    AND (pm.code <> 'credit' OR NEW.accepts_credit = true)
  ON CONFLICT (shop_id, method_code) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_shop_created ON public.shops;
CREATE TRIGGER trg_on_shop_created
  AFTER INSERT ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_shop();

-- Enforce shop_payment_methods can only enable methods that the shop's market has enabled
CREATE OR REPLACE FUNCTION public.check_shop_payment_method_market()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market_code text;
  v_market_method_enabled boolean;
BEGIN
  SELECT market_code INTO v_market_code FROM public.shops WHERE id = NEW.shop_id;
  SELECT is_enabled INTO v_market_method_enabled
  FROM public.payment_methods
  WHERE market_code = v_market_code AND code = NEW.method_code;

  IF NEW.is_enabled = true AND COALESCE(v_market_method_enabled, false) = false THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_NOT_ENABLED_IN_MARKET';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_shop_payment_method ON public.shop_payment_methods;
CREATE TRIGGER trg_check_shop_payment_method
  BEFORE INSERT OR UPDATE ON public.shop_payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.check_shop_payment_method_market();

