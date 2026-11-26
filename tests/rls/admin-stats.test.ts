import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createInMemoryPostgres, queryAsUser } from '../../scripts/pg-engine';
import { ADMIN_STATS_SQL } from '../../supabase/functions/admin-stats/index';

// "Today" in admin KPIs is the shop's market day (Africa/Addis_Ababa for ET), not UTC.
describe('admin stats use the market day', () => {
  let db: PGlite;
  const customer = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab01';
  const owner = 'cccccccc-cccc-4ccc-8ccc-cccccccccb01';
  const shop = '10000000-0000-4000-8000-0000000000b1';

  beforeAll(async () => {
    db = await createInMemoryPostgres();
    await db.query(
      `INSERT INTO auth.users (id, email, phone, raw_user_meta_data, raw_app_meta_data) VALUES
         ($1, 'c@stats.et', '+251910000201', '{"full_name":"C","role":"customer"}', '{}'),
         ($2, 'o@stats.et', '+251910000202', '{"full_name":"O","role":"shop_owner"}', '{}');`,
      [customer, owner]
    );
    await queryAsUser(
      db,
      { sub: owner, appRole: 'shop_owner' },
      `INSERT INTO public.shops (id, owner_id, market_code, name, slug, category, phone, address_text)
       VALUES ($1, $2, 'ET', 'Stats Shop', 'stats-shop', 'grocery', '+251910000202', 'Bole');`,
      [shop, owner]
    );
    // Local midnight in Addis Ababa, expressed as a timestamptz.
    const midnight = `(date_trunc('day', now() AT TIME ZONE 'Africa/Addis_Ababa') AT TIME ZONE 'Africa/Addis_Ababa')`;
    await db.query(
      `INSERT INTO public.orders (id, order_number, shop_id, customer_id, status, subtotal_minor, total_minor, placed_at) VALUES
         ('50000000-0000-4000-8000-0000000000b1', 'SL-0001', $1, $2, 'accepted', 10000, 10000, ${midnight} + interval '5 minutes'),
         ('50000000-0000-4000-8000-0000000000b2', 'SL-0002', $1, $2, 'cancelled', 7000, 7000, ${midnight} + interval '10 minutes'),
         ('50000000-0000-4000-8000-0000000000b3', 'SL-0003', $1, $2, 'accepted', 5000, 5000, ${midnight} - interval '5 minutes');`,
      [shop, customer]
    );
  }, 90000);

  afterAll(async () => {
    await db.close();
  });

  it('counts orders after local midnight and excludes the previous local day', async () => {
    const { rows } = await db.query<{ stats: { orders_today: number; gmv_today_minor: number } }>(
      ADMIN_STATS_SQL
    );
    expect(Number(rows[0].stats.orders_today)).toBe(2);
    // Cancelled orders do not count toward GMV.
    expect(Number(rows[0].stats.gmv_today_minor)).toBe(10000);
  });
});
