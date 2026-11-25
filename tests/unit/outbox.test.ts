import { describe, it, expect, beforeEach } from 'vitest';
import { SukLinkDexie } from '../../src/lib/sync/db';
import { enqueueOutboxMutation, getQueuedOutboxMutations, getFailedOutboxMutations } from '../../src/lib/sync/outbox';
import { drainOutbox, computeBackoffDelayMs } from '../../src/lib/sync/push';

describe('Offline Outbox FIFO Ordering, Idempotency, Backoff, and Business Error Rollback (Section 7.2 & 13)', () => {
  let db: SukLinkDexie;

  beforeEach(async () => {
    db = new SukLinkDexie(`test_${crypto.randomUUID()}`);
  });

  it('computes exponential backoff 1s, 2s, 4s... capped at 60s', () => {
    expect(computeBackoffDelayMs(1)).toBe(1000);
    expect(computeBackoffDelayMs(2)).toBe(2000);
    expect(computeBackoffDelayMs(3)).toBe(4000);
    expect(computeBackoffDelayMs(10)).toBe(60000);
  });

  it('enqueues mutations idempotently, applies optimistic _pending rows, and drains in FIFO order', async () => {
    const orderId1 = '50000000-0000-4000-8000-000000000001';
    const orderId2 = '50000000-0000-4000-8000-000000000002';

    await enqueueOutboxMutation(db, 'place_order', {
      order_id: orderId1,
      shop_id: 'shop-1',
      customer_id: 'cust-1',
      expected_total_minor: 14000,
    });

    // Duplicate enqueue with same order_id does not create a second outbox row
    await enqueueOutboxMutation(db, 'place_order', {
      order_id: orderId1,
      shop_id: 'shop-1',
      customer_id: 'cust-1',
      expected_total_minor: 14000,
    });

    await enqueueOutboxMutation(db, 'update_order_status', {
      order_id: orderId1,
      to_status: 'cancelled',
      reason: 'Changed mind',
    }, orderId2);

    const queued = await getQueuedOutboxMutations(db);
    expect(queued).toHaveLength(2);

    // Optimistic order row exists in Dexie with _pending = true
    const optimisticOrder = await db.orders.get(orderId1);
    expect(optimisticOrder?._pending).toBe(true);

    const executedOrder: string[] = [];
    const result = await drainOutbox(db, async (mutation) => {
      executedOrder.push(`${mutation.op}:${mutation.id}`);
    });

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
    expect(executedOrder).toEqual([
      `place_order:${orderId1}`,
      `update_order_status:${orderId2}`,
    ]);

    // After drain, _pending is false
    const confirmedOrder = await db.orders.get(orderId1);
    expect(confirmedOrder?._pending).toBe(false);
  });

  it('does not retry business errors (e.g. PRICE_CHANGED), marks failed, and rolls back optimistic row', async () => {
    const orderId = '50000000-0000-4000-8000-000000000099';
    await enqueueOutboxMutation(db, 'place_order', {
      order_id: orderId,
      shop_id: 'shop-1',
      customer_id: 'cust-1',
      expected_total_minor: 14000,
    });

    const result = await drainOutbox(db, async () => {
      throw new Error('PRICE_CHANGED:{"actual_total_minor":16000}');
    });

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);

    const failedList = await getFailedOutboxMutations(db);
    expect(failedList).toHaveLength(1);
    expect(failedList[0].last_error).toContain('PRICE_CHANGED');

    // Optimistic order row was rolled back
    const rolledBack = await db.orders.get(orderId);
    expect(rolledBack).toBeUndefined();
  });
});
