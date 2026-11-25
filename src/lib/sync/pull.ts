import { type SukLinkDexie } from './db';
import { apiFetchTable, type SessionUser } from '../supabase';

export const SYNCED_TABLES = [
  'markets',
  'shops',
  'products',
  'subscriptions',
  'orders',
  'order_items',
  'order_events',
  'payments',
  'shop_customers',
  'ledger_entries',
  'profiles',
  'payment_methods',
  'shop_payment_methods',
  'plans',
  'app_settings',
  'notifications',
  'support_tickets',
] as const;

export type SyncedTableName = (typeof SYNCED_TABLES)[number];

/**
 * Delta sync per table using `updated_at > sync_meta[table].cursor` with a 5-second overlap window
 * to tolerate clock skew (Section 7.2).
 * Rows with `deleted_at` set are removed locally.
 */
export async function pullTableDelta(
  db: SukLinkDexie,
  tableName: SyncedTableName,
  forceFull = false,
  cycleUser?: SessionUser | null
): Promise<number> {
  if (!db.isOpen()) return 0;
  const meta = forceFull ? undefined : await db.sync_meta.get(tableName);
  let sinceCursor: string | undefined;

  if (meta?.cursor) {
    const cursorTime = new Date(meta.cursor).getTime();
    if (!Number.isNaN(cursorTime)) {
      // 5s overlap window per Section 7.2
      sinceCursor = new Date(Math.max(0, cursorTime - 5000)).toISOString();
    }
  }

  const rows = await apiFetchTable<any>(tableName, sinceCursor, cycleUser);
  if (rows.length === 0 || !db.isOpen()) {
    return 0;
  }

  const dexieTable = (db as any)[tableName];
  if (!dexieTable) return 0;

  let maxUpdatedAt = meta?.cursor || '';
  let maxMs = maxUpdatedAt ? new Date(maxUpdatedAt).getTime() : 0;

  await dexieTable.bulkPut(
    rows
      .filter((r: any) => !r.deleted_at)
      .map((row: any) => {
        if (row.updated_at) {
          const rowMs = new Date(row.updated_at).getTime();
          if (rowMs > maxMs) {
            maxMs = rowMs;
            maxUpdatedAt = new Date(rowMs).toISOString();
          }
        }
        const cleanRow = { ...row };
        for (const k of Object.keys(cleanRow)) {
          if (cleanRow[k] === undefined) {
            delete cleanRow[k];
          }
        }
        return { ...cleanRow, _pending: false };
      })
  );

  for (const row of rows) {
    if (row.deleted_at && db.isOpen()) {
      const pk =
        tableName === 'markets'
          ? row.code
          : tableName === 'app_settings'
            ? row.key
            : row.id;
      await dexieTable.delete(pk);
    }
  }

  if (maxUpdatedAt && db.isOpen()) {
    await db.sync_meta.put({
      table: tableName,
      cursor: maxUpdatedAt,
    });
  }

  return rows.length;
}

export async function pullAllSyncedTables(
  db: SukLinkDexie,
  forceFull = false,
  cycleUser?: SessionUser | null
): Promise<void> {
  // Anonymous / guest users only need public configuration tables
  const isGuest = !cycleUser || db.name === 'suklink_guest';
  const tablesToPull: readonly SyncedTableName[] = isGuest
    ? ['markets', 'payment_methods', 'plans', 'app_settings']
    : SYNCED_TABLES;

  for (const table of tablesToPull) {
    if (!db.isOpen()) break;
    try {
      await pullTableDelta(db, table, forceFull, cycleUser);
    } catch {
      // Silently ignore if DB was closed on logout during pull
    }
  }
}
