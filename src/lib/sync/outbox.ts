import { type SukLinkDexie, type OutboxMutation, type OutboxOpType } from './db';

/**
 * Enqueues an idempotent offline-capable mutation into the user's Dexie outbox
 * and applies an optimistic update tagged with `_pending = true` (Section 7.2).
 */
export async function enqueueOutboxMutation(
  db: SukLinkDexie,
  op: OutboxOpType,
  payload: Record<string, any>,
  explicitId?: string
): Promise<OutboxMutation> {
  const id =
    explicitId ||
    payload.order_id ||
    payload.idempotency_key ||
    payload.id ||
    crypto.randomUUID();

  // Deduplicate if the same mutation id is already queued or done
  const existing = await db.outbox.get(id);
  if (existing && (existing.status === 'queued' || existing.status === 'sending' || existing.status === 'done')) {
    return existing;
  }

  const nowIso = new Date().toISOString();
  const mutation: OutboxMutation = {
    id,
    op,
    payload,
    created_at: nowIso,
    attempts: 0,
    last_error: null,
    status: 'queued',
  };

  await db.transaction(
    'rw',
    [db.outbox, db.orders, db.order_items, db.products, db.shops, db.payments, db.ledger_entries],
    async () => {
      await db.outbox.put(mutation);

      // Apply immediate optimistic update to Dexie with _pending = true
      if (op === 'place_order') {
        const orderId = payload.order_id as string;
        await db.orders.put({
          id: orderId,
          order_number: payload.order_number || `SL-PEND`,
          shop_id: payload.shop_id,
          customer_id: payload.customer_id,
          status: 'pending',
          payment_status: 'unpaid',
          fulfilment: payload.fulfilment || 'pickup',
          currency_code: payload.currency_code || 'ETB',
          preferred_payment_method: payload.preferred_payment_method || null,
          delivery_address: payload.delivery_address || null,
          note: payload.note || null,
          subtotal_minor: payload.expected_total_minor || 0,
          delivery_fee_minor: 0,
          total_minor: payload.expected_total_minor || 0,
          rejection_reason: null,
          placed_at: nowIso,
          accepted_at: null,
          completed_at: null,
          client_created_at: payload.client_created_at || nowIso,
          deleted_at: null,
          created_at: nowIso,
          updated_at: nowIso,
          _pending: true,
        });

        if (Array.isArray(payload.items_snapshot)) {
          for (const item of payload.items_snapshot) {
            await db.order_items.put({
              id: `${orderId}_${item.product_id}`,
              order_id: orderId,
              product_id: item.product_id,
              product_name_snapshot: item.name,
              unit_snapshot: item.unit,
              unit_price_minor: item.unit_price_minor,
              quantity: item.quantity,
              line_total_minor: item.unit_price_minor * item.quantity,
              deleted_at: null,
              created_at: nowIso,
              updated_at: nowIso,
            });
          }
        }
      } else if (op === 'update_order_status') {
        const existingOrder = await db.orders.get(payload.order_id);
        if (existingOrder) {
          await db.orders.put({
            ...existingOrder,
            status: payload.to_status,
            rejection_reason: payload.reason || existingOrder.rejection_reason,
            updated_at: nowIso,
            _pending: true,
          });
        }
      } else if (op === 'upsert_product') {
        await db.products.put({
          id: payload.id,
          shop_id: payload.shop_id,
          name: payload.name,
          description: payload.description ?? null,
          price_minor: payload.price_minor,
          unit: payload.unit || 'piece',
          category: payload.category || 'General',
          image_url: payload.image_url ?? null,
          is_available: payload.is_available ?? true,
          sort_order: payload.sort_order ?? 0,
          deleted_at: payload.deleted_at ?? null,
          created_at: payload.created_at || nowIso,
          updated_at: nowIso,
          _pending: true,
        });
      }
    }
  );

  return mutation;
}

export async function getQueuedOutboxMutations(db: SukLinkDexie): Promise<OutboxMutation[]> {
  const all = await db.outbox.where('status').anyOf(['queued', 'sending']).toArray();
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getFailedOutboxMutations(db: SukLinkDexie): Promise<OutboxMutation[]> {
  const failed = await db.outbox.where('status').equals('failed').toArray();
  return failed.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
