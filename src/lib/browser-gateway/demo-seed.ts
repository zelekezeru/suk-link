import type { PGliteInterface } from '@electric-sql/pglite';

export const DEMO_USERS = {
  customer1: {
    id: '11111111-1111-4111-8111-111111111101',
    email: 'customer@demo.suklink.et',
    phone: '+251911100101',
    full_name: 'Selam Tesfaye',
    role: 'customer',
    market_code: 'ET',
    default_address: 'Bole Medhanialem, House 108, Addis Ababa',
  },
  customer2: {
    id: '11111111-1111-4111-8111-111111111102',
    email: 'customer2@demo.suklink.et',
    phone: '+251911100102',
    full_name: 'Dawit Bekele',
    role: 'customer',
    market_code: 'ET',
    default_address: 'Bole Atlas, Apt 4B, Addis Ababa',
  },
  shop1: {
    id: '22222222-2222-4222-8222-222222222201',
    email: 'shop@demo.suklink.et',
    phone: '+251911200201',
    full_name: 'Abebe Kebede',
    role: 'shop_owner',
    market_code: 'ET',
    default_address: 'Bole Medhanialem, House 142, Addis Ababa',
  },
  shop2: {
    id: '22222222-2222-4222-8222-222222222202',
    email: 'shop2@demo.suklink.et',
    phone: '+251911200202',
    full_name: 'Tsehay Tadesse',
    role: 'shop_owner',
    market_code: 'ET',
    default_address: 'Kazanchis, Near Total, Addis Ababa',
  },
  admin: {
    id: '99999999-9999-4999-8999-999999999901',
    email: 'admin@demo.suklink.et',
    phone: '+251911900901',
    full_name: 'Kaleb Admin',
    role: 'admin',
    market_code: 'ET',
    default_address: 'Addis Ababa HQ',
  },
} as const;

export const DEMO_SHOPS = {
  abebe: {
    id: '33333333-3333-4333-8333-333333333301',
    owner_id: DEMO_USERS.shop1.id,
    market_code: 'ET',
    name: 'Abebe Mini Market',
    slug: 'abebe-mini-market',
    category: 'grocery',
    description: 'Fresh neighborhood groceries, injera, coffee, and household staples in Bole.',
    phone: '+251911200201',
    address_text: 'Bole Medhanialem, House 142, Addis Ababa',
    lat: 8.9976,
    lng: 38.7868,
    logo_url: '/seed-images/shop-abebe-logo.svg',
    cover_url: '/seed-images/shop-abebe-cover.svg',
    opening_time: '06:30',
    closing_time: '21:30',
    is_open: true,
    accepts_credit: true,
    offers_delivery: true,
    offers_pickup: true,
  },
  tsehay: {
    id: '33333333-3333-4333-8333-333333333302',
    owner_id: DEMO_USERS.shop2.id,
    market_code: 'ET',
    name: 'Tsehay Bakery',
    slug: 'tsehay-bakery',
    category: 'bakery',
    description: 'Warm daily dabo, croissants, ambasha, and sweet pastries.',
    phone: '+251911200202',
    address_text: 'Kazanchis, Near Total, Addis Ababa',
    lat: 9.0155,
    lng: 38.7681,
    logo_url: '/seed-images/shop-tsehay-logo.svg',
    cover_url: '/seed-images/shop-tsehay-cover.svg',
    opening_time: '06:00',
    closing_time: '20:00',
    is_open: true,
    accepts_credit: false,
    offers_delivery: false,
    offers_pickup: true,
  },
} as const;

export const ABEBE_PRODUCTS = [
  {
    id: '44444444-4444-4444-8444-444444444401',
    name: 'Teff Injera (5 pcs)',
    description: 'Fresh 100% magna teff injera pack of 5',
    price_minor: 7500,
    unit: 'pack',
    category: 'Bakery & Staples',
    image_url: '/seed-images/teff-injera.svg',
    is_available: true,
    sort_order: 1,
  },
  {
    id: '44444444-4444-4444-8444-444444444402',
    name: 'Buna / Coffee beans 500g',
    description: 'Washed Yirgacheffe green coffee beans 500g',
    price_minor: 32000,
    unit: 'pack',
    category: 'Beverages',
    image_url: '/seed-images/coffee-beans.svg',
    is_available: true,
    sort_order: 2,
  },
  {
    id: '44444444-4444-4444-8444-444444444403',
    name: 'Sugar 1kg',
    description: 'Fine white crystalline sugar 1kg bag',
    price_minor: 14000,
    unit: 'kg',
    category: 'Pantry',
    image_url: '/seed-images/sugar.svg',
    is_available: true,
    sort_order: 3,
  },
  {
    id: '44444444-4444-4444-8444-444444444404',
    name: 'Cooking oil 3L',
    description: 'Pure sunflower vegetable cooking oil 3 litres',
    price_minor: 69000,
    unit: 'litre',
    category: 'Pantry',
    image_url: '/seed-images/cooking-oil.svg',
    is_available: true,
    sort_order: 4,
  },
  {
    id: '44444444-4444-4444-8444-444444444405',
    name: 'Pasta 500g',
    description: 'Durum wheat spaghetti pasta 500g',
    price_minor: 8500,
    unit: 'pack',
    category: 'Pantry',
    image_url: '/seed-images/pasta.svg',
    is_available: true,
    sort_order: 5,
  },
  {
    id: '44444444-4444-4444-8444-444444444406',
    name: 'Lentils (misir) 1kg',
    description: 'Cleaned red split lentils (misir) 1kg',
    price_minor: 18000,
    unit: 'kg',
    category: 'Bakery & Staples',
    image_url: '/seed-images/lentils.svg',
    is_available: true,
    sort_order: 6,
  },
  {
    id: '44444444-4444-4444-8444-444444444407',
    name: 'Berbere 250g',
    description: 'Traditional spiced Ethiopian berbere blend 250g',
    price_minor: 15000,
    unit: 'pack',
    category: 'Spices',
    image_url: '/seed-images/berbere.svg',
    is_available: true,
    sort_order: 7,
  },
  {
    id: '44444444-4444-4444-8444-444444444408',
    name: 'Eggs (12)',
    description: 'Farm fresh tray of 12 large eggs',
    price_minor: 21000,
    unit: 'pack',
    category: 'Dairy & Eggs',
    image_url: '/seed-images/eggs.svg',
    is_available: true,
    sort_order: 8,
  },
  {
    id: '44444444-4444-4444-8444-444444444409',
    name: 'Fresh milk 1L',
    description: 'Pasteurized whole cow milk 1 litre',
    price_minor: 9000,
    unit: 'litre',
    category: 'Dairy & Eggs',
    image_url: '/seed-images/fresh-milk.svg',
    is_available: true,
    sort_order: 9,
  },
  {
    id: '44444444-4444-4444-8444-444444444410',
    name: 'Bread loaf',
    description: 'Freshly baked soft wheat bread loaf',
    price_minor: 4500,
    unit: 'piece',
    category: 'Bakery & Staples',
    image_url: '/seed-images/bread-loaf.svg',
    is_available: true,
    sort_order: 10,
  },
  {
    id: '44444444-4444-4444-8444-444444444411',
    name: 'Bottled water 2L',
    description: 'Natural highland spring water 2L bottle',
    price_minor: 4000,
    unit: 'piece',
    category: 'Beverages',
    image_url: '/seed-images/bottled-water.svg',
    is_available: true,
    sort_order: 11,
  },
  {
    id: '44444444-4444-4444-8444-444444444412',
    name: 'Laundry soap',
    description: 'Multi-purpose household laundry soap bar (Out of stock)',
    price_minor: 6000,
    unit: 'piece',
    category: 'Household',
    image_url: '/seed-images/laundry-soap.svg',
    is_available: false,
    sort_order: 12,
  },
] as const;

export const TSEHAY_PRODUCTS = [
  {
    id: '44444444-4444-4444-8444-444444444501',
    name: 'Special Dabo Loaf',
    description: 'Traditional honey-glazed Ethiopian dabo baked fresh each morning',
    price_minor: 12000,
    unit: 'piece',
    category: 'Bakery',
    image_url: '/seed-images/bread-loaf.svg',
    is_available: true,
    sort_order: 1,
  },
  {
    id: '44444444-4444-4444-8444-444444444502',
    name: 'Butter Croissant (4 pcs)',
    description: 'Flaky fresh golden butter croissants',
    price_minor: 16000,
    unit: 'pack',
    category: 'Pastries',
    image_url: '/seed-images/bread-loaf.svg',
    is_available: true,
    sort_order: 2,
  },
  {
    id: '44444444-4444-4444-8444-444444444503',
    name: 'Spiced Ambasha',
    description: 'Aromatic cardamom wheel flatbread baked daily',
    price_minor: 9500,
    unit: 'piece',
    category: 'Bakery',
    image_url: '/seed-images/teff-injera.svg',
    is_available: true,
    sort_order: 3,
  },
  {
    id: '44444444-4444-4444-8444-444444444504',
    name: 'Roasted Buna Pack 250g',
    description: 'Medium-roast bakery blend coffee for morning dabo',
    price_minor: 19000,
    unit: 'pack',
    category: 'Beverages',
    image_url: '/seed-images/coffee-beans.svg',
    is_available: true,
    sort_order: 4,
  },
] as const;

export async function seedBrowserDemoDatabase(db: PGliteInterface): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Seed users (all password: Demo@2026)
    for (const u of Object.values(DEMO_USERS)) {
      await tx.query(
        `INSERT INTO auth.users (id, email, phone, encrypted_password, raw_user_meta_data, raw_app_meta_data)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
         ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email,
             phone = EXCLUDED.phone,
             raw_user_meta_data = EXCLUDED.raw_user_meta_data,
             raw_app_meta_data = EXCLUDED.raw_app_meta_data;`,
        [
          u.id,
          u.email,
          u.phone,
          'Demo@2026',
          JSON.stringify({ full_name: u.full_name, role: u.role, market_code: u.market_code }),
          JSON.stringify({ role: u.role }),
        ]
      );
      await tx.query(
        `UPDATE public.profiles SET default_address = $1 WHERE id = $2;`,
        [u.default_address, u.id]
      );
    }

    // 2. Seed shops
    for (const s of Object.values(DEMO_SHOPS)) {
      await tx.query(
        `INSERT INTO public.shops (
          id, owner_id, market_code, name, slug, category, description, phone, address_text,
          lat, lng, logo_url, cover_url, opening_time, closing_time, is_open,
          accepts_credit, offers_delivery, offers_pickup
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19
        )
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            is_open = EXCLUDED.is_open,
            accepts_credit = EXCLUDED.accepts_credit;`,
        [
          s.id,
          s.owner_id,
          s.market_code,
          s.name,
          s.slug,
          s.category,
          s.description,
          s.phone,
          s.address_text,
          s.lat,
          s.lng,
          s.logo_url,
          s.cover_url,
          s.opening_time,
          s.closing_time,
          s.is_open,
          s.accepts_credit,
          s.offers_delivery,
          s.offers_pickup,
        ]
      );
    }

    // 3. Configure subscriptions
    await tx.query(
      `UPDATE public.subscriptions
       SET status = 'active',
           last_paid_minor = 240000,
           current_period_start = now() - interval '30 days',
           current_period_end = now() + interval '335 days'
       WHERE shop_id = $1;`,
      [DEMO_SHOPS.abebe.id]
    );

    await tx.query(
      `UPDATE public.subscriptions
       SET status = 'trial',
           last_paid_minor = 0,
           current_period_start = now() - interval '25 days',
           current_period_end = now() + interval '5 days'
       WHERE shop_id = $1;`,
      [DEMO_SHOPS.tsehay.id]
    );

    // 4. Seed products for both shops
    for (const p of ABEBE_PRODUCTS) {
      await tx.query(
        `INSERT INTO public.products (
          id, shop_id, name, description, price_minor, unit, category, image_url, is_available, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            price_minor = EXCLUDED.price_minor,
            is_available = EXCLUDED.is_available,
            deleted_at = NULL;`,
        [
          p.id,
          DEMO_SHOPS.abebe.id,
          p.name,
          p.description,
          p.price_minor,
          p.unit,
          p.category,
          p.image_url,
          p.is_available,
          p.sort_order,
        ]
      );
    }

    for (const p of TSEHAY_PRODUCTS) {
      await tx.query(
        `INSERT INTO public.products (
          id, shop_id, name, description, price_minor, unit, category, image_url, is_available, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            price_minor = EXCLUDED.price_minor,
            is_available = EXCLUDED.is_available,
            deleted_at = NULL;`,
        [
          p.id,
          DEMO_SHOPS.tsehay.id,
          p.name,
          p.description,
          p.price_minor,
          p.unit,
          p.category,
          p.image_url,
          p.is_available,
          p.sort_order,
        ]
      );
    }

    // 5. Clear & seed historical orders, payments, and ledger entries
    await tx.query(`DELETE FROM public.ledger_entries;`);
    await tx.query(`DELETE FROM public.payments;`);
    await tx.query(`DELETE FROM public.orders;`);

    await tx.query(
      `INSERT INTO public.shop_customers (shop_id, customer_id, credit_limit_minor, notes, first_order_at, last_order_at)
       VALUES
         ($1, $2, 300000, 'Regular neighborhood customer', now() - interval '14 days', now()),
         ($1, $3, 250000, 'Monthly credit account', now() - interval '14 days', now() - interval '1 day'),
         ($4, $2, 0, 'Morning pastry regular', now() - interval '6 days', now())
       ON CONFLICT (shop_id, customer_id) DO UPDATE
       SET credit_limit_minor = EXCLUDED.credit_limit_minor;`,
      [DEMO_SHOPS.abebe.id, DEMO_USERS.customer1.id, DEMO_USERS.customer2.id, DEMO_SHOPS.tsehay.id]
    );

    // 18 paid/completed/processing orders over the last 14 days for Abebe Mini Market
    for (let i = 1; i <= 18; i++) {
      const orderId = `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`;
      const orderNumber = `SL-${String(i).padStart(4, '0')}`;
      const isSelam = i % 2 === 1;
      const customerId = isSelam ? DEMO_USERS.customer1.id : DEMO_USERS.customer2.id;
      const daysAgo = Math.max(0, 14 - Math.floor(i * 0.8));
      const prod = ABEBE_PRODUCTS[(i - 1) % 10];
      const qty = (i % 3) + 1;
      const totalMinor = prod.price_minor * qty;
      const status = i === 18 ? 'processing' : 'completed';

      await tx.query(
        `INSERT INTO public.orders (
          id, order_number, shop_id, customer_id, status, payment_status, fulfilment,
          currency_code, subtotal_minor, delivery_fee_minor, total_minor,
          placed_at, accepted_at, completed_at, client_created_at
        ) VALUES (
          $1, $2, $3, $4, $5::order_status, 'paid', 'pickup',
          'ETB', $6, 0, $6,
          now() - ($7 || ' days')::interval,
          now() - ($7 || ' days')::interval + interval '5 minutes',
          CASE WHEN $5::text = 'completed' THEN now() - ($7 || ' days')::interval + interval '30 minutes' ELSE NULL END,
          now() - ($7 || ' days')::interval
        );`,
        [orderId, orderNumber, DEMO_SHOPS.abebe.id, customerId, status, totalMinor, String(daysAgo)]
      );

      await tx.query(
        `INSERT INTO public.order_items (
          order_id, product_id, product_name_snapshot, unit_snapshot, unit_price_minor, quantity, line_total_minor
        ) VALUES ($1, $2, $3, $4, $5, $6, $7);`,
        [orderId, prod.id, prod.name, prod.unit, prod.price_minor, qty, totalMinor]
      );

      await tx.query(
        `INSERT INTO public.order_events (order_id, from_status, to_status, actor_id, created_at)
         VALUES
           ($1, NULL, 'pending', $2, now() - ($4 || ' days')::interval),
           ($1, 'pending', 'accepted', $3, now() - ($4 || ' days')::interval + interval '5 minutes');`,
        [orderId, customerId, DEMO_USERS.shop1.id, String(daysAgo)]
      );

      const paymentId = `66666666-6666-4666-8666-${String(i).padStart(12, '0')}`;
      const payMethod = i % 3 === 0 ? 'telebirr' : i % 3 === 1 ? 'chapa' : 'cbe_birr';
      await tx.query(
        `INSERT INTO public.payments (
          id, purpose, order_id, shop_id, payer_id, amount_minor, currency_code,
          method_code, provider, provider_ref, status, idempotency_key, recorded_by, paid_at
        ) VALUES (
          $1, 'order', $2, $3, $4, $5, 'ETB',
          $9, 'demo', $6, 'succeeded', $7, $4, now() - ($8 || ' days')::interval + interval '10 minutes'
        );`,
        [
          paymentId,
          orderId,
          DEMO_SHOPS.abebe.id,
          customerId,
          totalMinor,
          `DEMO-REF-${i}`,
          `seed-pay-${i}`,
          String(daysAgo),
          payMethod,
        ]
      );

      await tx.query(
        `INSERT INTO public.ledger_entries (
          shop_id, customer_id, order_id, payment_id, type, amount_minor, currency_code, description, created_by, created_at
        ) VALUES
          ($1, $2, $3, NULL, 'charge', $4::bigint, 'ETB', $5, $6, now() - ($7 || ' days')::interval + interval '5 minutes'),
          ($1, $2, $3, $8, 'payment', -($4::bigint), 'ETB', $9, $2, now() - ($7 || ' days')::interval + interval '10 minutes');`,
        [
          DEMO_SHOPS.abebe.id,
          customerId,
          orderId,
          totalMinor,
          `Order ${orderNumber} accepted`,
          DEMO_USERS.shop1.id,
          String(daysAgo),
          paymentId,
          `Online payment (${payMethod}) for ${orderNumber}`,
        ]
      );
    }

    // Order #19: Dawit Bekele credit order 9 days ago -> exact remaining credit balance = Br 865.00
    const creditOrderId = '55555555-5555-4555-8555-000000000019';
    const creditTotal = 116500;
    const partialPaid = 30000;

    await tx.query(
      `INSERT INTO public.orders (
        id, order_number, shop_id, customer_id, status, payment_status, fulfilment,
        currency_code, subtotal_minor, delivery_fee_minor, total_minor,
        placed_at, accepted_at, completed_at, client_created_at
      ) VALUES (
        $1, 'SL-0019', $2, $3, 'completed', 'partially_paid', 'pickup',
        'ETB', $4, 0, $4,
        now() - interval '9 days',
        now() - interval '9 days' + interval '5 minutes',
        now() - interval '9 days' + interval '25 minutes',
        now() - interval '9 days'
      );`,
      [creditOrderId, DEMO_SHOPS.abebe.id, DEMO_USERS.customer2.id, creditTotal]
    );

    await tx.query(
      `INSERT INTO public.order_items (
        order_id, product_id, product_name_snapshot, unit_snapshot, unit_price_minor, quantity, line_total_minor
      ) VALUES
        ($1, '44444444-4444-4444-8444-444444444404', 'Cooking oil 3L', 'litre', 69000, 1, 69000),
        ($1, '44444444-4444-4444-8444-444444444402', 'Buna / Coffee beans 500g', 'pack', 32000, 1, 32000),
        ($1, '44444444-4444-4444-8444-444444444405', 'Pasta 500g', 'pack', 8500, 1, 8500),
        ($1, '44444444-4444-4444-8444-444444444403', 'Sugar 1kg', 'kg', 7000, 1, 7000);`,
      [creditOrderId]
    );

    const partialPaymentId = '66666666-6666-4666-8666-000000000019';
    await tx.query(
      `INSERT INTO public.payments (
        id, purpose, order_id, shop_id, payer_id, amount_minor, currency_code,
        method_code, provider, provider_ref, status, idempotency_key, recorded_by, paid_at
      ) VALUES (
        $1, 'order', $2, $3, $4, $5, 'ETB',
        'cash', 'manual', 'MAN-CREDIT-19', 'succeeded', 'seed-pay-19', $6, now() - interval '5 days'
      );`,
      [
        partialPaymentId,
        creditOrderId,
        DEMO_SHOPS.abebe.id,
        DEMO_USERS.customer2.id,
        partialPaid,
        DEMO_USERS.shop1.id,
      ]
    );

    await tx.query(
      `INSERT INTO public.ledger_entries (
        shop_id, customer_id, order_id, payment_id, type, amount_minor, currency_code, description, created_by, created_at
      ) VALUES
        ($1, $2, $3, NULL, 'charge', $4::bigint, 'ETB', 'Order SL-0019 accepted (on credit)', $5, now() - interval '9 days'),
        ($1, $2, $3, $6, 'payment', -($7::bigint), 'ETB', 'Partial cash settlement', $5, now() - interval '5 days');`,
      [
        DEMO_SHOPS.abebe.id,
        DEMO_USERS.customer2.id,
        creditOrderId,
        creditTotal,
        DEMO_USERS.shop1.id,
        partialPaymentId,
        partialPaid,
      ]
    );

    // Order #20: Cancelled order
    const cancelledOrderId = '55555555-5555-4555-8555-000000000020';
    await tx.query(
      `INSERT INTO public.orders (
        id, order_number, shop_id, customer_id, status, payment_status, fulfilment,
        currency_code, subtotal_minor, delivery_fee_minor, total_minor,
        rejection_reason, placed_at, client_created_at
      ) VALUES (
        $1, 'SL-0020', $2, $3, 'cancelled', 'unpaid', 'pickup',
        'ETB', 15000, 0, 15000,
        'Ordered by mistake', now() - interval '2 days', now() - interval '2 days'
      );`,
      [cancelledOrderId, DEMO_SHOPS.abebe.id, DEMO_USERS.customer1.id]
    );

    // Order #21: Fresh Pending ("New") order today at Abebe Mini Market so Shop Owner immediately sees an actionable order
    const pendingOrderId = '55555555-5555-4555-8555-000000000021';
    await tx.query(
      `INSERT INTO public.orders (
        id, order_number, shop_id, customer_id, status, payment_status, fulfilment,
        currency_code, subtotal_minor, delivery_fee_minor, total_minor,
        delivery_address, note, placed_at, client_created_at
      ) VALUES (
        $1, 'SL-0021', $2, $3, 'pending', 'unpaid', 'delivery',
        'ETB', 21000, 0, 21000,
        'Bole Medhanialem, House 108, Addis Ababa', 'Please send fresh warm injera',
        now() - interval '12 minutes', now() - interval '12 minutes'
      );`,
      [pendingOrderId, DEMO_SHOPS.abebe.id, DEMO_USERS.customer1.id]
    );
    await tx.query(
      `INSERT INTO public.order_items (
        order_id, product_id, product_name_snapshot, unit_snapshot, unit_price_minor, quantity, line_total_minor
      ) VALUES
        ($1, '44444444-4444-4444-8444-444444444401', 'Teff Injera (5 pcs)', 'pack', 7500, 1, 7500),
        ($1, '44444444-4444-4444-8444-444444444409', 'Fresh milk 1L', 'litre', 9000, 1, 9000),
        ($1, '44444444-4444-4444-8444-444444444410', 'Bread loaf', 'piece', 4500, 1, 4500);`,
      [pendingOrderId]
    );
    await tx.query(
      `INSERT INTO public.order_events (order_id, from_status, to_status, actor_id, created_at)
       VALUES ($1, NULL, 'pending', $2, now() - interval '12 minutes');`,
      [pendingOrderId, DEMO_USERS.customer1.id]
    );

    // Order #22 & #23: Orders for Tsehay Bakery so Shop Owner #2 also has rich activity
    const tsehayCompletedId = '55555555-5555-4555-8555-000000000022';
    await tx.query(
      `INSERT INTO public.orders (
        id, order_number, shop_id, customer_id, status, payment_status, fulfilment,
        currency_code, subtotal_minor, delivery_fee_minor, total_minor,
        placed_at, accepted_at, completed_at, client_created_at
      ) VALUES (
        $1, 'SL-0022', $2, $3, 'completed', 'paid', 'pickup',
        'ETB', 28000, 0, 28000,
        now() - interval '3 hours', now() - interval '2 hours 50 minutes', now() - interval '2 hours 20 minutes',
        now() - interval '3 hours'
      );`,
      [tsehayCompletedId, DEMO_SHOPS.tsehay.id, DEMO_USERS.customer1.id]
    );
    await tx.query(
      `INSERT INTO public.order_items (
        order_id, product_id, product_name_snapshot, unit_snapshot, unit_price_minor, quantity, line_total_minor
      ) VALUES
        ($1, '44444444-4444-4444-8444-444444444501', 'Special Dabo Loaf', 'piece', 12000, 1, 12000),
        ($1, '44444444-4444-4444-8444-444444444502', 'Butter Croissant (4 pcs)', 'pack', 16000, 1, 16000);`,
      [tsehayCompletedId]
    );
    const tsehayPayId = '66666666-6666-4666-8666-000000000022';
    await tx.query(
      `INSERT INTO public.payments (
        id, purpose, order_id, shop_id, payer_id, amount_minor, currency_code,
        method_code, provider, provider_ref, status, idempotency_key, recorded_by, paid_at
      ) VALUES (
        $1, 'order', $2, $3, $4, 28000, 'ETB',
        'telebirr', 'demo', 'DEMO-REF-22', 'succeeded', 'seed-pay-22', $4, now() - interval '2 hours 40 minutes'
      );`,
      [tsehayPayId, tsehayCompletedId, DEMO_SHOPS.tsehay.id, DEMO_USERS.customer1.id]
    );
    await tx.query(
      `INSERT INTO public.ledger_entries (
        shop_id, customer_id, order_id, payment_id, type, amount_minor, currency_code, description, created_by, created_at
      ) VALUES
        ($1, $2, $3, NULL, 'charge', 28000, 'ETB', 'Order SL-0022 accepted', $4, now() - interval '2 hours 50 minutes'),
        ($1, $2, $3, $5, 'payment', -28000, 'ETB', 'Online payment (telebirr) for SL-0022', $2, now() - interval '2 hours 40 minutes');`,
      [DEMO_SHOPS.tsehay.id, DEMO_USERS.customer1.id, tsehayCompletedId, DEMO_USERS.shop2.id, tsehayPayId]
    );

    const tsehayPendingId = '55555555-5555-4555-8555-000000000023';
    await tx.query(
      `INSERT INTO public.orders (
        id, order_number, shop_id, customer_id, status, payment_status, fulfilment,
        currency_code, subtotal_minor, delivery_fee_minor, total_minor,
        note, placed_at, client_created_at
      ) VALUES (
        $1, 'SL-0023', $2, $3, 'pending', 'unpaid', 'pickup',
        'ETB', 19000, 0, 19000,
        'Will pick up at 4:00 PM', now() - interval '25 minutes', now() - interval '25 minutes'
      );`,
      [tsehayPendingId, DEMO_SHOPS.tsehay.id, DEMO_USERS.customer2.id]
    );
    await tx.query(
      `INSERT INTO public.order_items (
        order_id, product_id, product_name_snapshot, unit_snapshot, unit_price_minor, quantity, line_total_minor
      ) VALUES
        ($1, '44444444-4444-4444-8444-444444444503', 'Spiced Ambasha', 'piece', 9500, 2, 19000);`,
      [tsehayPendingId]
    );

    // 6. Seed realistic Support Tickets across roles
    await tx.query(
      `INSERT INTO public.support_tickets (id, user_id, subject, message, status, admin_reply, created_at)
       VALUES
         ('77777777-7777-4777-8777-000000000001', $1, 'Delivery hours on Sunday', 'Hi team, does Abebe Mini Market deliver after 7 PM on Sundays?', 'open', NULL, now() - interval '4 hours'),
         ('77777777-7777-4777-8777-000000000002', $2, 'Upgrading from Free Trial to Annual Plan', 'Our 30-day trial ends in 5 days and we want to pay via telebirr for the Annual Shop Plan.', 'in_progress', 'You can renew directly under More -> Subscription or we can activate manually after receipt.', now() - interval '1 day'),
         ('77777777-7777-4777-8777-000000000003', $3, 'How to set customer credit limits?', 'Where can I adjust monthly credit limits for regular neighborhood customers?', 'resolved', 'Open Customers -> select any customer to view their credit balance and record partial payments.', now() - interval '3 days')
       ON CONFLICT (id) DO NOTHING;`,
      [DEMO_USERS.customer1.id, DEMO_USERS.shop2.id, DEMO_USERS.shop1.id]
    );

    // 7. Seed initial Audit Log records for Admin visibility
    await tx.query(
      `INSERT INTO public.audit_log (actor_id, action, entity, entity_id, payload, created_at)
       VALUES
         ($1, 'subscription_activate', 'subscriptions', $2, '{"shop":"Abebe Mini Market","plan":"annual","amount_minor":240000}'::jsonb, now() - interval '30 days'),
         ($1, 'seed_platform_markets', 'markets', 'ET', '{"active_markets":["ET"],"standby_markets":["KE"]}'::jsonb, now() - interval '30 days');`,
      [DEMO_USERS.admin.id, DEMO_SHOPS.abebe.id]
    );

    // 8. Add an incoming order notification for Abebe & Tsehay
    await tx.query(
      `INSERT INTO public.notifications (user_id, type, title, body, data, created_at)
       VALUES
         ($1, 'new_order', 'New Order SL-0021', 'Selam Tesfaye placed a Br 210.00 delivery order.', jsonb_build_object('order_id', $2), now() - interval '12 minutes'),
         ($3, 'new_order', 'New Order SL-0023', 'Dawit Bekele placed a Br 190.00 pickup order.', jsonb_build_object('order_id', $4), now() - interval '25 minutes');`,
      [DEMO_USERS.shop1.id, pendingOrderId, DEMO_USERS.shop2.id, tsehayPendingId]
    );

    // 9. Run scheduled reminders so Tsehay Bakery (5d trial left) and Dawit Bekele (9d old credit) get reminder notifications
    await tx.query(`SELECT public.run_scheduled_reminders();`);
  });
}
