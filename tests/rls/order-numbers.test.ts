import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createInMemoryPostgres, queryAsUser } from '../../scripts/pg-engine';

// Build Plan §17.3: per-shop order numbers come from a row-locked counter,
// never from COUNT(*) + 1, and (shop_id, order_number) is unique.
describe('Per-shop order numbers (migration 0007)', () => {
  let db: PGlite;

  const IDS = {
    customer: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
    owner: 'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
    otherOwner: 'cccccccc-cccc-4ccc-8ccc-cccccccccc02',
    shop: '10000000-0000-4000-8000-0000000000a1',
    otherShop: '10000000-0000-4000-8000-0000000000a2',
    product: '30000000-0000-4000-8000-0000000000a1',
    otherProduct: '30000000-0000-4000-8000-0000000000a2',
  };

  const orderId = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  const placeOrder = async (id: string, shopId: string, productId: string) => {
    const res = await queryAsUser<{ order_number: string }>(
      db,
      { sub: IDS.customer, appRole: 'customer' },
      `SELECT order_number FROM public.place_order($1::uuid, $2::uuid, $3::jsonb, 'pickup'::fulfilment_type);`,
      [id, shopId, JSON.stringify([{ product_id: productId, quantity: 1 }])]
    );
    return res.rows[0].order_number;
  };

  beforeAll(async () => {
    db = await createInMemoryPostgres();
    await db.query(
      `INSERT INTO auth.users (id, email, phone, raw_user_meta_data, raw_app_meta_data) VALUES
         ($1, 'cust@test.et', '+251910000101', '{"full_name":"Customer","role":"customer"}', '{}'),
         ($2, 'owner@test.et', '+251910000102', '{"full_name":"Owner","role":"shop_owner"}', '{}'),
         ($3, 'owner2@test.et', '+251910000103', '{"full_name":"Owner 2","role":"shop_owner"}', '{}');`,
      [IDS.customer, IDS.owner, IDS.otherOwner]
    );
    for (const [owner, shop, product, slug] of [
      [IDS.owner, IDS.shop, IDS.product, 'counter-shop'],
      [IDS.otherOwner, IDS.otherShop, IDS.otherProduct, 'counter-shop-2'],
    ]) {
      await queryAsUser(
        db,
        { sub: owner, appRole: 'shop_owner' },
        `INSERT INTO public.shops (id, owner_id, market_code, name, slug, category, phone, address_text)
         VALUES ($1, $2, 'ET', $3, $3, 'grocery', '+251910000109', 'Bole');`,
        [shop, owner, slug]
      );
      await queryAsUser(
        db,
        { sub: owner, appRole: 'shop_owner' },
        `INSERT INTO public.products (id, shop_id, name, price_minor, unit, category, is_available)
         VALUES ($1, $2, 'Sugar 1kg', 14000, 'kg', 'Pantry', true);`,
        [product, shop]
      );
    }
  }, 90000);

  afterAll(async () => {
    await db.close();
  });

  it('continues after numbers inserted directly, as the seed scripts do', async () => {
    // Simulates scripts/seed.ts writing historical orders with explicit numbers.
    await db.query(
      `INSERT INTO public.orders (id, order_number, shop_id, customer_id, subtotal_minor, total_minor)
       VALUES ($1, 'SL-0007', $2, $3, 14000, 14000);`,
      [orderId(1), IDS.shop, IDS.customer]
    );
    expect(await placeOrder(orderId(2), IDS.shop, IDS.product)).toBe('SL-0008');
    expect(await placeOrder(orderId(3), IDS.shop, IDS.product)).toBe('SL-0009');
  });

  it('numbers each shop independently', async () => {
    expect(await placeOrder(orderId(4), IDS.otherShop, IDS.otherProduct)).toBe('SL-0001');
    expect(await placeOrder(orderId(5), IDS.shop, IDS.product)).toBe('SL-0010');
  });

  it('gives distinct numbers to orders submitted at the same time', async () => {
    const numbers = await Promise.all(
      [6, 7, 8, 9].map((n) => placeOrder(orderId(n), IDS.shop, IDS.product))
    );
    expect(new Set(numbers).size).toBe(numbers.length);
    expect([...numbers].sort()).toEqual(['SL-0011', 'SL-0012', 'SL-0013', 'SL-0014']);
  });

  it('does not consume a number when an idempotent retry returns the existing order', async () => {
    expect(await placeOrder(orderId(9), IDS.shop, IDS.product)).toMatch(/^SL-001[1-4]$/);
    const next = await placeOrder(orderId(10), IDS.otherShop, IDS.otherProduct);
    expect(next).toBe('SL-0002');
  });

  it('rejects a duplicate order number for the same shop', async () => {
    await expect(
      db.query(
        `INSERT INTO public.orders (id, order_number, shop_id, customer_id, subtotal_minor, total_minor)
         VALUES ($1, 'SL-0008', $2, $3, 14000, 14000);`,
        [orderId(99), IDS.shop, IDS.customer]
      )
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('keeps the counter table and allocator out of reach of app users', async () => {
    // Locally the table has no grant (permission denied); on hosted Supabase the
    // default grants apply and RLS with no policies returns nothing. Both are safe.
    const visibleRows = await queryAsUser(
      db,
      { sub: IDS.owner, appRole: 'shop_owner' },
      `SELECT * FROM public.shop_order_counters;`
    ).then(
      (r) => r.rows.length,
      (err: Error) => {
        expect(err.message).toMatch(/permission denied/i);
        return 0;
      }
    );
    expect(visibleRows).toBe(0);
    await expect(
      queryAsUser(
        db,
        { sub: IDS.customer, appRole: 'customer' },
        `SELECT public.next_shop_order_number($1::uuid);`,
        [IDS.shop]
      )
    ).rejects.toThrow(/permission denied/i);
  });
});
