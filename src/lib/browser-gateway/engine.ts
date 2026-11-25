import { PGlite, type PGliteInterface } from '@electric-sql/pglite';
import { PGliteWorker } from '@electric-sql/pglite/worker';
import { FULL_SCHEMA_AND_CONFIG_SQL } from './sql-bundle';
import { seedBrowserDemoDatabase } from './demo-seed';
import type { SessionUser } from '../supabase';
import type { LocaleCode } from '../database.types';

export interface RealtimePayload {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | 'RESET';
  record?: any;
}

interface JwtContext {
  sub?: string;
  role?: 'authenticated' | 'anon' | 'service_role';
  appRole?: 'customer' | 'shop_owner' | 'admin';
  email?: string;
}

const DB_NAME = 'idb://suklink-demo-pg-v1';
const REALTIME_CHANNEL_NAME = 'suklink-realtime-v1';

let dbInstance: PGliteInterface | null = null;
let dbInitPromise: Promise<PGliteInterface> | null = null;
let dbQueryMutex: Promise<any> = Promise.resolve();

const realtimeListeners = new Set<(event: RealtimePayload) => void>();
let broadcastChannel: BroadcastChannel | null = null;

function ensureBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(REALTIME_CHANNEL_NAME);
    broadcastChannel.onmessage = (evt) => {
      const payload = evt.data as RealtimePayload;
      if (payload && payload.table) {
        for (const listener of realtimeListeners) {
          try {
            listener(payload);
          } catch {
            // ignore listener error
          }
        }
      }
    };
  }
  return broadcastChannel;
}

export function subscribeBrowserRealtime(listener: (event: RealtimePayload) => void): () => void {
  ensureBroadcastChannel();
  realtimeListeners.add(listener);
  return () => {
    realtimeListeners.delete(listener);
  };
}

function broadcastRealtimeEvent(payload: RealtimePayload): void {
  const normalizedPayload: RealtimePayload = {
    ...payload,
    record: payload.record ? normalizeValue(payload.record) : undefined,
  };
  for (const listener of realtimeListeners) {
    try {
      listener(normalizedPayload);
    } catch {
      // ignore listener error
    }
  }
  try {
    ensureBroadcastChannel()?.postMessage(normalizedPayload);
  } catch {
    // ignore broadcast errors
  }
}

/**
 * Normalize PGlite result values so they match JSON-over-HTTP shapes:
 * - Date -> ISO string
 * - bigint or *_minor numeric strings -> number
 */
function normalizeValue(val: any, key?: string): any {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'bigint') return Number(val);
  if (Array.isArray(val)) return val.map((item) => normalizeValue(item));
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(val)) {
      out[k] = normalizeValue(val[k], k);
    }
    return out;
  }
  if (key && key.endsWith('_minor') && typeof val === 'string' && val !== '') {
    const n = Number(val);
    return Number.isNaN(n) ? val : n;
  }
  return val;
}

function normalizeRows<T = any>(rows: any[]): T[] {
  return rows.map((r) => normalizeValue(r)) as T[];
}

async function ensureSchemaAndSeedDirect(db: PGliteInterface): Promise<void> {
  let profileCount = 0;
  let schemaReady = false;
  try {
    const res = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM public.profiles;`
    );
    profileCount = Number(res.rows[0]?.count || 0);
    schemaReady = true;
  } catch {
    schemaReady = false;
  }

  if (!schemaReady) {
    await db.exec(FULL_SCHEMA_AND_CONFIG_SQL);
  }

  if (profileCount === 0) {
    await seedBrowserDemoDatabase(db);
  }
}

export async function getBrowserDb(): Promise<PGliteInterface> {
  if (dbInstance) return dbInstance;
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      ensureBroadcastChannel();

      // Prefer shared multi-tab PGliteWorker so Tab 1 (Customer) and Tab 2 (Shop/Admin)
      // share a single live PostgreSQL database with zero IndexedDB lock conflicts.
      if (typeof Worker !== 'undefined' && typeof navigator !== 'undefined' && 'locks' in navigator) {
        try {
          const workerInstance = new Worker(new URL('./pg-worker.ts', import.meta.url), {
            type: 'module',
          });
          const pgWorker = await PGliteWorker.create(workerInstance, {
            dataDir: DB_NAME,
            id: 'suklink-demo-pg-v1',
          });
          await pgWorker.waitReady;
          dbInstance = pgWorker;
          return pgWorker;
        } catch (err) {
          console.warn('[SukLink Demo] Falling back to direct PGlite instance:', err);
        }
      }

      // Direct fallback (e.g. if Worker/WebLocks unavailable)
      let directDb: PGlite;
      try {
        directDb = new PGlite(DB_NAME, { relaxedDurability: true });
        await directDb.waitReady;
      } catch {
        directDb = new PGlite();
        await directDb.waitReady;
      }
      await ensureSchemaAndSeedDirect(directDb);
      dbInstance = directDb;
      return directDb;
    })();
  }
  return dbInitPromise;
}

function getContextFromUser(user: SessionUser | null): JwtContext {
  if (!user) {
    return { role: 'anon' };
  }
  return {
    sub: user.id,
    role: 'authenticated',
    appRole: user.role,
    email: user.email || '',
  };
}

async function queryAsUser<T = Record<string, any>>(
  db: PGliteInterface,
  ctx: JwtContext,
  sql: string,
  params: any[] = []
): Promise<{ rows: T[] }> {
  const next = dbQueryMutex.then(async () => {
    const pgRole = ctx.role || (ctx.sub ? 'authenticated' : 'anon');
    const claims = ctx.sub
      ? JSON.stringify({
          sub: ctx.sub,
          role: pgRole,
          email: ctx.email || '',
          app_metadata: { role: ctx.appRole || 'customer' },
        })
      : '{}';

    return await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${pgRole};`);
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [ctx.sub || '']);
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true);`, [claims]);
      const res = await tx.query<T>(sql, params);
      return { rows: normalizeRows<T>(res.rows as any[]) };
    });
  });
  dbQueryMutex = next.catch(() => {});
  return next;
}

async function queryPrivileged<T = Record<string, any>>(
  db: PGliteInterface,
  sql: string,
  params: any[] = []
): Promise<{ rows: T[] }> {
  const next = dbQueryMutex.then(async () => {
    const res = await db.query<T>(sql, params);
    return { rows: normalizeRows<T>(res.rows as any[]) };
  });
  dbQueryMutex = next.catch(() => {});
  return next;
}

const ALLOWED_TABLES = new Set([
  'markets',
  'payment_methods',
  'shop_payment_methods',
  'app_settings',
  'profiles',
  'shops',
  'products',
  'plans',
  'subscriptions',
  'orders',
  'order_items',
  'order_events',
  'payments',
  'shop_customers',
  'ledger_entries',
  'notifications',
  'support_tickets',
  'audit_log',
  'v_customer_balances',
  'v_shop_sales_daily',
]);

export async function browserLogin(identifier: string, password: string): Promise<SessionUser> {
  const db = await getBrowserDb();
  const cleanId = String(identifier || '').trim().toLowerCase();
  const { rows } = await queryPrivileged<any>(
    db,
    `SELECT u.id, u.email, u.phone, u.encrypted_password, p.role, p.full_name, p.locale, p.market_code, p.avatar_url, p.default_address, p.is_disabled
     FROM auth.users u
     JOIN public.profiles p ON p.id = u.id
     WHERE lower(u.email) = $1 OR u.phone = $2
     LIMIT 1;`,
    [cleanId, String(identifier || '').trim()]
  );
  const user = rows[0];
  if (!user || (user.encrypted_password && user.encrypted_password !== password)) {
    throw new Error('INVALID_CREDENTIALS');
  }
  if (user.is_disabled) {
    throw new Error('ACCOUNT_DISABLED');
  }
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    full_name: user.full_name,
    locale: user.locale,
    market_code: user.market_code,
    avatar_url: user.avatar_url,
    default_address: user.default_address,
  };
}

export async function browserRegister(input: {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  role: 'customer' | 'shop_owner';
  market_code: string;
  locale: LocaleCode;
}): Promise<SessionUser> {
  if ((input.role as string) === 'admin') {
    throw new Error('FORBIDDEN_ROLE_ASSIGNMENT');
  }
  const db = await getBrowserDb();
  const id = crypto.randomUUID();
  await queryPrivileged(
    db,
    `INSERT INTO auth.users (id, email, phone, encrypted_password, raw_user_meta_data, raw_app_meta_data)
     VALUES ($1, $2, $3, $4, $5::jsonb, '{}'::jsonb);`,
    [
      id,
      input.email ? String(input.email).trim().toLowerCase() : null,
      input.phone ? String(input.phone).trim() : null,
      input.password,
      JSON.stringify({
        full_name: input.full_name,
        role: input.role || 'customer',
        market_code: input.market_code || 'ET',
        locale: input.locale || 'en',
      }),
    ]
  );
  const { rows } = await queryPrivileged<any>(
    db,
    `SELECT id, email, phone, role, full_name, locale, market_code, avatar_url, default_address
     FROM public.profiles WHERE id = $1;`,
    [id]
  );
  broadcastRealtimeEvent({ table: 'profiles', eventType: 'INSERT', record: rows[0] });
  return rows[0] as SessionUser;
}

export async function browserFetchTable<T = any>(
  table: string,
  since: string | undefined,
  user: SessionUser | null
): Promise<T[]> {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error('INVALID_TABLE');
  }
  const db = await getBrowserDb();
  const ctx = getContextFromUser(user);
  let sql = `SELECT * FROM public.${table}`;
  const params: any[] = [];
  if (since && !table.startsWith('v_') && table !== 'audit_log') {
    sql += ` WHERE updated_at >= $1::timestamptz`;
    params.push(since);
  }
  const { rows } = await queryAsUser<T>(db, ctx, sql, params);
  return rows;
}

export async function browserUpsertRow<T = any>(
  table: string,
  row: Record<string, any>,
  user: SessionUser | null
): Promise<T> {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error('INVALID_TABLE');
  }
  const db = await getBrowserDb();
  const ctx = getContextFromUser(user);
  const cols = Object.keys(row).filter((k) => !k.startsWith('_'));
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = cols
    .filter((c) => c !== 'id' && c !== 'code' && c !== 'key')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  const conflictCol =
    table === 'markets'
      ? 'code'
      : table === 'app_settings'
        ? 'key'
        : table === 'shop_payment_methods'
          ? 'shop_id, method_code'
          : 'id';

  const sql = updates
    ? `INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${placeholders})
       ON CONFLICT (${conflictCol}) DO UPDATE SET ${updates}
       RETURNING *;`
    : `INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *;`;

  const { rows } = await queryAsUser<T>(
    db,
    ctx,
    sql,
    cols.map((c) => row[c])
  );

  if (
    ctx.appRole === 'admin' &&
    ['markets', 'payment_methods', 'plans', 'app_settings', 'profiles'].includes(table)
  ) {
    await queryPrivileged(
      db,
      `INSERT INTO public.audit_log (actor_id, action, entity, entity_id, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb);`,
      [
        ctx.sub,
        `upsert_${table}`,
        table,
        String(row.id || row.code || row.key || ''),
        JSON.stringify(row),
      ]
    );
  }

  broadcastRealtimeEvent({ table, eventType: 'INSERT', record: rows[0] });
  return rows[0];
}

export async function browserUpdateRow<T = any>(
  table: string,
  patch: Record<string, any>,
  matchCol: string,
  user: SessionUser | null
): Promise<T> {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error('INVALID_TABLE');
  }
  const db = await getBrowserDb();
  const ctx = getContextFromUser(user);
  const matchVal = patch[matchCol];
  const cols = Object.keys(patch).filter((k) => !k.startsWith('_') && k !== matchCol);
  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const sql = `UPDATE public.${table} SET ${setClause} WHERE ${matchCol} = $${cols.length + 1} RETURNING *;`;
  const { rows } = await queryAsUser<T>(db, ctx, sql, [...cols.map((c) => patch[c]), matchVal]);

  if (
    ctx.appRole === 'admin' &&
    ['markets', 'payment_methods', 'plans', 'app_settings', 'profiles', 'support_tickets'].includes(table)
  ) {
    await queryPrivileged(
      db,
      `INSERT INTO public.audit_log (actor_id, action, entity, entity_id, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb);`,
      [ctx.sub, `update_${table}`, table, String(matchVal), JSON.stringify(patch)]
    );
  }

  broadcastRealtimeEvent({ table, eventType: 'UPDATE', record: rows[0] });
  return rows[0];
}

export async function browserCallRpc<T = any>(
  fnName: string,
  args: Record<string, any>,
  user: SessionUser | null
): Promise<T> {
  const db = await getBrowserDb();
  const ctx = getContextFromUser(user);

  if (fnName === 'place_order') {
    const { rows } = await queryAsUser<any>(
      db,
      ctx,
      `SELECT * FROM public.place_order($1::uuid, $2::uuid, $3::jsonb, $4::fulfilment_type, $5, $6, $7::timestamptz, $8::bigint, $9);`,
      [
        args.p_order_id,
        args.p_shop_id,
        JSON.stringify(args.p_items),
        args.p_fulfilment || 'pickup',
        args.p_address || null,
        args.p_note || null,
        args.p_client_created_at || new Date().toISOString(),
        args.p_expected_total_minor ?? null,
        args.p_preferred_payment_method || null,
      ]
    );
    broadcastRealtimeEvent({ table: 'orders', eventType: 'INSERT', record: rows[0] });
    broadcastRealtimeEvent({ table: 'order_items', eventType: 'INSERT' });
    broadcastRealtimeEvent({ table: 'order_events', eventType: 'INSERT' });
    broadcastRealtimeEvent({ table: 'notifications', eventType: 'INSERT' });
    return rows[0] as T;
  }

  if (fnName === 'update_order_status') {
    const { rows } = await queryAsUser<any>(
      db,
      ctx,
      `SELECT * FROM public.update_order_status($1::uuid, $2::order_status, $3);`,
      [args.p_order_id, args.p_to_status, args.p_reason || null]
    );
    broadcastRealtimeEvent({ table: 'orders', eventType: 'UPDATE', record: rows[0] });
    broadcastRealtimeEvent({ table: 'order_events', eventType: 'INSERT' });
    broadcastRealtimeEvent({ table: 'ledger_entries', eventType: 'INSERT' });
    broadcastRealtimeEvent({ table: 'notifications', eventType: 'INSERT' });
    return rows[0] as T;
  }

  if (fnName === 'record_payment') {
    const { rows } = await queryAsUser<any>(
      db,
      ctx,
      `SELECT * FROM public.record_payment($1, $2::uuid, $3::uuid, $4::uuid, $5::bigint, $6, $7);`,
      [
        args.p_idempotency_key,
        args.p_shop_id,
        args.p_customer_id,
        args.p_order_id || null,
        args.p_amount_minor,
        args.p_method || 'cash',
        args.p_note || null,
      ]
    );
    broadcastRealtimeEvent({ table: 'payments', eventType: 'INSERT', record: rows[0] });
    broadcastRealtimeEvent({ table: 'ledger_entries', eventType: 'INSERT' });
    broadcastRealtimeEvent({ table: 'orders', eventType: 'UPDATE' });
    return rows[0] as T;
  }

  if (fnName === 'set_order_on_credit') {
    const { rows } = await queryAsUser<any>(
      db,
      ctx,
      `SELECT * FROM public.set_order_on_credit($1::uuid);`,
      [args.p_order_id]
    );
    broadcastRealtimeEvent({ table: 'orders', eventType: 'UPDATE', record: rows[0] });
    return rows[0] as T;
  }

  if (fnName === 'admin_set_subscription') {
    const { rows } = await queryAsUser<any>(
      db,
      ctx,
      `SELECT * FROM public.admin_set_subscription($1::uuid, $2, $3, $4);`,
      [args.p_shop_id, args.p_action, args.p_reason, args.p_reference || null]
    );
    broadcastRealtimeEvent({ table: 'subscriptions', eventType: 'UPDATE', record: rows[0] });
    broadcastRealtimeEvent({ table: 'shops', eventType: 'UPDATE' });
    return rows[0] as T;
  }

  if (fnName === 'mark_notifications_read') {
    const { rows } = await queryAsUser<any>(
      db,
      ctx,
      `SELECT public.mark_notifications_read($1::uuid[]) AS count;`,
      [args.p_ids || []]
    );
    return (rows[0]?.count ?? 0) as T;
  }

  if (fnName === 'run_scheduled_reminders') {
    const { rows } = await queryAsUser<any>(
      db,
      ctx,
      `SELECT public.run_scheduled_reminders() AS result;`
    );
    return rows[0]?.result as T;
  }

  throw new Error(`UNKNOWN_RPC_${fnName.toUpperCase()}`);
}

export async function browserInitPayment(
  input: {
    purpose: 'order' | 'subscription';
    order_id?: string | null;
    subscription_id?: string | null;
    shop_id: string;
    method_code: string;
    idempotency_key: string;
  },
  user: SessionUser | null
): Promise<{ payment: any; checkoutUrl: string }> {
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }
  const db = await getBrowserDb();

  const { rows: existing } = await queryPrivileged<any>(
    db,
    `SELECT * FROM public.payments WHERE idempotency_key = $1;`,
    [input.idempotency_key]
  );
  if (existing[0]) {
    return {
      payment: existing[0],
      checkoutUrl: `/pay/demo/${existing[0].id}?method=${encodeURIComponent(existing[0].method_code)}`,
    };
  }

  let amountMinor = 0;
  let currencyCode = 'ETB';
  let shopId = input.shop_id;
  const orderId = input.order_id || null;
  let subscriptionId = input.subscription_id || null;

  if (input.purpose === 'subscription') {
    const { rows: subs } = await queryPrivileged<any>(
      db,
      `SELECT s.*, p.price_minor, p.currency_code
       FROM public.subscriptions s
       JOIN public.plans p ON p.id = s.plan_id
       WHERE s.shop_id = $1;`,
      [shopId]
    );
    if (!subs[0]) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }
    subscriptionId = subs[0].id;
    amountMinor = Number(subs[0].price_minor);
    currencyCode = subs[0].currency_code;
  } else {
    const { rows: orders } = await queryPrivileged<any>(
      db,
      `SELECT * FROM public.orders WHERE id = $1;`,
      [orderId]
    );
    if (!orders[0]) {
      throw new Error('ORDER_NOT_FOUND');
    }
    if (orders[0].status === 'pending') {
      throw new Error('CANNOT_PAY_PENDING_ORDER');
    }
    shopId = orders[0].shop_id;
    amountMinor = Number(orders[0].total_minor);
    currencyCode = orders[0].currency_code;
  }

  const paymentId = crypto.randomUUID();
  const providerRef = `DEMO-${paymentId.slice(0, 8).toUpperCase()}`;

  const { rows: inserted } = await queryPrivileged<any>(
    db,
    `INSERT INTO public.payments (
      id, purpose, order_id, subscription_id, shop_id, payer_id,
      amount_minor, currency_code, method_code, provider, provider_ref,
      status, idempotency_key
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'demo', $10, 'pending', $11)
    RETURNING *;`,
    [
      paymentId,
      input.purpose || 'order',
      orderId,
      subscriptionId,
      shopId,
      user.id,
      amountMinor,
      currencyCode,
      input.method_code || 'chapa',
      providerRef,
      input.idempotency_key,
    ]
  );

  broadcastRealtimeEvent({ table: 'payments', eventType: 'INSERT', record: inserted[0] });
  return {
    payment: inserted[0],
    checkoutUrl: `/pay/demo/${paymentId}?method=${encodeURIComponent(input.method_code || 'chapa')}`,
  };
}

export async function browserConfirmDemoPayment(
  paymentId: string,
  decision: 'approve' | 'decline'
): Promise<any> {
  const db = await getBrowserDb();
  const status = decision === 'approve' ? 'succeeded' : 'failed';
  const { rows: current } = await queryPrivileged<any>(
    db,
    `SELECT * FROM public.payments WHERE id = $1;`,
    [paymentId]
  );
  if (!current[0]) {
    throw new Error('PAYMENT_NOT_FOUND');
  }
  const { rows: updated } = await queryPrivileged<any>(
    db,
    `SELECT * FROM public.complete_online_payment($1::uuid, $2, $3::payment_tx_status);`,
    [paymentId, current[0].provider_ref || `DEMO-${paymentId.slice(0, 8)}`, status]
  );
  broadcastRealtimeEvent({ table: 'payments', eventType: 'UPDATE', record: updated[0] });
  broadcastRealtimeEvent({ table: 'orders', eventType: 'UPDATE' });
  broadcastRealtimeEvent({ table: 'ledger_entries', eventType: 'INSERT' });
  broadcastRealtimeEvent({ table: 'subscriptions', eventType: 'UPDATE' });
  return updated[0];
}

export async function browserFetchAdminStats(user: SessionUser | null): Promise<any> {
  const db = await getBrowserDb();
  const ctx = getContextFromUser(user);
  const { rows } = await queryAsUser<any>(
    db,
    ctx,
    `SELECT jsonb_build_object(
      'customers_count', (SELECT COUNT(*) FROM public.profiles WHERE role = 'customer'),
      'shop_owners_count', (SELECT COUNT(*) FROM public.profiles WHERE role = 'shop_owner'),
      'admins_count', (SELECT COUNT(*) FROM public.profiles WHERE role = 'admin'),
      'shops_count', (SELECT COUNT(*) FROM public.shops WHERE deleted_at IS NULL),
      'active_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active'),
      'trial_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'trial'),
      'expired_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status IN ('expired', 'suspended')),
      'orders_today', (SELECT COUNT(*) FROM public.orders WHERE placed_at >= date_trunc('day', now())),
      'gmv_today_minor', COALESCE((
        SELECT SUM(total_minor)
        FROM public.orders
        WHERE placed_at >= date_trunc('day', now())
          AND status NOT IN ('rejected', 'cancelled')
      ), 0)
    ) AS stats;`
  );
  return rows[0]?.stats || {};
}

export async function resetBrowserDemoDatabase(): Promise<void> {
  const db = await getBrowserDb();
  const next = dbQueryMutex.then(async () => {
    await db.exec(`
      DELETE FROM public.notifications;
      DELETE FROM public.support_tickets;
      DELETE FROM public.audit_log;
      DELETE FROM public.ledger_entries;
      DELETE FROM public.payments;
      DELETE FROM public.order_events;
      DELETE FROM public.order_items;
      DELETE FROM public.orders;
      DELETE FROM public.shop_customers;
      DELETE FROM public.products;
      DELETE FROM public.shop_payment_methods;
      DELETE FROM public.subscriptions;
      DELETE FROM public.shops;
      DELETE FROM public.profiles;
      DELETE FROM auth.users;
    `);
    await db.exec(FULL_SCHEMA_AND_CONFIG_SQL);
    await seedBrowserDemoDatabase(db);
  });
  dbQueryMutex = next.catch(() => {});
  await next;
  broadcastRealtimeEvent({ table: 'reset', eventType: 'RESET' });
}
