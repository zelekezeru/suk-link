import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { openPersistentPostgres, PROJECT_ROOT } from './pg-engine';

export const DEMO_USERS = {
  customer1: {
    id: '11111111-1111-4111-8111-111111111101',
    email: 'customer@demo.suklink.et',
    phone: '+251911100101',
    full_name: 'Selam Tesfaye',
    role: 'customer',
    market_code: 'ET',
  },
  customer2: {
    id: '11111111-1111-4111-8111-111111111102',
    email: 'customer2@demo.suklink.et',
    phone: '+251911100102',
    full_name: 'Dawit Bekele',
    role: 'customer',
    market_code: 'ET',
  },
  shop1: {
    id: '22222222-2222-4222-8222-222222222201',
    email: 'shop@demo.suklink.et',
    phone: '+251911200201',
    full_name: 'Abebe Kebede',
    role: 'shop_owner',
    market_code: 'ET',
  },
  shop2: {
    id: '22222222-2222-4222-8222-222222222202',
    email: 'shop2@demo.suklink.et',
    phone: '+251911200202',
    full_name: 'Tsehay Tadesse',
    role: 'shop_owner',
    market_code: 'ET',
  },
  admin: {
    id: '99999999-9999-4999-8999-999999999901',
    email: 'admin@demo.suklink.et',
    phone: '+251911900901',
    full_name: 'Kaleb Admin',
    role: 'admin',
    market_code: 'ET',
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
    description: 'Warm daily dabo, croissants, and sweet pastries.',
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

export interface SeedProductDef {
  id: string;
  name: string;
  description: string;
  price_minor: number;
  unit: string;
  category: string;
  image_url: string;
  is_available: boolean;
  sort_order: number;
  color: string;
}

export const ABEBE_PRODUCTS: SeedProductDef[] = [
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
    color: '#D97706',
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
    color: '#78350F',
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
    color: '#0284C7',
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
    color: '#EAB308',
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
    color: '#EA580C',
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
    color: '#DC2626',
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
    color: '#991B1B',
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
    color: '#F59E0B',
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
    color: '#2563EB',
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
    color: '#B45309',
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
    color: '#0891B2',
  },
  {
    id: '44444444-4444-4444-8444-444444444412',
    name: 'Laundry soap',
    description: 'Multi-purpose household laundry soap bar (Out of stock)',
    price_minor: 6000,
    unit: 'piece',
    category: 'Household',
    image_url: '/seed-images/laundry-soap.svg',
    is_available: false, // Marked out of stock per Section 12
    sort_order: 12,
    color: '#0E7C66',
  },
];

export function generateSeedImages(): void {
  const dirs = [
    path.join(PROJECT_ROOT, 'scripts', 'seed-images'),
    path.join(PROJECT_ROOT, 'public', 'seed-images'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const writeSvg = (filename: string, svg: string) => {
    for (const dir of dirs) {
      fs.writeFileSync(path.join(dir, filename), svg, 'utf-8');
    }
  };

  for (const p of ABEBE_PRODUCTS) {
    const filename = path.basename(p.image_url);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.color}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${p.color}" stop-opacity="0.38"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" rx="24" fill="url(#bg)"/>
  <circle cx="200" cy="125" r="56" fill="${p.color}" fill-opacity="0.88"/>
  <text x="200" y="135" text-anchor="middle" font-family="Inter, sans-serif" font-size="28" font-weight="700" fill="#FFFFFF">${p.name.slice(0, 2).toUpperCase()}</text>
  <text x="200" y="225" text-anchor="middle" font-family="Inter, sans-serif" font-size="20" font-weight="600" fill="#0F172A">${p.name.replace(/&/g, '&amp;')}</text>
  <text x="200" y="255" text-anchor="middle" font-family="Inter, sans-serif" font-size="16" font-weight="500" fill="#475569">Br ${(p.price_minor / 100).toFixed(2)} / ${p.unit}</text>
</svg>`;
    writeSvg(filename, svg);
  }

  writeSvg(
    'shop-abebe-logo.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="36" fill="#0E7C66"/><text x="80" y="96" text-anchor="middle" font-family="Inter, sans-serif" font-size="48" font-weight="700" fill="#FFFFFF">AM</text></svg>`
  );
  writeSvg(
    'shop-abebe-cover.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 320"><rect width="800" height="320" fill="#0E7C66"/><circle cx="700" cy="60" r="180" fill="#F2A93B" fill-opacity="0.22"/><text x="48" y="180" font-family="Inter, sans-serif" font-size="42" font-weight="700" fill="#FFFFFF">Abebe Mini Market</text><text x="48" y="225" font-family="Inter, sans-serif" font-size="22" fill="#E6F4F0">Fresh Groceries &amp; Daily Essentials • Bole</text></svg>`
  );
  writeSvg(
    'shop-tsehay-logo.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="36" fill="#D97706"/><text x="80" y="96" text-anchor="middle" font-family="Inter, sans-serif" font-size="48" font-weight="700" fill="#FFFFFF">TB</text></svg>`
  );
  writeSvg(
    'shop-tsehay-cover.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 320"><rect width="800" height="320" fill="#B45309"/><text x="48" y="180" font-family="Inter, sans-serif" font-size="42" font-weight="700" fill="#FFFFFF">Tsehay Bakery</text><text x="48" y="225" font-family="Inter, sans-serif" font-size="22" fill="#FEF3C7">Warm Daily Bread &amp; Pastries • Kazanchis</text></svg>`
  );
}

export async function seedDatabase(db: PGlite): Promise<void> {
  generateSeedImages();

  await db.transaction(async (tx) => {
    await seedDatabaseTx(tx as unknown as PGlite);
  });
}

async function seedDatabaseTx(db: PGlite): Promise<void> {

  // 1. Seed users (password: Demo@2026)
  for (const u of Object.values(DEMO_USERS)) {
    await db.query(
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
  }

  // 2. Seed shops
  for (const s of Object.values(DEMO_SHOPS)) {
    await db.query(
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

  // 3. Configure subscriptions per Section 12:
  // Abebe Mini Market: active, expires in ~11 months (335 days)
  await db.query(
    `UPDATE public.subscriptions
     SET status = 'active',
         last_paid_minor = 240000,
         current_period_start = now() - interval '30 days',
         current_period_end = now() + interval '335 days'
     WHERE shop_id = $1;`,
    [DEMO_SHOPS.abebe.id]
  );

  // Tsehay Bakery: trial, 5 days left (to show reminders)
  await db.query(
    `UPDATE public.subscriptions
     SET status = 'trial',
         last_paid_minor = 0,
         current_period_start = now() - interval '25 days',
         current_period_end = now() + interval '5 days'
     WHERE shop_id = $1;`,
    [DEMO_SHOPS.tsehay.id]
  );

  // 4. Seed products for Abebe Mini Market & Tsehay Bakery
  for (const p of ABEBE_PRODUCTS) {
    await db.query(
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

  // Add 2 bakery items for Tsehay Bakery
  await db.query(
    `INSERT INTO public.products (
      id, shop_id, name, description, price_minor, unit, category, image_url, is_available, sort_order
    ) VALUES
      ('44444444-4444-4444-8444-444444444501', $1, 'Special Dabo Loaf', 'Traditional honey-glazed dabo', 12000, 'piece', 'Bakery', '/seed-images/bread-loaf.svg', true, 1),
      ('44444444-4444-4444-8444-444444444502', $1, 'Butter Croissant (4 pcs)', 'Flaky fresh butter croissants', 16000, 'pack', 'Pastries', '/seed-images/bread-loaf.svg', true, 2)
    ON CONFLICT (id) DO NOTHING;`,
    [DEMO_SHOPS.tsehay.id]
  );

  // 5. Seed ~20 historical orders over the last 14 days across both customers
  // Ensure Dawit Bekele has an exact outstanding credit balance of Br 865 (86,500 minor units)
  await db.query(`DELETE FROM public.ledger_entries WHERE shop_id = $1;`, [DEMO_SHOPS.abebe.id]);
  await db.query(`DELETE FROM public.payments WHERE shop_id = $1;`, [DEMO_SHOPS.abebe.id]);
  await db.query(`DELETE FROM public.orders WHERE shop_id = $1;`, [DEMO_SHOPS.abebe.id]);

  await db.query(
    `INSERT INTO public.shop_customers (shop_id, customer_id, credit_limit_minor, notes, first_order_at, last_order_at)
     VALUES
       ($1, $2, 300000, 'Regular neighborhood customer', now() - interval '14 days', now() - interval '1 day'),
       ($1, $3, 250000, 'Monthly credit account', now() - interval '14 days', now() - interval '1 day')
     ON CONFLICT (shop_id, customer_id) DO UPDATE
     SET credit_limit_minor = EXCLUDED.credit_limit_minor;`,
    [DEMO_SHOPS.abebe.id, DEMO_USERS.customer1.id, DEMO_USERS.customer2.id]
  );

  // Create 18 paid/completed orders over the past 14 days
  for (let i = 1; i <= 18; i++) {
    const orderId = `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`;
    const orderNumber = `SL-${String(i).padStart(4, '0')}`;
    const isSelam = i % 2 === 1;
    const customerId = isSelam ? DEMO_USERS.customer1.id : DEMO_USERS.customer2.id;
    const daysAgo = Math.max(0, 14 - Math.floor(i * 0.75));
    const prod = ABEBE_PRODUCTS[(i - 1) % 10];
    const qty = (i % 3) + 1;
    const totalMinor = prod.price_minor * qty;
    const status = i === 18 ? 'processing' : 'completed';

    await db.query(
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

    await db.query(
      `INSERT INTO public.order_items (
        order_id, product_id, product_name_snapshot, unit_snapshot, unit_price_minor, quantity, line_total_minor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [orderId, prod.id, prod.name, prod.unit, prod.price_minor, qty, totalMinor]
    );

    await db.query(
      `INSERT INTO public.order_events (order_id, from_status, to_status, actor_id, created_at)
       VALUES
         ($1, NULL, 'pending', $2, now() - ($4 || ' days')::interval),
         ($1, 'pending', 'accepted', $3, now() - ($4 || ' days')::interval + interval '5 minutes');`,
      [orderId, customerId, DEMO_USERS.shop1.id, String(daysAgo)]
    );

    // Charge + Payment so net balance for these 18 orders is 0
    const paymentId = `66666666-6666-4666-8666-${String(i).padStart(12, '0')}`;
    await db.query(
      `INSERT INTO public.payments (
        id, purpose, order_id, shop_id, payer_id, amount_minor, currency_code,
        method_code, provider, provider_ref, status, idempotency_key, recorded_by, paid_at
      ) VALUES (
        $1, 'order', $2, $3, $4, $5, 'ETB',
        'chapa', 'demo', $6, 'succeeded', $7, $4, now() - ($8 || ' days')::interval + interval '10 minutes'
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
      ]
    );

    await db.query(
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
        `Online payment for ${orderNumber}`,
      ]
    );
  }

  // Order #19: Dawit Bekele credit order 9 days ago for Br 1,165.00 (116,500 minor units)
  // with a partial payment of Br 300.00 (30,000 minor units) -> exact remaining credit balance = Br 865.00 (86,500 minor units)!
  const creditOrderId = '55555555-5555-4555-8555-000000000019';
  const creditOrderNum = 'SL-0019';
  const creditTotal = 116500; // 1x Cooking oil (690) + 1x Buna (320) + 1x Berbere (150) + adjustment/bread = 1165.00
  const partialPaid = 30000; // Br 300.00 paid, leaving Br 865.00 outstanding

  await db.query(
    `INSERT INTO public.orders (
      id, order_number, shop_id, customer_id, status, payment_status, fulfilment,
      currency_code, subtotal_minor, delivery_fee_minor, total_minor,
      placed_at, accepted_at, completed_at, client_created_at
    ) VALUES (
      $1, $2, $3, $4, 'completed', 'partially_paid', 'pickup',
      'ETB', $5, 0, $5,
      now() - interval '9 days',
      now() - interval '9 days' + interval '5 minutes',
      now() - interval '9 days' + interval '25 minutes',
      now() - interval '9 days'
    );`,
    [creditOrderId, creditOrderNum, DEMO_SHOPS.abebe.id, DEMO_USERS.customer2.id, creditTotal]
  );

  await db.query(
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
  await db.query(
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

  await db.query(
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

  // Order #20: Cancelled order to show mixed statuses
  const cancelledOrderId = '55555555-5555-4555-8555-000000000020';
  await db.query(
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

  // Run scheduled reminders once so Tsehay Bakery (5 days left) and Dawit Bekele (9 days old credit) have notifications ready
  await db.query(`SELECT public.run_scheduled_reminders();`);
}

// Allow running directly via `npm run seed`
const isDirectSeedRun =
  process.argv[1] &&
  path.basename(process.argv[1]) === 'seed.ts';

if (isDirectSeedRun) {
  (async () => {
    const db = await openPersistentPostgres(false);
    await seedDatabase(db);
    await db.close();
    console.log('✅ Seeded Suk Link demo accounts, shops, products, and ledger history.');
    process.exit(0);
  })();
}
