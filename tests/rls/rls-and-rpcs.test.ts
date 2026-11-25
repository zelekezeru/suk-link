import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createInMemoryPostgres, queryAsUser } from '../../scripts/pg-engine';
import { computeCartTotals } from '../../src/lib/money';

describe('M1 — PostgreSQL RLS Policies, Triggers, and RPC Business Logic (Section 6 & 9)', () => {
  let db: PGlite;

  const IDS = {
    customerA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    customerB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    shopOwnerX: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    shopOwnerY: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    admin: '99999999-9999-4999-8999-999999999999',
    shopX: '10000000-0000-4000-8000-000000000001',
    shopY: '20000000-0000-4000-8000-000000000002',
    prodX1: '30000000-0000-4000-8000-000000000001',
    prodX2: '30000000-0000-4000-8000-000000000002',
    prodXUnavailable: '30000000-0000-4000-8000-000000000003',
    prodY1: '40000000-0000-4000-8000-000000000001',
    orderA1: '50000000-0000-4000-8000-000000000001',
    orderB1: '50000000-0000-4000-8000-000000000002',
  };

  beforeAll(async () => {
    db = await createInMemoryPostgres();

    // Create users via auth.users trigger
    await db.query(
      `INSERT INTO auth.users (id, email, phone, raw_user_meta_data, raw_app_meta_data)
       VALUES
         ($1, 'custA@test.et', '+251910000001', '{"full_name":"Customer A","role":"customer"}', '{}'),
         ($2, 'custB@test.et', '+251910000002', '{"full_name":"Customer B","role":"customer"}', '{}'),
         ($3, 'ownerX@test.et', '+251910000003', '{"full_name":"Owner X","role":"shop_owner"}', '{}'),
         ($4, 'ownerY@test.et', '+251910000004', '{"full_name":"Owner Y","role":"shop_owner"}', '{}'),
         ($5, 'admin@test.et', '+251910000005', '{"full_name":"Super Admin"}', '{"role":"admin"}');`,
      [IDS.customerA, IDS.customerB, IDS.shopOwnerX, IDS.shopOwnerY, IDS.admin]
    );

    // Owner X creates Shop X; Owner Y creates Shop Y
    await queryAsUser(
      db,
      { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
      `INSERT INTO public.shops (id, owner_id, market_code, name, slug, category, phone, address_text, accepts_credit)
       VALUES ($1, $2, 'ET', 'Shop X', 'shop-x', 'grocery', '+251910000003', 'Bole', true);`,
      [IDS.shopX, IDS.shopOwnerX]
    );

    await queryAsUser(
      db,
      { sub: IDS.shopOwnerY, appRole: 'shop_owner' },
      `INSERT INTO public.shops (id, owner_id, market_code, name, slug, category, phone, address_text, accepts_credit)
       VALUES ($1, $2, 'ET', 'Shop Y', 'shop-y', 'bakery', '+251910000004', 'Piassa', false);`,
      [IDS.shopY, IDS.shopOwnerY]
    );

    // Owner X inserts products into Shop X
    await queryAsUser(
      db,
      { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
      `INSERT INTO public.products (id, shop_id, name, price_minor, unit, category, is_available)
       VALUES
         ($1, $4, 'Sugar 1kg', 14000, 'kg', 'Pantry', true),
         ($2, $4, 'Cooking oil 3L', 69000, 'litre', 'Pantry', true),
         ($3, $4, 'Laundry soap', 6000, 'piece', 'Household', false);`,
      [IDS.prodX1, IDS.prodX2, IDS.prodXUnavailable, IDS.shopX]
    );

    // Owner Y inserts product into Shop Y
    await queryAsUser(
      db,
      { sub: IDS.shopOwnerY, appRole: 'shop_owner' },
      `INSERT INTO public.products (id, shop_id, name, price_minor, unit, category, is_available)
       VALUES ($1, $2, 'Bakery Bread', 4500, 'piece', 'Bakery', true);`,
      [IDS.prodY1, IDS.shopY]
    );
  }, 90000);

  afterAll(async () => {
    await db.close();
  });

  it('rejects self-signup as admin via auth.users trigger', async () => {
    await expect(
      db.query(
        `INSERT INTO auth.users (email, raw_user_meta_data, raw_app_meta_data)
         VALUES ('hacker@test.et', '{"full_name":"Hacker","role":"admin"}', '{}');`
      )
    ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
  });

  it('prevents a user from escalating their own role in profiles', async () => {
    await expect(
      queryAsUser(
        db,
        { sub: IDS.customerA, appRole: 'customer' },
        `UPDATE public.profiles SET role = 'admin' WHERE id = $1;`,
        [IDS.customerA]
      )
    ).rejects.toThrow(/CANNOT_CHANGE_ROLE/);
  });

  it('automatically provisions a 30-day free trial subscription and shop_payment_methods when a shop is created', async () => {
    const { rows: subs } = await queryAsUser(
      db,
      { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
      `SELECT status, last_paid_minor FROM public.subscriptions WHERE shop_id = $1;`,
      [IDS.shopX]
    );
    expect(subs).toHaveLength(1);
    expect(subs[0].status).toBe('trial');

    // ShopOwnerY cannot read ShopOwnerX's subscription
    const { rows: crossSubs } = await queryAsUser(
      db,
      { sub: IDS.shopOwnerY, appRole: 'shop_owner' },
      `SELECT * FROM public.subscriptions WHERE shop_id = $1;`,
      [IDS.shopX]
    );
    expect(crossSubs).toHaveLength(0);
  });

  it('forbids Shop Owner Y from inserting or updating products in Shop X', async () => {
    await expect(
      queryAsUser(
        db,
        { sub: IDS.shopOwnerY, appRole: 'shop_owner' },
        `INSERT INTO public.products (shop_id, name, price_minor, unit)
         VALUES ($1, 'Malicious Product', 1000, 'piece');`,
        [IDS.shopX]
      )
    ).rejects.toThrow();

    const { rows: updated } = await queryAsUser(
      db,
      { sub: IDS.shopOwnerY, appRole: 'shop_owner' },
      `UPDATE public.products SET price_minor = 100 WHERE id = $1 RETURNING id;`,
      [IDS.prodX1]
    );
    expect(updated).toHaveLength(0);
  });

  it('forbids direct INSERT into orders, payments, or ledger_entries via RLS', async () => {
    await expect(
      queryAsUser(
        db,
        { sub: IDS.customerA, appRole: 'customer' },
        `INSERT INTO public.orders (id, order_number, shop_id, customer_id, subtotal_minor, total_minor)
         VALUES (gen_random_uuid(), 'SL-9999', $1, $2, 1000, 1000);`,
        [IDS.shopX, IDS.customerA]
      )
    ).rejects.toThrow();

    await expect(
      queryAsUser(
        db,
        { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
        `INSERT INTO public.ledger_entries (shop_id, customer_id, type, amount_minor, description, created_by)
         VALUES ($1, $2, 'payment', -10000, 'Fake payment', $3);`,
        [IDS.shopX, IDS.customerA, IDS.shopOwnerX]
      )
    ).rejects.toThrow();
  });

  it('places an order via place_order RPC, enforces idempotency, price check, and unavailability check', async () => {
    const items = [
      { product_id: IDS.prodX1, quantity: 2 }, // 2 * 14000 = 28000
      { product_id: IDS.prodX2, quantity: 1 }, // 1 * 69000 = 69000 -> total 97000
    ];

    // 1. Fails with PRICE_CHANGED if expected total differs
    await expect(
      queryAsUser(
        db,
        { sub: IDS.customerA, appRole: 'customer' },
        `SELECT * FROM public.place_order($1::uuid, $2::uuid, $3::jsonb, 'pickup'::fulfilment_type, NULL, 'Test note', now(), 50000);`,
        [IDS.orderA1, IDS.shopX, JSON.stringify(items)]
      )
    ).rejects.toThrow(/PRICE_CHANGED/);

    // 2. Fails if product is unavailable
    await expect(
      queryAsUser(
        db,
        { sub: IDS.customerA, appRole: 'customer' },
        `SELECT * FROM public.place_order($1::uuid, $2::uuid, $3::jsonb, 'pickup'::fulfilment_type, NULL, NULL, now(), NULL);`,
        [
          '50000000-0000-4000-8000-000000000099',
          IDS.shopX,
          JSON.stringify([{ product_id: IDS.prodXUnavailable, quantity: 1 }]),
        ]
      )
    ).rejects.toThrow(/PRODUCT_UNAVAILABLE/);

    // 3. Succeeds with correct expected total (97000)
    const { rows: placed } = await queryAsUser(
      db,
      { sub: IDS.customerA, appRole: 'customer' },
      `SELECT * FROM public.place_order($1::uuid, $2::uuid, $3::jsonb, 'pickup'::fulfilment_type, NULL, 'Deliver fast', now(), 97000);`,
      [IDS.orderA1, IDS.shopX, JSON.stringify(items)]
    );
    expect(placed).toHaveLength(1);
    expect(Number(placed[0].total_minor)).toBe(97000);
    expect(placed[0].status).toBe('pending');
    expect(placed[0].payment_status).toBe('unpaid');

    // 4. Idempotent retry returns the exact same order without duplicating
    const { rows: retry } = await queryAsUser(
      db,
      { sub: IDS.customerA, appRole: 'customer' },
      `SELECT * FROM public.place_order($1::uuid, $2::uuid, $3::jsonb, 'pickup'::fulfilment_type, NULL, 'Deliver fast', now(), 97000);`,
      [IDS.orderA1, IDS.shopX, JSON.stringify(items)]
    );
    expect(retry[0].id).toBe(IDS.orderA1);
    expect(retry[0].order_number).toBe(placed[0].order_number);
  });

  it('enforces cross-tenant isolation on orders and profiles', async () => {
    // Customer B cannot read Customer A's order
    const { rows: custBOrders } = await queryAsUser(
      db,
      { sub: IDS.customerB, appRole: 'customer' },
      `SELECT * FROM public.orders WHERE id = $1;`,
      [IDS.orderA1]
    );
    expect(custBOrders).toHaveLength(0);

    // Shop Owner Y cannot read Shop X's order
    const { rows: ownerYOrders } = await queryAsUser(
      db,
      { sub: IDS.shopOwnerY, appRole: 'shop_owner' },
      `SELECT * FROM public.orders WHERE id = $1;`,
      [IDS.orderA1]
    );
    expect(ownerYOrders).toHaveLength(0);

    // Shop Owner X CAN read Shop X's order and Customer A's profile (since Customer A ordered from Shop X)
    const { rows: ownerXOrders } = await queryAsUser(
      db,
      { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
      `SELECT * FROM public.orders WHERE id = $1;`,
      [IDS.orderA1]
    );
    expect(ownerXOrders).toHaveLength(1);

    const { rows: custAProfileForX } = await queryAsUser(
      db,
      { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
      `SELECT full_name, phone FROM public.profiles WHERE id = $1;`,
      [IDS.customerA]
    );
    expect(custAProfileForX).toHaveLength(1);

    // Shop Owner Y CANNOT read Customer A's profile (Customer A never ordered from Shop Y)
    const { rows: custAProfileForY } = await queryAsUser(
      db,
      { sub: IDS.shopOwnerY, appRole: 'shop_owner' },
      `SELECT full_name, phone FROM public.profiles WHERE id = $1;`,
      [IDS.customerA]
    );
    expect(custAProfileForY).toHaveLength(0);
  });

  it('enforces order status transitions, writes ledger charge on acceptance, and updates payment_status on payment', async () => {
    // 1. Customer A cannot mark their own order accepted
    await expect(
      queryAsUser(
        db,
        { sub: IDS.customerA, appRole: 'customer' },
        `SELECT * FROM public.update_order_status($1::uuid, 'accepted'::order_status, NULL);`,
        [IDS.orderA1]
      )
    ).rejects.toThrow(/INVALID_TRANSITION/);

    // 2. Shop Owner X cannot jump from pending directly to completed
    await expect(
      queryAsUser(
        db,
        { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
        `SELECT * FROM public.update_order_status($1::uuid, 'completed'::order_status, NULL);`,
        [IDS.orderA1]
      )
    ).rejects.toThrow(/INVALID_TRANSITION/);

    // 3. Shop Owner X accepts the order -> writes +97000 charge to ledger_entries
    const { rows: accepted } = await queryAsUser(
      db,
      { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
      `SELECT * FROM public.update_order_status($1::uuid, 'accepted'::order_status, NULL);`,
      [IDS.orderA1]
    );
    expect(accepted[0].status).toBe('accepted');

    // Verify customer balance view = 97000
    const { rows: balAfterAccept } = await queryAsUser(
      db,
      { sub: IDS.customerA, appRole: 'customer' },
      `SELECT balance_minor FROM public.v_customer_balances WHERE shop_id = $1 AND customer_id = $2;`,
      [IDS.shopX, IDS.customerA]
    );
    expect(Number(balAfterAccept[0].balance_minor)).toBe(97000);

    // 4. Customer A puts order on credit
    const { rows: onCredit } = await queryAsUser(
      db,
      { sub: IDS.customerA, appRole: 'customer' },
      `SELECT * FROM public.set_order_on_credit($1::uuid);`,
      [IDS.orderA1]
    );
    expect(onCredit[0].payment_status).toBe('on_credit');

    // 5. Shop Owner X records a partial cash payment of Br 400 (40000 minor units)
    await queryAsUser(
      db,
      { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
      `SELECT * FROM public.record_payment('idem-pay-1', $1::uuid, $2::uuid, $3::uuid, 40000, 'cash', 'Partial cash');`,
      [IDS.shopX, IDS.customerA, IDS.orderA1]
    );

    const { rows: orderPartial } = await queryAsUser(
      db,
      { sub: IDS.customerA, appRole: 'customer' },
      `SELECT payment_status FROM public.orders WHERE id = $1;`,
      [IDS.orderA1]
    );
    expect(orderPartial[0].payment_status).toBe('partially_paid');

    const { rows: balAfterPartial } = await queryAsUser(
      db,
      { sub: IDS.customerA, appRole: 'customer' },
      `SELECT balance_minor FROM public.v_customer_balances WHERE shop_id = $1 AND customer_id = $2;`,
      [IDS.shopX, IDS.customerA]
    );
    expect(Number(balAfterPartial[0].balance_minor)).toBe(57000);

    // 6. Shop Owner X cannot record a payment exceeding the remaining balance (57000)
    await expect(
      queryAsUser(
        db,
        { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
        `SELECT * FROM public.record_payment('idem-pay-over', $1::uuid, $2::uuid, $3::uuid, 60000, 'cash', 'Too much');`,
        [IDS.shopX, IDS.customerA, IDS.orderA1]
      )
    ).rejects.toThrow(/AMOUNT_EXCEEDS_OUTSTANDING/);

    // 7. Settle the remaining 57000 -> payment_status becomes 'paid', balance becomes 0
    await queryAsUser(
      db,
      { sub: IDS.shopOwnerX, appRole: 'shop_owner' },
      `SELECT * FROM public.record_payment('idem-pay-2', $1::uuid, $2::uuid, $3::uuid, 57000, 'cash', 'Final cash');`,
      [IDS.shopX, IDS.customerA, IDS.orderA1]
    );

    const { rows: orderPaid } = await queryAsUser(
      db,
      { sub: IDS.customerA, appRole: 'customer' },
      `SELECT payment_status FROM public.orders WHERE id = $1;`,
      [IDS.orderA1]
    );
    expect(orderPaid[0].payment_status).toBe('paid');

    const { rows: balAfterFull } = await queryAsUser(
      db,
      { sub: IDS.customerA, appRole: 'customer' },
      `SELECT balance_minor FROM public.v_customer_balances WHERE shop_id = $1 AND customer_id = $2;`,
      [IDS.shopX, IDS.customerA]
    );
    expect(Number(balAfterFull[0].balance_minor)).toBe(0);
  });

  it('hides shops whose subscription is expired or suspended from customers, while owner and admin can still read them', async () => {
    // Admin suspends Shop Y
    await queryAsUser(
      db,
      { sub: IDS.admin, appRole: 'admin' },
      `SELECT * FROM public.admin_set_subscription($1::uuid, 'suspend', 'Policy check', NULL);`,
      [IDS.shopY]
    );

    // Customer A cannot see Shop Y
    const { rows: customerVisibleShops } = await queryAsUser(
      db,
      { sub: IDS.customerA, appRole: 'customer' },
      `SELECT id FROM public.shops WHERE id = $1;`,
      [IDS.shopY]
    );
    expect(customerVisibleShops).toHaveLength(0);

    // Shop Owner Y can still see their own shop
    const { rows: ownerVisibleShops } = await queryAsUser(
      db,
      { sub: IDS.shopOwnerY, appRole: 'shop_owner' },
      `SELECT id FROM public.shops WHERE id = $1;`,
      [IDS.shopY]
    );
    expect(ownerVisibleShops).toHaveLength(1);

    // Admin activates Shop Y -> Customer A sees it again
    await queryAsUser(
      db,
      { sub: IDS.admin, appRole: 'admin' },
      `SELECT * FROM public.admin_set_subscription($1::uuid, 'activate', 'Paid annual invoice', 'INV-2026');`,
      [IDS.shopY]
    );

    const { rows: customerVisibleAfterActivate } = await queryAsUser(
      db,
      { sub: IDS.customerA, appRole: 'customer' },
      `SELECT id FROM public.shops WHERE id = $1;`,
      [IDS.shopY]
    );
    expect(customerVisibleAfterActivate).toHaveLength(1);
  });

  it('compares TypeScript computeCartTotals against SQL place_order calculation on random carts (Section 9)', async () => {
    for (let round = 1; round <= 5; round++) {
      const q1 = Math.floor(Math.random() * 15) + 1;
      const q2 = Math.floor(Math.random() * 10) + 1;
      const tsTotals = computeCartTotals([
        { unit_price_minor: 14000, quantity: q1 },
        { unit_price_minor: 69000, quantity: q2 },
      ]);

      const orderId = `50000000-0000-4000-8000-00000000010${round}`;
      const { rows } = await queryAsUser(
        db,
        { sub: IDS.customerB, appRole: 'customer' },
        `SELECT subtotal_minor, delivery_fee_minor, total_minor
         FROM public.place_order($1::uuid, $2::uuid, $3::jsonb, 'pickup'::fulfilment_type, NULL, NULL, now(), NULL);`,
        [
          orderId,
          IDS.shopX,
          JSON.stringify([
            { product_id: IDS.prodX1, quantity: q1 },
            { product_id: IDS.prodX2, quantity: q2 },
          ]),
        ]
      );

      expect(Number(rows[0].subtotal_minor)).toBe(tsTotals.subtotal_minor);
      expect(Number(rows[0].delivery_fee_minor)).toBe(tsTotals.delivery_fee_minor);
      expect(Number(rows[0].total_minor)).toBe(tsTotals.total_minor);
    }
  });
});

