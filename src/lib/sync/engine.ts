import { getUserDb, type OutboxMutation, type SukLinkDexie } from './db';
import { getQueuedOutboxMutations, getFailedOutboxMutations } from './outbox';
import { drainOutbox } from './push';
import { pullAllSyncedTables, pullTableDelta, type SyncedTableName, SYNCED_TABLES } from './pull';
import { apiCallRpc, apiUpsertRow, apiUpdateRow, getStoredSessionUser, IS_STATIC_DEMO } from '../supabase';
import { useUiStore } from '../../stores/ui';

async function executeOutboxMutationOnServer(
  db: SukLinkDexie,
  mutation: OutboxMutation
): Promise<void> {
  const { op, payload } = mutation;

  if (op === 'place_order') {
    await apiCallRpc('place_order', {
      p_order_id: payload.order_id,
      p_shop_id: payload.shop_id,
      p_items: payload.items,
      p_fulfilment: payload.fulfilment,
      p_address: payload.delivery_address || null,
      p_note: payload.note || null,
      p_client_created_at: payload.client_created_at,
      p_expected_total_minor: payload.expected_total_minor,
      p_preferred_payment_method: payload.preferred_payment_method || null,
    });
    await pullTableDelta(db, 'orders');
    await pullTableDelta(db, 'order_items');
    await pullTableDelta(db, 'order_events');
    return;
  }

  if (op === 'update_order_status') {
    await apiCallRpc('update_order_status', {
      p_order_id: payload.order_id,
      p_to_status: payload.to_status,
      p_reason: payload.reason || null,
    });
    await pullTableDelta(db, 'orders');
    await pullTableDelta(db, 'order_events');
    await pullTableDelta(db, 'ledger_entries');
    return;
  }

  if (op === 'upsert_product') {
    const clean = { ...payload };
    delete clean._pending;
    delete clean.base_updated_at;
    await apiUpsertRow('products', clean);
    await pullTableDelta(db, 'products');
    return;
  }

  if (op === 'delete_product') {
    await apiUpdateRow('products', {
      id: payload.id,
      deleted_at: payload.deleted_at || new Date().toISOString(),
    });
    await db.products.delete(payload.id);
    return;
  }

  if (op === 'update_shop') {
    const clean = { ...payload };
    delete clean._pending;
    await apiUpsertRow('shops', clean);
    await pullTableDelta(db, 'shops');
    await pullTableDelta(db, 'subscriptions');
    await pullTableDelta(db, 'shop_payment_methods');
    return;
  }

  if (op === 'record_payment') {
    await apiCallRpc('record_payment', {
      p_idempotency_key: payload.idempotency_key || mutation.id,
      p_shop_id: payload.shop_id,
      p_customer_id: payload.customer_id,
      p_order_id: payload.order_id || null,
      p_amount_minor: payload.amount_minor,
      p_method: payload.method || 'cash',
      p_note: payload.note || null,
    });
    await pullTableDelta(db, 'payments');
    await pullTableDelta(db, 'ledger_entries');
    await pullTableDelta(db, 'orders');
    return;
  }

  if (op === 'set_order_on_credit') {
    await apiCallRpc('set_order_on_credit', {
      p_order_id: payload.order_id,
    });
    await pullTableDelta(db, 'orders');
    return;
  }
}

export async function refreshOutboxBadges(db: SukLinkDexie): Promise<void> {
  const queued = await getQueuedOutboxMutations(db);
  const failed = await getFailedOutboxMutations(db);
  useUiStore.getState().setSyncStats({
    pendingOutboxCount: queued.length,
    failedOutboxCount: failed.length,
  });
}

let isSyncRunning = false;
let pendingSyncPromise: Promise<void> | null = null;
let queuedSyncAfterCurrent: { forceFullPull: boolean } | null = null;

export async function runSyncCycle(forceFullPull = false): Promise<void> {
  if (!navigator.onLine) {
    const user = getStoredSessionUser();
    const db = getUserDb(user?.id || 'guest');
    await refreshOutboxBadges(db);
    useUiStore.getState().setOnlineStatus(false);
    return;
  }
  useUiStore.getState().setOnlineStatus(true);

  if (isSyncRunning && pendingSyncPromise) {
    queuedSyncAfterCurrent = {
      forceFullPull: Boolean(queuedSyncAfterCurrent?.forceFullPull || forceFullPull),
    };
    await pendingSyncPromise;
    return;
  }

  isSyncRunning = true;
  useUiStore.getState().setSyncStats({ isSyncing: true });

  pendingSyncPromise = (async () => {
    try {
      let nextForceFull = forceFullPull;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const user = getStoredSessionUser();
        const db = getUserDb(user?.id || 'guest');
        await refreshOutboxBadges(db);

        await drainOutbox(
          db,
          (mutation) => executeOutboxMutationOnServer(db, mutation),
          async (failedMutation) => {
            if (failedMutation.op === 'place_order' && failedMutation.payload.order_id) {
              await db.orders.delete(failedMutation.payload.order_id);
            } else if (failedMutation.op === 'update_order_status') {
              await pullTableDelta(db, 'orders', true, user);
            }
          }
        );

        await pullAllSyncedTables(db, nextForceFull, user);
        if (db.isOpen()) {
          await refreshOutboxBadges(db);
        }

        if (queuedSyncAfterCurrent) {
          nextForceFull = queuedSyncAfterCurrent.forceFullPull;
          queuedSyncAfterCurrent = null;
        } else {
          break;
        }
      }
    } finally {
      isSyncRunning = false;
      pendingSyncPromise = null;
      useUiStore.getState().setSyncStats({ isSyncing: false });
    }
  })();

  await pendingSyncPromise;
}

let realtimeSource: EventSource | null = null;
const realtimeListeners = new Set<(event: { table: string; eventType: string; record?: any }) => void>();

export function subscribeRealtimeEvents(
  listener: (event: { table: string; eventType: string; record?: any }) => void
): () => void {
  realtimeListeners.add(listener);
  return () => {
    realtimeListeners.delete(listener);
  };
}

export function startSyncEngine(): () => void {
  // Initial sync
  void runSyncCycle(true);

  const handleOnline = () => {
    useUiStore.getState().setOnlineStatus(true);
    void runSyncCycle(false);
  };

  const handleOffline = () => {
    useUiStore.getState().setOnlineStatus(false);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  const handleRealtimePayload = async (parsed: { table?: string; eventType?: string; record?: any }) => {
    try {
      if (parsed.eventType === 'RESET') {
        await runSyncCycle(true);
        return;
      }
      if (parsed.table && SYNCED_TABLES.includes(parsed.table as SyncedTableName)) {
        const user = getStoredSessionUser();
        const db = getUserDb(user?.id || 'guest');
        if (parsed.record && !parsed.record.deleted_at) {
          const tbl = (db as any)[parsed.table];
          if (tbl) {
            const clean = { ...parsed.record };
            for (const k of Object.keys(clean)) {
              if (k.endsWith('_minor') && clean[k] !== null && clean[k] !== undefined) {
                clean[k] = Number(clean[k]);
              }
            }
            await tbl.put({ ...clean, _pending: false });
          }
        }
        await pullTableDelta(db, parsed.table as SyncedTableName, true, user);
        for (const listener of realtimeListeners) {
          listener({
            table: parsed.table,
            eventType: parsed.eventType || 'UPDATE',
            record: parsed.record,
          });
        }
      }
    } catch {
      // ignore malformed keepalive
    }
  };

  let stopBrowserRealtime: (() => void) | null = null;
  if (IS_STATIC_DEMO) {
    void import('../browser-gateway/engine').then(({ subscribeBrowserRealtime }) => {
      stopBrowserRealtime = subscribeBrowserRealtime((payload) => {
        void handleRealtimePayload(payload);
      });
    });
  } else if (typeof EventSource !== 'undefined' && !realtimeSource) {
    // Connect to local Realtime SSE gateway
    realtimeSource = new EventSource('/api/realtime');
    realtimeSource.onmessage = async (msg) => {
      try {
        const parsed = JSON.parse(msg.data);
        await handleRealtimePayload(parsed);
      } catch {
        // ignore malformed keepalive
      }
    };
  }

  // 60s foreground interval (Section 7.2)
  const intervalId = window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      void runSyncCycle(false);
    }
  }, 60000);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.clearInterval(intervalId);
    stopBrowserRealtime?.();
  };
}
