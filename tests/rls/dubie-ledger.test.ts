import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  createInMemoryPostgres,
  applyMigrationsAndSeedSql,
  queryAsUser,
  type JwtContext,
} from '../../scripts/pg-engine';

// Build Plan §17.1 (walk-ins, manual credit), §17.2 (balance payments, allocation),
// §17.6 (ledger invariants) and the payment-path security fixes in migration 0008.
describe('Dubie book: walk-ins, allocation and payment security (migration 0008)', () => {
  let db: PGlite;

  const U = {
    owner: 'cccccccc-cccc-4ccc-8ccc-cccccccccd01',
    otherOwner: 'cccccccc-cccc-4ccc-8ccc-cccccccccd02',
    cust: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaad01',
    otherCust: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaad02',
  };
  const SHOP = '10000000-0000-4000-8000-0000000000d1';
  const OTHER_SHOP = '10000000-0000-4000-8000-0000000000d2';
  const PRODUCT = '30000000-0000-4000-8000-0000000000d1'; // Br 100.00

  const owner: JwtContext = { sub: U.owner, appRole: 'shop_owner' };
  const otherOwner: JwtContext = { sub: U.otherOwner, appRole: 'shop_owner' };
  const cust: JwtContext = { sub: U.cust, appRole: 'customer' };
  const otherCust: JwtContext = { sub: U.otherCust, appRole: 'customer' };

  const rpc = async <T = any>(ctx: JwtContext, sql: string, params: unknown[] = []) =>
    (await queryAsUser<T>(db, ctx, sql, params)).rows[0];

  const addWalkIn = (ctx: JwtContext, id: string, name: string, phone: string | null, limit: number | null) =>
    rpc(ctx, `SELECT * FROM public.add_walk_in_customer($1::uuid, $2::uuid, $3, $4, $5::bigint);`, [
      id, SHOP, name, phone, limit,
    ]);
  const charge = (ctx: JwtContext, key: string, scId: string, amount: number, note = 'Oil 3L') =>
    rpc(ctx, `SELECT * FROM public.record_manual_charge($1, $2::uuid, $3::bigint, $4);`, [key, scId, amount, note]);
  const pay = (ctx: JwtContext, key: string, scId: string, amount: number, orderId: string | null = null) =>
    rpc(ctx, `SELECT * FROM public.record_customer_payment($1, $2::uuid, $3::bigint, 'cash', NULL, $4::uuid);`, [
      key, scId, amount, orderId,
    ]);
  const balance = async (scId: string) =>
    Number((await db.query<{ b: string }>(`SELECT public.shop_customer_balance($1::uuid) AS b;`, [scId])).rows[0].b);
  const status = async (orderId: string) =>
    (await db.query<{ s: string }>(`SELECT payment_status AS s FROM public.orders WHERE id = $1;`, [orderId])).rows[0].s;

  // Places and accepts an order of `qty` × Br 100 for the app customer.
  const acceptedOrder = async (qty: number) => {
    // Test fixture: age earlier orders so the real 10-orders-per-minute limit does not trip.
    await db.query(`UPDATE public.orders SET created_at = created_at - interval '2 minutes' WHERE customer_id = $1;`, [U.cust]);
    const id = randomUUID();
    await rpc(cust, `SELECT * FROM public.place_order($1::uuid, $2::uuid, $3::jsonb, 'pickup'::fulfilment_type);`, [
      id, SHOP, JSON.stringify([{ product_id: PRODUCT, quantity: qty }]),
    ]);
    await rpc(owner, `SELECT * FROM public.update_order_status($1::uuid, 'accepted'::order_status, NULL);`, [id]);
    return id;
  };
  let appScId = '';

  beforeAll(async () => {
    db = await createInMemoryPostgres();
    await db.query(
      `INSERT INTO auth.users (id, email, phone, raw_user_meta_data, raw_app_meta_data) VALUES
         ($1, 'o@dubie.et', '+251911000001', '{"full_name":"Owner","role":"shop_owner"}', '{}'),
         ($2, 'o2@dubie.et', '+251911000002', '{"full_name":"Owner 2","role":"shop_owner"}', '{}'),
         ($3, 'c@dubie.et', '+251911000003', '{"full_name":"Dawit","role":"customer"}', '{}'),
         ($4, 'c2@dubie.et', '+251911000004', '{"full_name":"Selam","role":"customer"}', '{}');`,
      [U.owner, U.otherOwner, U.cust, U.otherCust]
    );
    await queryAsUser(db, owner,
      `INSERT INTO public.shops (id, owner_id, market_code, name, slug, category, phone, address_text, accepts_credit)
       VALUES ($1, $2, 'ET', 'Dubie Shop', 'dubie-shop', 'grocery', '+251911000001', 'Bole', true);`, [SHOP, U.owner]);
    await queryAsUser(db, otherOwner,
      `INSERT INTO public.shops (id, owner_id, market_code, name, slug, category, phone, address_text)
       VALUES ($1, $2, 'ET', 'Other Shop', 'other-shop', 'grocery', '+251911000002', 'Piassa');`, [OTHER_SHOP, U.otherOwner]);
    await queryAsUser(db, owner,
      `INSERT INTO public.products (id, shop_id, name, price_minor, unit, category, is_available)
       VALUES ($1, $2, 'Sugar 1kg', 10000, 'kg', 'Pantry', true);`, [PRODUCT, SHOP]);
  }, 90000);

  afterAll(async () => {
    await db.close();
  });

  it('can re-run every migration on a live database (browser demo reset)', async () => {
    await expect(applyMigrationsAndSeedSql(db)).resolves.toBeUndefined();
  });

  describe('walk-in customers', () => {
    const kebede = randomUUID();

    it('lets the owner add a walk-in, normalising a local phone number', async () => {
      const row = await addWalkIn(owner, kebede, '  Ato Kebede ', '0911 22 33 44', 150000);
      expect(row.customer_id).toBeNull();
      expect(row.display_name).toBe('Ato Kebede');
      expect(row.phone).toBe('+251911223344');
      // Retried outbox call returns the same row.
      expect((await addWalkIn(owner, kebede, 'Ato Kebede', '0911223344', 150000)).id).toBe(kebede);
    });

    it('rejects a duplicate phone, a bad phone, and other shops', async () => {
      await expect(addWalkIn(owner, randomUUID(), 'Dup', '+251911223344', null)).rejects.toThrow(/CUSTOMER_PHONE_EXISTS/);
      await expect(addWalkIn(owner, randomUUID(), 'Bad', '12345', null)).rejects.toThrow(/INVALID_PHONE/);
      await expect(addWalkIn(owner, randomUUID(), 'App user phone', '+251911000003', null)).resolves.toBeTruthy();
      await expect(addWalkIn(otherOwner, randomUUID(), 'Intruder', null, null)).rejects.toThrow(/FORBIDDEN/);
      await expect(addWalkIn(cust, randomUUID(), 'Customer', null, null)).rejects.toThrow(/FORBIDDEN/);
    });

    it('records goods on credit idempotently and enforces the credit limit', async () => {
      const first = await charge(owner, 'charge-kebede-1', kebede, 45000);
      const retry = await charge(owner, 'charge-kebede-1', kebede, 45000);
      expect(retry.id).toBe(first.id);
      expect(await balance(kebede)).toBe(45000);
      await charge(owner, 'charge-kebede-2', kebede, 100000); // 1,450 of 1,500
      await expect(charge(owner, 'charge-kebede-3', kebede, 10000)).rejects.toThrow(/CREDIT_LIMIT_EXCEEDED/);
      await expect(charge(otherOwner, 'charge-intruder', kebede, 100)).rejects.toThrow(/FORBIDDEN/);
    });

    it('takes cash payments up to the balance and clears a kept promise', async () => {
      await rpc(owner, `SELECT * FROM public.update_shop_customer($1::uuid, $2::jsonb);`, [
        kebede, JSON.stringify({ promised_pay_at: '2026-11-29' }),
      ]);
      await expect(pay(owner, 'pay-kebede-too-much', kebede, 999999)).rejects.toThrow(/AMOUNT_EXCEEDS_OUTSTANDING/);
      const p = await pay(owner, 'pay-kebede-1', kebede, 145000);
      expect(p.purpose).toBe('balance');
      expect(p.payer_id).toBeNull();
      expect(await balance(kebede)).toBe(0);
      const sc = (await db.query<any>(`SELECT promised_pay_at FROM public.shop_customers WHERE id = $1;`, [kebede])).rows[0];
      expect(sc.promised_pay_at).toBeNull();
    });

    it('keeps walk-ins private to their shop', async () => {
      const seenByOther = await queryAsUser(db, otherOwner, `SELECT id FROM public.shop_customers WHERE id = $1;`, [kebede]);
      const seenByCustomer = await queryAsUser(db, cust, `SELECT id FROM public.ledger_entries WHERE shop_customer_id = $1;`, [kebede]);
      expect(seenByOther.rows).toHaveLength(0);
      expect(seenByCustomer.rows).toHaveLength(0);
    });

    it('never lets a ledger row point at another shop\'s customer', async () => {
      await expect(
        db.query(
          `INSERT INTO public.ledger_entries (shop_id, shop_customer_id, type, amount_minor, description, created_by)
           VALUES ($1, $2, 'charge', 100, 'cross-tenant', $3);`,
          [OTHER_SHOP, kebede, U.otherOwner]
        )
      ).rejects.toThrow(/SHOP_CUSTOMER_MISMATCH/);
    });

    it('does not let an owner move a customer to another account', async () => {
      await expect(
        queryAsUser(db, owner, `UPDATE public.shop_customers SET customer_id = $2 WHERE id = $1;`, [kebede, U.otherCust])
      ).rejects.toThrow(/SHOP_CUSTOMER_IDENTITY_IMMUTABLE/);
    });
  });

  describe('allocation of balance payments (§17.2)', () => {
    let older = '';
    let newer = '';

    beforeAll(async () => {
      older = await acceptedOrder(3); // Br 300
      newer = await acceptedOrder(2); // Br 200
      appScId = (await db.query<{ id: string }>(
        `SELECT id FROM public.shop_customers WHERE shop_id = $1 AND customer_id = $2;`, [SHOP, U.cust]
      )).rows[0].id;
    });

    it('applies a payment without an order to the oldest charge first', async () => {
      await pay(owner, 'alloc-1', appScId, 10000);
      expect(await status(older)).toBe('partially_paid');
      expect(await status(newer)).toBe('unpaid');

      await pay(owner, 'alloc-2', appScId, 25000); // older fully paid, Br 50 left for newer
      expect(await status(older)).toBe('paid');
      expect(await status(newer)).toBe('partially_paid');
      expect(await balance(appScId)).toBe(15000);
    });

    it('moves allocated credit to the next order when an order is cancelled', async () => {
      const third = await acceptedOrder(1); // Br 100, unpaid
      await rpc(owner, `SELECT * FROM public.update_order_status($1::uuid, 'cancelled'::order_status, 'Out of stock');`, [older]);
      // Br 350 of general credit now covers newer (200) and third (100), with Br 50 spare.
      expect(await status(newer)).toBe('paid');
      expect(await status(third)).toBe('paid');
      expect(await balance(appScId)).toBe(-5000);
    });
  });

  describe('online payments', () => {
    it('refuses to settle a payment from an app session', async () => {
      await expect(
        queryAsUser(db, cust, `SELECT * FROM public.complete_online_payment(gen_random_uuid(), 'x', 'succeeded');`)
      ).rejects.toThrow(/permission denied/i);
    });

    it('only starts a payment for the caller\'s own order, for the amount still due', async () => {
      const order = await acceptedOrder(4); // Br 400 (the Br 50 credit applies first)
      await expect(
        rpc(otherCust, `SELECT * FROM public.init_payment('order', $1::uuid, $2::uuid, NULL, 'chapa', $3, 'demo');`, [
          SHOP, order, 'init-intruder-1',
        ])
      ).rejects.toThrow(/ORDER_NOT_FOUND/);

      const p = await rpc(cust, `SELECT * FROM public.init_payment('order', $1::uuid, $2::uuid, 999999999, 'chapa', $3, 'demo');`, [
        SHOP, order, 'init-own-1',
      ]);
      expect(Number(p.amount_minor)).toBe(35000);
      expect(p.status).toBe('pending');
    });

    it('lets a customer pay part of their balance and allocates it on settlement', async () => {
      const due = await balance(appScId); // Br 350
      await expect(
        rpc(cust, `SELECT * FROM public.init_payment('balance', $1::uuid, NULL, $2::bigint, 'telebirr', $3, 'demo');`, [
          SHOP, due + 1, 'init-balance-too-much',
        ])
      ).rejects.toThrow(/AMOUNT_EXCEEDS_OUTSTANDING/);

      const p = await rpc(cust, `SELECT * FROM public.init_payment('balance', $1::uuid, NULL, 20000, 'telebirr', $2, 'demo');`, [
        SHOP, 'init-balance-1',
      ]);
      expect(p.purpose).toBe('balance');
      expect(p.shop_customer_id).toBe(appScId);
      await db.query(`SELECT public.complete_online_payment($1::uuid, 'DEMO-REF', 'succeeded');`, [p.id]);
      expect(await balance(appScId)).toBe(due - 20000);
    });

    it('does not let one customer read another customer\'s balances through the view', async () => {
      const rows = await queryAsUser<{ customer_id: string | null }>(db, otherCust, `SELECT customer_id FROM public.v_customer_balances;`);
      expect(rows.rows.every((r) => r.customer_id === U.otherCust)).toBe(true);
    });
  });

  it('keeps ledger invariants over a random sequence of operations (§17.6)', async () => {
    // Deterministic PRNG so a failure is reproducible.
    let seed = 20261126;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const walkIn = randomUUID();
    await addWalkIn(owner, walkIn, 'Random walk-in', null, null);
    const orders: string[] = [];

    for (let step = 0; step < 40; step++) {
      const op = rand(5);
      const key = `invariant-${step}`;
      try {
        if (op === 0) orders.push(await acceptedOrder(1 + rand(3)));
        else if (op === 1) await charge(owner, key, walkIn, 1000 * (1 + rand(20)));
        else if (op === 2) await pay(owner, key, rand(2) ? walkIn : appScId, 1000 * (1 + rand(30)));
        else if (op === 3 && orders.length) {
          await rpc(owner, `SELECT * FROM public.update_order_status($1::uuid, 'cancelled'::order_status, 'random');`, [
            orders[rand(orders.length)],
          ]);
        } else await pay(owner, key, appScId, 1000 * (1 + rand(10))); // exercise retry below
        if (op === 2 || op === 4) await pay(owner, key, op === 2 ? walkIn : appScId, 1).catch(() => {});
      } catch (err) {
        // Business rule rejections are expected (overpayment, invalid transition).
        expect(String(err)).toMatch(/AMOUNT_EXCEEDS_OUTSTANDING|INVALID_TRANSITION|IDEMPOTENCY_KEY_CONFLICT/);
      }
    }

    const { rows } = await db.query<any>(`
      SELECT
        (SELECT COUNT(*) FROM public.ledger_entries WHERE shop_customer_id IS NULL) AS orphan_entries,
        (SELECT COUNT(*) FROM public.ledger_entries le JOIN public.shop_customers sc ON sc.id = le.shop_customer_id
          WHERE sc.shop_id <> le.shop_id) AS cross_shop_entries,
        (SELECT COUNT(*) FROM public.payments p WHERE p.status = 'succeeded' AND p.purpose::text <> 'subscription'
          AND NOT EXISTS (SELECT 1 FROM public.ledger_entries le WHERE le.payment_id = p.id)) AS payments_without_entry,
        (SELECT COUNT(*) FROM (SELECT payment_id FROM public.ledger_entries WHERE payment_id IS NOT NULL
          GROUP BY payment_id HAVING COUNT(*) > 1) d) AS double_entries,
        (SELECT COUNT(*) FROM (SELECT order_id FROM public.ledger_entries WHERE type = 'charge' AND order_id IS NOT NULL
          GROUP BY order_id HAVING COUNT(*) > 1) d) AS double_charges;
    `);
    expect(rows[0]).toEqual({
      orphan_entries: 0, cross_shop_entries: 0, payments_without_entry: 0, double_entries: 0, double_charges: 0,
    });

    // Every live order's status matches the allocation, and no customer was overpaid
    // by a shop-recorded payment beyond what earlier cancellations explain.
    for (const scId of [appScId, walkIn]) {
      const alloc = await db.query<any>(`SELECT * FROM public.shop_customer_allocation($1::uuid);`, [scId]);
      for (const a of alloc.rows) {
        const s = await status(a.alloc_order_id);
        const paid = Number(a.alloc_paid_minor);
        const total = Number(a.alloc_total_minor);
        if (paid >= total) expect(s).toBe('paid');
        else if (paid > 0) expect(s).toBe('partially_paid');
        else expect(['unpaid', 'on_credit']).toContain(s);
      }
    }
    expect(await balance(walkIn)).toBeGreaterThanOrEqual(0);
  });
});
