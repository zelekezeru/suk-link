import { useEffect } from 'react';
import { useSessionStore } from '../../features/auth/useSession';
import { getUserDb } from './db';
import { pullTableDelta, type SyncedTableName } from './pull';

/**
 * Delta-pulls the given tables once when a screen mounts, so it opens on fresh
 * data. Live updates after that come from the sync engine (Realtime events,
 * reconnects, app resume and the 60s foreground interval) writing into Dexie,
 * which screens read through useLiveQuery.
 *
 * Screens must not poll the server themselves: a per-screen interval refetching
 * whole tables burns mobile data and battery (Build Plan §7.2, §8).
 */
export function useFreshTables(tables: readonly SyncedTableName[], enabled = true): void {
  const user = useSessionStore((s) => s.user);
  const key = tables.join(',');

  useEffect(() => {
    if (!enabled || !user || typeof navigator === 'undefined' || !navigator.onLine) return;
    const db = getUserDb(user.id);
    let cancelled = false;
    void (async () => {
      for (const table of key.split(',') as SyncedTableName[]) {
        if (cancelled || !db.isOpen()) return;
        try {
          await pullTableDelta(db, table, false, user);
        } catch {
          // Offline or transient failure: the sync engine retries on reconnect.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures `tables`
  }, [user?.id, enabled, key]);
}
