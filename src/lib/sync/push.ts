import { type SukLinkDexie, type OutboxMutation } from './db';
import { getQueuedOutboxMutations } from './outbox';

export const BUSINESS_ERROR_CODES = [
  'PRICE_CHANGED',
  'INVALID_TRANSITION',
  'PRODUCT_UNAVAILABLE',
  'PRODUCT_NOT_FOUND',
  'SHOP_CLOSED',
  'SHOP_SUBSCRIPTION_INACTIVE',
  'AMOUNT_EXCEEDS_OUTSTANDING',
  'CREDIT_LIMIT_EXCEEDED',
  'FORBIDDEN',
  'REASON_REQUIRED',
  'CONFLICT_DETECTED',
];

export function isBusinessError(errMessage: string): boolean {
  return BUSINESS_ERROR_CODES.some((code) => errMessage.includes(code));
}

export function computeBackoffDelayMs(attempt: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s... max 60s (Section 7.2)
  const exp = Math.max(0, attempt - 1);
  return Math.min(60000, 1000 * Math.pow(2, exp));
}

export type OutboxExecutor = (mutation: OutboxMutation) => Promise<void>;

let isDraining = false;

/**
 * Drains the outbox in strict FIFO order, one operation at a time (Section 7.2).
 * Business errors are not retried: marked `failed`, optimistic state rolled back, and surfaced in "Needs attention".
 */
export async function drainOutbox(
  db: SukLinkDexie,
  executor: OutboxExecutor,
  onRollbackEntity?: (mutation: OutboxMutation) => Promise<void>
): Promise<{ processed: number; failed: number }> {
  if (isDraining) {
    return { processed: 0, failed: 0 };
  }
  isDraining = true;
  let processed = 0;
  let failed = 0;

  try {
    const queue = await getQueuedOutboxMutations(db);

    for (const item of queue) {
      await db.outbox.update(item.id, {
        status: 'sending',
        attempts: item.attempts + 1,
      });

      try {
        await executor(item);
        await db.outbox.update(item.id, {
          status: 'done',
          last_error: null,
        });

        // Clear _pending flag on the confirmed entity
        if (item.op === 'place_order' || item.op === 'update_order_status') {
          const orderId = item.payload.order_id;
          if (orderId) {
            await db.orders.update(orderId, { _pending: false });
          }
        } else if (item.op === 'upsert_product') {
          if (item.payload.id) {
            await db.products.update(item.payload.id, { _pending: false });
          }
        }

        processed++;
      } catch (err: any) {
        const message = err?.message || String(err);
        if (isBusinessError(message)) {
          await db.outbox.update(item.id, {
            status: 'failed',
            last_error: message,
          });
          if (onRollbackEntity) {
            await onRollbackEntity(item);
          } else if (item.op === 'place_order' && item.payload.order_id) {
            await db.orders.delete(item.payload.order_id);
          }
          failed++;
        } else {
          // Network or transient error -> keep queued for exponential backoff retry
          await db.outbox.update(item.id, {
            status: 'queued',
            last_error: message,
          });
          // Stop draining remaining dependent items while offline/transiently failing
          break;
        }
      }
    }
  } finally {
    isDraining = false;
  }

  return { processed, failed };
}
