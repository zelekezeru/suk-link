import http from 'http';
import { PGlite } from '@electric-sql/pglite';
import { openPersistentPostgres, queryAsUser, type JwtContext } from './pg-engine';
import { seedDatabase } from './seed';

let pgInstance: PGlite | null = null;
let pgInitPromise: Promise<PGlite> | null = null;
let pgMutex: Promise<any> = Promise.resolve();
const sseClients = new Set<http.ServerResponse>();

export async function getGatewayDb(): Promise<PGlite> {
  if (pgInstance) return pgInstance;
  if (!pgInitPromise) {
    pgInitPromise = (async () => {
      // Run gateway in an in-memory Postgres instance seeded with the full demo dataset
      // so every table query completes in <2ms without filesystem fsync latency
      const db = await openPersistentPostgres(false, true);
      const { rows } = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.profiles;`
      );
      if (Number(rows[0]?.count || 0) === 0) {
        await seedDatabase(db);
      }
      pgInstance = db;
      return db;
    })();
  }
  return pgInitPromise;
}

export function withDbLock<T>(fn: (db: PGlite) => Promise<T>): Promise<T> {
  const next = pgMutex.then(async () => {
    const db = await getGatewayDb();
    return fn(db);
  });
  pgMutex = next.catch(() => {});
  return next;
}

export function broadcastRealtimeEvent(payload: {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  record?: any;
}) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-user-role, x-user-email',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function getUserContextFromHeaders(req: http.IncomingMessage): JwtContext {
  const userId = (req.headers['x-user-id'] as string) || '';
  const userRole = (req.headers['x-user-role'] as any) || 'customer';
  const userEmail = (req.headers['x-user-email'] as string) || '';
  if (!userId) {
    return { role: 'anon' };
  }
  return {
    sub: userId,
    role: 'authenticated',
    appRole: userRole,
    email: userEmail,
  };
}

export async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<boolean> {
  const urlObj = new URL(req.url || '/', 'http://localhost:5173');
  if (!urlObj.pathname.startsWith('/api/')) {
    return false;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return true;
  }

  const db = await getGatewayDb();
  const ctx = getUserContextFromHeaders(req);

  try {
    // 1. Realtime SSE stream
    if (urlObj.pathname === '/api/realtime') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return true;
    }

    // 2. Auth endpoints: /api/auth/login, /api/auth/register, /api/auth/reset
    if (urlObj.pathname === '/api/auth/login' && req.method === 'POST') {
      const { identifier, password } = await readJsonBody(req);
      const cleanId = String(identifier || '').trim().toLowerCase();
      const { rows } = await db.query<any>(
        `SELECT u.id, u.email, u.phone, u.encrypted_password, p.role, p.full_name, p.locale, p.market_code, p.avatar_url, p.default_address, p.is_disabled
         FROM auth.users u
         JOIN public.profiles p ON p.id = u.id
         WHERE lower(u.email) = $1 OR u.phone = $2
         LIMIT 1;`,
        [cleanId, String(identifier || '').trim()]
      );
      const user = rows[0];
      if (!user || (user.encrypted_password && user.encrypted_password !== password)) {
        sendJson(res, 401, { error: 'INVALID_CREDENTIALS' });
        return true;
      }
      if (user.is_disabled) {
        sendJson(res, 403, { error: 'ACCOUNT_DISABLED' });
        return true;
      }
      sendJson(res, 200, {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          role: user.role,
          full_name: user.full_name,
          locale: user.locale,
          market_code: user.market_code,
          avatar_url: user.avatar_url,
          default_address: user.default_address,
        },
      });
      return true;
    }

    if (urlObj.pathname === '/api/auth/register' && req.method === 'POST') {
      const { full_name, email, phone, password, role, market_code, locale } = await readJsonBody(req);
      if (role === 'admin') {
        sendJson(res, 403, { error: 'FORBIDDEN_ROLE_ASSIGNMENT' });
        return true;
      }
      const id = crypto.randomUUID();
      await db.query(
        `INSERT INTO auth.users (id, email, phone, encrypted_password, raw_user_meta_data, raw_app_meta_data)
         VALUES ($1, $2, $3, $4, $5::jsonb, '{}'::jsonb);`,
        [
          id,
          email ? String(email).trim().toLowerCase() : null,
          phone ? String(phone).trim() : null,
          password,
          JSON.stringify({
            full_name,
            role: role || 'customer',
            market_code: market_code || 'ET',
            locale: locale || 'en',
          }),
        ]
      );
      const { rows } = await db.query<any>(
        `SELECT id, email, phone, role, full_name, locale, market_code, avatar_url, default_address
         FROM public.profiles WHERE id = $1;`,
        [id]
      );
      sendJson(res, 200, { user: rows[0] });
      return true;
    }

    // 3. RPC endpoint: /api/rpc/:fnName
    if (urlObj.pathname.startsWith('/api/rpc/') && req.method === 'POST') {
      const fnName = urlObj.pathname.replace('/api/rpc/', '');
      const args = await readJsonBody(req);

      if (fnName === 'place_order') {
        const { rows } = await queryAsUser(
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
        broadcastRealtimeEvent({ table: 'notifications', eventType: 'INSERT' });
        sendJson(res, 200, { data: rows[0] });
        return true;
      }

      if (fnName === 'update_order_status') {
        const { rows } = await queryAsUser(
          db,
          ctx,
          `SELECT * FROM public.update_order_status($1::uuid, $2::order_status, $3);`,
          [args.p_order_id, args.p_to_status, args.p_reason || null]
        );
        broadcastRealtimeEvent({ table: 'orders', eventType: 'UPDATE', record: rows[0] });
        broadcastRealtimeEvent({ table: 'order_events', eventType: 'INSERT' });
        broadcastRealtimeEvent({ table: 'ledger_entries', eventType: 'INSERT' });
        broadcastRealtimeEvent({ table: 'notifications', eventType: 'INSERT' });
        sendJson(res, 200, { data: rows[0] });
        return true;
      }

      if (fnName === 'record_payment') {
        const { rows } = await queryAsUser(
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
        sendJson(res, 200, { data: rows[0] });
        return true;
      }

      if (fnName === 'set_order_on_credit') {
        const { rows } = await queryAsUser(
          db,
          ctx,
          `SELECT * FROM public.set_order_on_credit($1::uuid);`,
          [args.p_order_id]
        );
        broadcastRealtimeEvent({ table: 'orders', eventType: 'UPDATE', record: rows[0] });
        sendJson(res, 200, { data: rows[0] });
        return true;
      }

      if (fnName === 'admin_set_subscription') {
        const { rows } = await queryAsUser(
          db,
          ctx,
          `SELECT * FROM public.admin_set_subscription($1::uuid, $2, $3, $4);`,
          [args.p_shop_id, args.p_action, args.p_reason, args.p_reference || null]
        );
        broadcastRealtimeEvent({ table: 'subscriptions', eventType: 'UPDATE', record: rows[0] });
        broadcastRealtimeEvent({ table: 'shops', eventType: 'UPDATE' });
        sendJson(res, 200, { data: rows[0] });
        return true;
      }

      if (fnName === 'mark_notifications_read') {
        const { rows } = await queryAsUser(
          db,
          ctx,
          `SELECT public.mark_notifications_read($1::uuid[]) AS count;`,
          [args.p_ids || []]
        );
        sendJson(res, 200, { data: rows[0]?.count ?? 0 });
        return true;
      }

      if (fnName === 'run_scheduled_reminders') {
        const { rows } = await queryAsUser(
          db,
          ctx,
          `SELECT public.run_scheduled_reminders() AS result;`
        );
        sendJson(res, 200, { data: rows[0]?.result });
        return true;
      }
    }

    // 4. Edge Functions: /api/functions/payments-init, /api/functions/payments-demo-confirm, /api/functions/admin-stats
    if (urlObj.pathname === '/api/functions/payments-init' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!ctx.sub) {
        sendJson(res, 401, { error: 'UNAUTHENTICATED' });
        return true;
      }

      // Check existing payment by idempotency_key
      const { rows: existing } = await db.query<any>(
        `SELECT * FROM public.payments WHERE idempotency_key = $1;`,
        [body.idempotency_key]
      );
      if (existing[0]) {
        sendJson(res, 200, {
          payment: existing[0],
          checkoutUrl: `/pay/demo/${existing[0].id}?method=${encodeURIComponent(existing[0].method_code)}`,
        });
        return true;
      }

      let amountMinor = 0;
      let currencyCode = 'ETB';
      let shopId = body.shop_id;
      const orderId = body.order_id || null;
      let subscriptionId = body.subscription_id || null;

      if (body.purpose === 'subscription') {
        const { rows: subs } = await db.query<any>(
          `SELECT s.*, p.price_minor, p.currency_code
           FROM public.subscriptions s
           JOIN public.plans p ON p.id = s.plan_id
           WHERE s.shop_id = $1;`,
          [shopId]
        );
        if (!subs[0]) {
          sendJson(res, 404, { error: 'SUBSCRIPTION_NOT_FOUND' });
          return true;
        }
        subscriptionId = subs[0].id;
        amountMinor = Number(subs[0].price_minor);
        currencyCode = subs[0].currency_code;
      } else {
        const { rows: orders } = await db.query<any>(
          `SELECT * FROM public.orders WHERE id = $1;`,
          [orderId]
        );
        if (!orders[0]) {
          sendJson(res, 404, { error: 'ORDER_NOT_FOUND' });
          return true;
        }
        if (orders[0].status === 'pending') {
          sendJson(res, 400, { error: 'CANNOT_PAY_PENDING_ORDER' });
          return true;
        }
        shopId = orders[0].shop_id;
        amountMinor = Number(orders[0].total_minor);
        currencyCode = orders[0].currency_code;
      }

      const paymentId = crypto.randomUUID();
      const providerRef = `DEMO-${paymentId.slice(0, 8).toUpperCase()}`;

      const { rows: inserted } = await db.query<any>(
        `INSERT INTO public.payments (
          id, purpose, order_id, subscription_id, shop_id, payer_id,
          amount_minor, currency_code, method_code, provider, provider_ref,
          status, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'demo', $10, 'pending', $11)
        RETURNING *;`,
        [
          paymentId,
          body.purpose || 'order',
          orderId,
          subscriptionId,
          shopId,
          ctx.sub,
          amountMinor,
          currencyCode,
          body.method_code || 'chapa',
          providerRef,
          body.idempotency_key,
        ]
      );

      sendJson(res, 200, {
        payment: inserted[0],
        checkoutUrl: `/pay/demo/${paymentId}?method=${encodeURIComponent(body.method_code || 'chapa')}`,
      });
      return true;
    }

    if (urlObj.pathname === '/api/functions/payments-demo-confirm' && req.method === 'POST') {
      const { payment_id, decision } = await readJsonBody(req);
      const status = decision === 'approve' ? 'succeeded' : 'failed';
      const { rows: current } = await db.query<any>(
        `SELECT * FROM public.payments WHERE id = $1;`,
        [payment_id]
      );
      if (!current[0]) {
        sendJson(res, 404, { error: 'PAYMENT_NOT_FOUND' });
        return true;
      }
      const { rows: updated } = await db.query<any>(
        `SELECT * FROM public.complete_online_payment($1::uuid, $2, $3::payment_tx_status);`,
        [payment_id, current[0].provider_ref || `DEMO-${payment_id.slice(0, 8)}`, status]
      );
      broadcastRealtimeEvent({ table: 'payments', eventType: 'UPDATE', record: updated[0] });
      broadcastRealtimeEvent({ table: 'orders', eventType: 'UPDATE' });
      broadcastRealtimeEvent({ table: 'ledger_entries', eventType: 'INSERT' });
      broadcastRealtimeEvent({ table: 'subscriptions', eventType: 'UPDATE' });
      sendJson(res, 200, { payment: updated[0] });
      return true;
    }

    if (urlObj.pathname === '/api/functions/admin-stats' && req.method === 'GET') {
      const { rows } = await queryAsUser(
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
      sendJson(res, 200, rows[0]?.stats || {});
      return true;
    }

    // 5. Generic RLS-enforced table & view queries: /api/db/:table
    if (urlObj.pathname.startsWith('/api/db/')) {
      const table = urlObj.pathname.replace('/api/db/', '');
      const allowedTables = [
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
      ];
      if (!allowedTables.includes(table)) {
        sendJson(res, 400, { error: 'INVALID_TABLE' });
        return true;
      }

      if (req.method === 'GET') {
        const since = urlObj.searchParams.get('since');
        let sql = `SELECT * FROM public.${table}`;
        const params: any[] = [];
        if (since && !table.startsWith('v_') && table !== 'audit_log') {
          sql += ` WHERE updated_at >= $1::timestamptz`;
          params.push(since);
        }
        const { rows } = await queryAsUser(db, ctx, sql, params);
        // Normalize bigint strings to numbers
        const normalized = rows.map((r: any) => {
          const copy = { ...r };
          for (const k of Object.keys(copy)) {
            if (k.endsWith('_minor') && copy[k] !== null && copy[k] !== undefined) {
              copy[k] = Number(copy[k]);
            }
          }
          return copy;
        });
        sendJson(res, 200, { data: normalized });
        return true;
      }

      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const cols = Object.keys(body).filter((k) => !k.startsWith('_'));
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

        const { rows } = await queryAsUser(
          db,
          ctx,
          sql,
          cols.map((c) => body[c])
        );

        // Log audit_log if admin changed configuration tables
        if (
          ctx.appRole === 'admin' &&
          ['markets', 'payment_methods', 'plans', 'app_settings', 'profiles'].includes(table)
        ) {
          await db.query(
            `INSERT INTO public.audit_log (actor_id, action, entity, entity_id, payload)
             VALUES ($1, $2, $3, $4, $5::jsonb);`,
            [
              ctx.sub,
              `upsert_${table}`,
              table,
              String(body.id || body.code || body.key || ''),
              JSON.stringify(body),
            ]
          );
        }

        broadcastRealtimeEvent({ table, eventType: 'INSERT', record: rows[0] });
        sendJson(res, 200, { data: rows[0] });
        return true;
      }

      if (req.method === 'PATCH') {
        const body = await readJsonBody(req);
        const matchCol = body._matchCol || 'id';
        const matchVal = body[matchCol];
        const cols = Object.keys(body).filter((k) => !k.startsWith('_') && k !== matchCol);
        const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
        const sql = `UPDATE public.${table} SET ${setClause} WHERE ${matchCol} = $${cols.length + 1} RETURNING *;`;
        const { rows } = await queryAsUser(db, ctx, sql, [...cols.map((c) => body[c]), matchVal]);

        if (
          ctx.appRole === 'admin' &&
          ['markets', 'payment_methods', 'plans', 'app_settings', 'profiles', 'support_tickets'].includes(table)
        ) {
          await db.query(
            `INSERT INTO public.audit_log (actor_id, action, entity, entity_id, payload)
             VALUES ($1, $2, $3, $4, $5::jsonb);`,
            [ctx.sub, `update_${table}`, table, String(matchVal), JSON.stringify(body)]
          );
        }

        broadcastRealtimeEvent({ table, eventType: 'UPDATE', record: rows[0] });
        sendJson(res, 200, { data: rows[0] });
        return true;
      }
    }

    sendJson(res, 404, { error: 'NOT_FOUND' });
    return true;
  } catch (err: any) {
    sendJson(res, 400, { error: err?.message || String(err) });
    return true;
  }
}
