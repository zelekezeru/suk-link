import http from 'http';
import { PGlite } from '@electric-sql/pglite';
import { openPersistentPostgres, queryAsUser, type JwtContext } from './pg-engine';
import { seedDatabase } from './seed';
import { ADMIN_STATS_SQL } from '../supabase/functions/admin-stats/index';
import { RPC_REGISTRY, INIT_PAYMENT_SQL, initPaymentParams } from '../src/lib/rpc-registry';

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

      const spec = RPC_REGISTRY[fnName];
      if (!spec) {
        sendJson(res, 404, { error: `UNKNOWN_RPC_${fnName.toUpperCase()}` });
        return true;
      }
      const { rows } = await queryAsUser(db, ctx, spec.sql, spec.params(args));
      spec.touches.forEach((table, i) =>
        broadcastRealtimeEvent({ table, eventType: 'UPDATE', record: i === 0 ? rows[0] : undefined })
      );
      sendJson(res, 200, { data: spec.result === 'value' ? rows[0]?.value : rows[0] });
      return true;
    }

    // 4. Edge Functions: /api/functions/payments-init, /api/functions/payments-demo-confirm, /api/functions/admin-stats
    if (urlObj.pathname === '/api/functions/payments-init' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!ctx.sub) {
        sendJson(res, 401, { error: 'UNAUTHENTICATED' });
        return true;
      }

      // All checks (ownership, amount due, idempotency) live in SQL init_payment.
      const { rows: inserted } = await queryAsUser(db, ctx, INIT_PAYMENT_SQL, initPaymentParams(body));
      broadcastRealtimeEvent({ table: 'payments', eventType: 'INSERT', record: inserted[0] });
      sendJson(res, 200, {
        payment: inserted[0],
        checkoutUrl: `/pay/demo/${inserted[0].id}?method=${encodeURIComponent(inserted[0].method_code)}`,
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
        ADMIN_STATS_SQL
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
