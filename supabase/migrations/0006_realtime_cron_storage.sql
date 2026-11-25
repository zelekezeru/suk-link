-- 0006_realtime_cron_storage.sql
-- Section 5 & Section 6: Realtime publications, Storage buckets & policies, and pg_cron reminders

-- 1. Storage schema and buckets (if running outside full Supabase storage container, create compatible tables)
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, name)
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
GRANT ALL ON storage.objects TO authenticated, service_role;
GRANT SELECT ON storage.objects TO anon;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', true, 2097152, ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/svg+xml']),
  ('shop-images', 'shop-images', true, 2097152, ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/svg+xml']),
  ('avatars', 'avatars', true, 2097152, ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS policies:
-- public read on product-images, shop-images, avatars
DROP POLICY IF EXISTS storage_public_read ON storage.objects;
CREATE POLICY storage_public_read ON storage.objects
  FOR SELECT USING (bucket_id IN ('product-images', 'shop-images', 'avatars'));

-- product-images & shop-images: write only under {shop_id}/... by that shop's owner
DROP POLICY IF EXISTS storage_shop_write ON storage.objects;
CREATE POLICY storage_shop_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('product-images', 'shop-images')
    AND EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS storage_shop_update ON storage.objects;
CREATE POLICY storage_shop_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('product-images', 'shop-images')
    AND EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.owner_id = auth.uid()
    )
  );

-- avatars: each user writes only {user_id}/...
DROP POLICY IF EXISTS storage_avatar_write ON storage.objects;
CREATE POLICY storage_avatar_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- 2. Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders', 'order_events', 'products', 'payments', 'notifications', 'subscriptions'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- 3. Automated Reminders function (called by pg_cron hourly & reminders-run Edge Function & on app open)
CREATE OR REPLACE FUNCTION public.run_scheduled_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reminder_days int[];
  v_credit_age_days int;
  v_sub record;
  v_bal record;
  v_days_left int;
  v_sub_notifications int := 0;
  v_credit_notifications int := 0;
BEGIN
  -- Read configurable reminder thresholds from app_settings
  SELECT COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(value)::int),
    ARRAY[30, 7, 1]
  )
  INTO v_reminder_days
  FROM public.app_settings
  WHERE key = 'subscription_reminder_days';

  IF v_reminder_days IS NULL THEN
    v_reminder_days := ARRAY[30, 7, 1];
  END IF;

  SELECT COALESCE((value #>> '{}')::int, 7)
  INTO v_credit_age_days
  FROM public.app_settings
  WHERE key = 'credit_reminder_after_days';

  IF v_credit_age_days IS NULL THEN
    v_credit_age_days := 7;
  END IF;

  -- Transition expired subscriptions into grace or expired
  FOR v_sub IN
    SELECT s.*, sh.owner_id, sh.name AS shop_name, p.grace_days
    FROM public.subscriptions s
    JOIN public.shops sh ON sh.id = s.shop_id
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.status IN ('trial', 'active', 'grace')
  LOOP
    v_days_left := ceil(extract(epoch FROM (v_sub.current_period_end - now())) / 86400.0)::int;

    IF v_days_left < 0 AND abs(v_days_left) <= v_sub.grace_days AND v_sub.status <> 'grace' THEN
      UPDATE public.subscriptions SET status = 'grace', updated_at = now() WHERE id = v_sub.id;
    ELSIF v_days_left < -v_sub.grace_days AND v_sub.status <> 'expired' THEN
      UPDATE public.subscriptions SET status = 'expired', updated_at = now() WHERE id = v_sub.id;
    END IF;

    IF v_days_left = ANY(v_reminder_days) OR (v_days_left <= 5 AND v_days_left >= 0) OR v_days_left < 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_sub.owner_id
          AND n.type = 'subscription_reminder'
          AND n.created_at > now() - interval '20 hours'
      ) THEN
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
          v_sub.owner_id,
          'subscription_reminder',
          CASE
            WHEN v_days_left < 0 THEN 'Subscription Expired — ' || v_sub.shop_name
            ELSE 'Subscription Expires in ' || v_days_left || ' Days'
          END,
          CASE
            WHEN v_days_left < 0 THEN 'Your subscription for ' || v_sub.shop_name || ' has expired. Renew now to keep receiving orders.'
            ELSE 'Your subscription for ' || v_sub.shop_name || ' expires in ' || v_days_left || ' days.'
          END,
          jsonb_build_object('shop_id', v_sub.shop_id, 'days_left', v_days_left, 'status', v_sub.status)
        );
        v_sub_notifications := v_sub_notifications + 1;
      END IF;
    END IF;
  END LOOP;

  -- Customer credit reminders for balances older than v_credit_age_days
  FOR v_bal IN
    SELECT
      vb.shop_id,
      vb.customer_id,
      vb.balance_minor,
      vb.currency_code,
      sh.name AS shop_name,
      m.currency_symbol,
      m.minor_unit_digits
    FROM public.v_customer_balances vb
    JOIN public.shops sh ON sh.id = vb.shop_id
    JOIN public.markets m ON m.code = sh.market_code
    WHERE vb.balance_minor > 0
      AND EXISTS (
        SELECT 1 FROM public.ledger_entries le
        WHERE le.shop_id = vb.shop_id
          AND le.customer_id = vb.customer_id
          AND le.type = 'charge'
          AND le.created_at <= now() - make_interval(days => v_credit_age_days)
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_bal.customer_id
        AND n.type = 'credit_reminder'
        AND (n.data ->> 'shop_id') = v_bal.shop_id::text
        AND n.created_at > now() - interval '20 hours'
    ) THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_bal.customer_id,
        'credit_reminder',
        'Balance Reminder — ' || v_bal.shop_name,
        'You have an outstanding credit balance at ' || v_bal.shop_name || '.',
        jsonb_build_object(
          'shop_id', v_bal.shop_id,
          'shop_name', v_bal.shop_name,
          'balance_minor', v_bal.balance_minor,
          'currency_code', v_bal.currency_code
        )
      );
      v_credit_notifications := v_credit_notifications + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'subscription_reminders_sent', v_sub_notifications,
    'credit_reminders_sent', v_credit_notifications
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_scheduled_reminders() TO authenticated, service_role;

