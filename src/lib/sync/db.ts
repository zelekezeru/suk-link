import Dexie, { type Table } from 'dexie';
import type {
  MarketRow,
  PaymentMethodRow,
  ShopPaymentMethodRow,
  AppSettingRow,
  ProfileRow,
  ShopRow,
  ProductRow,
  PlanRow,
  SubscriptionRow,
  OrderRow,
  OrderItemRow,
  OrderEventRow,
  PaymentRow,
  ShopCustomerRow,
  LedgerEntryRow,
  NotificationRow,
  SupportTicketRow,
} from '../database.types';

export type OutboxOpType =
  | 'place_order'
  | 'update_order_status'
  | 'upsert_product'
  | 'delete_product'
  | 'update_shop'
  | 'record_payment'
  | 'set_order_on_credit';

export type OutboxStatus = 'queued' | 'sending' | 'failed' | 'done';

export interface OutboxMutation {
  id: string; // UUID & idempotency key
  op: OutboxOpType;
  payload: Record<string, any>;
  created_at: string;
  attempts: number;
  last_error: string | null;
  status: OutboxStatus;
}

export interface SyncMetaRow {
  table: string;
  cursor: string; // ISO timestamp of last synced updated_at
}

export class SukLinkDexie extends Dexie {
  markets!: Table<MarketRow, string>;
  payment_methods!: Table<PaymentMethodRow, string>;
  shop_payment_methods!: Table<ShopPaymentMethodRow, string>;
  app_settings!: Table<AppSettingRow, string>;
  profiles!: Table<ProfileRow, string>;
  shops!: Table<ShopRow, string>;
  products!: Table<ProductRow, string>;
  plans!: Table<PlanRow, string>;
  subscriptions!: Table<SubscriptionRow, string>;
  orders!: Table<OrderRow, string>;
  order_items!: Table<OrderItemRow, string>;
  order_events!: Table<OrderEventRow, string>;
  payments!: Table<PaymentRow, string>;
  shop_customers!: Table<ShopCustomerRow, string>;
  ledger_entries!: Table<LedgerEntryRow, string>;
  notifications!: Table<NotificationRow, string>;
  support_tickets!: Table<SupportTicketRow, string>;
  outbox!: Table<OutboxMutation, string>;
  sync_meta!: Table<SyncMetaRow, string>;

  constructor(userId: string) {
    super(`suklink_${userId}`);

    this.version(1).stores({
      markets: 'code, updated_at',
      payment_methods: 'id, market_code, code, sort_order, updated_at',
      shop_payment_methods: 'id, shop_id, method_code, updated_at',
      app_settings: 'key, updated_at',
      profiles: 'id, role, market_code, updated_at',
      shops: 'id, owner_id, market_code, slug, category, updated_at',
      products: 'id, shop_id, category, sort_order, updated_at',
      plans: 'id, market_code, code, updated_at',
      subscriptions: 'id, shop_id, status, updated_at',
      orders: 'id, order_number, shop_id, customer_id, status, payment_status, placed_at, updated_at',
      order_items: 'id, order_id, product_id, updated_at',
      order_events: 'id, order_id, created_at, updated_at',
      payments: 'id, order_id, subscription_id, shop_id, payer_id, status, idempotency_key, updated_at',
      shop_customers: 'id, shop_id, customer_id, [shop_id+customer_id], updated_at',
      ledger_entries: 'id, shop_id, customer_id, order_id, payment_id, created_at, updated_at',
      notifications: 'id, user_id, read_at, created_at, updated_at',
      support_tickets: 'id, user_id, status, created_at, updated_at',
      outbox: 'id, op, status, created_at',
      sync_meta: 'table',
    });
  }
}

const dbCache = new Map<string, SukLinkDexie>();

export function getUserDb(userId = 'guest'): SukLinkDexie {
  const existing = dbCache.get(userId);
  if (existing) {
    return existing;
  }
  const instance = new SukLinkDexie(userId);
  dbCache.set(userId, instance);
  return instance;
}

export async function wipeUserDb(userId: string): Promise<void> {
  const existing = dbCache.get(userId);
  if (existing) {
    existing.close();
    dbCache.delete(userId);
  }
  await Dexie.delete(`suklink_${userId}`);
}
