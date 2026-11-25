-- supabase/seed.sql
-- Section 12: Configuration seed data (Markets ET & KE, Payment Methods, Plans, App Settings)

-- 1. Markets
INSERT INTO public.markets (
  code, name_i18n, currency_code, currency_symbol, minor_unit_digits,
  phone_country_code, phone_regex, timezone, default_locale, enabled_locales,
  is_active, is_default
) VALUES (
  'ET',
  '{"en":"Ethiopia","am":"ኢትዮጵያ","om":"Itoophiyaa","so":"Itoobiya","ti":"ኢትዮጵያ","sw":"Ethiopia"}'::jsonb,
  'ETB',
  'Br',
  2,
  '+251',
  '^\+251[79]\d{8}$',
  'Africa/Addis_Ababa',
  'en',
  ARRAY['en', 'am', 'om', 'so', 'ti', 'sw'],
  true,
  true
), (
  'KE',
  '{"en":"Kenya","am":"ኬንያ","om":"Keeniyaa","so":"Kiiniya","ti":"ኬንያ","sw":"Kenya"}'::jsonb,
  'KES',
  'KSh',
  2,
  '+254',
  '^\+254[17]\d{8}$',
  'Africa/Nairobi',
  'en',
  ARRAY['en', 'sw'],
  false,
  false
)
ON CONFLICT (code) DO UPDATE
SET name_i18n = EXCLUDED.name_i18n,
    currency_code = EXCLUDED.currency_code,
    currency_symbol = EXCLUDED.currency_symbol,
    minor_unit_digits = EXCLUDED.minor_unit_digits,
    phone_country_code = EXCLUDED.phone_country_code,
    phone_regex = EXCLUDED.phone_regex,
    timezone = EXCLUDED.timezone,
    default_locale = EXCLUDED.default_locale,
    enabled_locales = EXCLUDED.enabled_locales,
    is_active = EXCLUDED.is_active,
    is_default = EXCLUDED.is_default;

-- 2. Payment Methods for ET and KE
INSERT INTO public.payment_methods (
  market_code, code, type, routing, name_i18n, icon, sort_order, is_enabled, config
) VALUES
  (
    'ET', 'chapa', 'online', 'via_chapa',
    '{"en":"Chapa","am":"ቻፓ (Chapa)","om":"Chapa","so":"Chapa","ti":"ቻፓ (Chapa)","sw":"Chapa"}'::jsonb,
    'CreditCard', 1, true, '{}'::jsonb
  ),
  (
    'ET', 'telebirr', 'online', 'via_chapa',
    '{"en":"telebirr","am":"ቴሌብር (telebirr)","om":"telebirr","so":"telebirr","ti":"ቴሌብር (telebirr)","sw":"telebirr"}'::jsonb,
    'Smartphone', 2, true, '{"preselect":"telebirr"}'::jsonb
  ),
  (
    'ET', 'cbe_birr', 'online', 'via_chapa',
    '{"en":"CBE Birr","am":"ሲቢኢ ብር (CBE Birr)","om":"CBE Birr","so":"CBE Birr","ti":"ሲቢኢ ብር (CBE Birr)","sw":"CBE Birr"}'::jsonb,
    'Building2', 3, true, '{"preselect":"cbebirr"}'::jsonb
  ),
  (
    'ET', 'cash', 'offline', 'manual',
    '{"en":"Cash","am":"በጥሬ ገንዘብ","om":"Callaa (Cash)","so":"Caddaan (Cash)","ti":"ብጥረ ገንዘብ","sw":"Pesa Taslimu"}'::jsonb,
    'Banknote', 4, true, '{}'::jsonb
  ),
  (
    'ET', 'credit', 'credit', 'none',
    '{"en":"Pay later (credit)","am":"በዱቤ (በኋላ ክፈል)","om":"Booda kaffali (Liqii)","so":"Dib u bixi (Deyn)","ti":"ብልቃሕ (ድሕሪት ክፈል)","sw":"Lipa baadaye (Mkopo)"}'::jsonb,
    'BookOpen', 5, true, '{}'::jsonb
  ),
  (
    'KE', 'chapa', 'online', 'via_chapa',
    '{"en":"Chapa Checkout","sw":"Malipo ya Chapa"}'::jsonb,
    'CreditCard', 1, true, '{}'::jsonb
  ),
  (
    'KE', 'cash', 'offline', 'manual',
    '{"en":"Cash","sw":"Pesa Taslimu"}'::jsonb,
    'Banknote', 2, true, '{}'::jsonb
  ),
  (
    'KE', 'credit', 'credit', 'none',
    '{"en":"Pay later (credit)","sw":"Lipa baadaye (Mkopo)"}'::jsonb,
    'BookOpen', 3, true, '{}'::jsonb
  )
ON CONFLICT (market_code, code) DO UPDATE
SET type = EXCLUDED.type,
    routing = EXCLUDED.routing,
    name_i18n = EXCLUDED.name_i18n,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    is_enabled = EXCLUDED.is_enabled,
    config = EXCLUDED.config;

-- 3. Plans per market (Annual plan in ETB Br 2,400 = 240000 minor units, 365 days, trial 30, grace 7)
INSERT INTO public.plans (
  id, market_code, code, name_i18n, price_minor, currency_code,
  duration_days, trial_days, grace_days, is_active, is_default
) VALUES
  (
    '00000000-0000-0000-0000-000000000101',
    'ET',
    'annual',
    '{"en":"Annual Shop Plan","am":"ዓመታዊ የሱቅ እቅድ","om":"Karoora Suuqii Waggaa","so":"Qorshaha Dukaanka ee Sanadlaha","ti":"ዓመታዊ መደብ ዱካን","sw":"Mpango wa Duka wa Mwaka"}'::jsonb,
    240000,
    'ETB',
    365,
    30,
    7,
    true,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    'KE',
    'annual',
    '{"en":"Annual Shop Plan (Kenya)","sw":"Mpango wa Duka wa Mwaka"}'::jsonb,
    450000,
    'KES',
    365,
    30,
    7,
    true,
    true
  )
ON CONFLICT (market_code, code) DO UPDATE
SET name_i18n = EXCLUDED.name_i18n,
    price_minor = EXCLUDED.price_minor,
    currency_code = EXCLUDED.currency_code,
    duration_days = EXCLUDED.duration_days,
    trial_days = EXCLUDED.trial_days,
    grace_days = EXCLUDED.grace_days,
    is_active = EXCLUDED.is_active,
    is_default = EXCLUDED.is_default;

-- 4. App Settings
INSERT INTO public.app_settings (key, value)
VALUES
  ('subscription_reminder_days', '[30, 7, 1]'::jsonb),
  ('credit_reminder_after_days', '7'::jsonb),
  ('support_phone', '"+251911223344"'::jsonb),
  ('support_telegram', '"https://t.me/suklink_support"'::jsonb),
  ('support_whatsapp', '"https://wa.me/251911223344"'::jsonb),
  ('default_market', '"ET"'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;

