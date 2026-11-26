// Single list of the RPCs the app may call, shared by the local dev gateway
// (scripts/local-gateway.ts) and the in-browser static-demo gateway
// (src/lib/browser-gateway/engine.ts). Each call runs as the signed-in user, so RLS
// and the SECURITY DEFINER checks in the migrations are the real enforcement.
//
// `touches` lists the synced tables a call can change; gateways broadcast a Realtime
// event for each so other devices delta-pull them. The first table gets the returned row.

type Args = Record<string, any>;

export interface RpcSpec {
  sql: string;
  params: (a: Args) => unknown[];
  /** 'row' returns the first row; 'value' returns its `value` column. */
  result: 'row' | 'value';
  touches: readonly string[];
}

export const RPC_REGISTRY: Readonly<Record<string, RpcSpec>> = {
  place_order: {
    sql: `SELECT * FROM public.place_order($1::uuid, $2::uuid, $3::jsonb, $4::fulfilment_type, $5, $6, $7::timestamptz, $8::bigint, $9);`,
    params: (a) => [
      a.p_order_id,
      a.p_shop_id,
      JSON.stringify(a.p_items),
      a.p_fulfilment || 'pickup',
      a.p_address || null,
      a.p_note || null,
      a.p_client_created_at || new Date().toISOString(),
      a.p_expected_total_minor ?? null,
      a.p_preferred_payment_method || null,
    ],
    result: 'row',
    touches: ['orders', 'order_items', 'order_events', 'shop_customers', 'notifications'],
  },
  update_order_status: {
    sql: `SELECT * FROM public.update_order_status($1::uuid, $2::order_status, $3);`,
    params: (a) => [a.p_order_id, a.p_to_status, a.p_reason || null],
    result: 'row',
    touches: ['orders', 'order_events', 'ledger_entries', 'shop_customers', 'notifications'],
  },
  record_payment: {
    sql: `SELECT * FROM public.record_payment($1, $2::uuid, $3::uuid, $4::uuid, $5::bigint, $6, $7);`,
    params: (a) => [
      a.p_idempotency_key,
      a.p_shop_id,
      a.p_customer_id,
      a.p_order_id || null,
      a.p_amount_minor,
      a.p_method || 'cash',
      a.p_note || null,
    ],
    result: 'row',
    touches: ['payments', 'ledger_entries', 'orders', 'shop_customers'],
  },
  set_order_on_credit: {
    sql: `SELECT * FROM public.set_order_on_credit($1::uuid);`,
    params: (a) => [a.p_order_id],
    result: 'row',
    touches: ['orders'],
  },
  admin_set_subscription: {
    sql: `SELECT * FROM public.admin_set_subscription($1::uuid, $2, $3, $4);`,
    params: (a) => [a.p_shop_id, a.p_action, a.p_reason, a.p_reference || null],
    result: 'row',
    touches: ['subscriptions', 'shops'],
  },
  mark_notifications_read: {
    sql: `SELECT public.mark_notifications_read($1::uuid[]) AS value;`,
    params: (a) => [a.p_ids || []],
    result: 'value',
    touches: [],
  },
  run_scheduled_reminders: {
    sql: `SELECT public.run_scheduled_reminders() AS value;`,
    params: () => [],
    result: 'value',
    touches: ['notifications', 'subscriptions'],
  },
  // Dubie book (migration 0008)
  add_walk_in_customer: {
    sql: `SELECT * FROM public.add_walk_in_customer($1::uuid, $2::uuid, $3, $4, $5::bigint);`,
    params: (a) => [a.p_id, a.p_shop_id, a.p_display_name, a.p_phone || null, a.p_credit_limit_minor ?? null],
    result: 'row',
    touches: ['shop_customers'],
  },
  update_shop_customer: {
    sql: `SELECT * FROM public.update_shop_customer($1::uuid, $2::jsonb);`,
    params: (a) => [a.p_shop_customer_id, JSON.stringify(a.p_changes || {})],
    result: 'row',
    touches: ['shop_customers'],
  },
  record_manual_charge: {
    sql: `SELECT * FROM public.record_manual_charge($1, $2::uuid, $3::bigint, $4);`,
    params: (a) => [a.p_idempotency_key, a.p_shop_customer_id, a.p_amount_minor, a.p_note || null],
    result: 'row',
    touches: ['ledger_entries', 'shop_customers'],
  },
  record_customer_payment: {
    sql: `SELECT * FROM public.record_customer_payment($1, $2::uuid, $3::bigint, $4, $5, $6::uuid);`,
    params: (a) => [
      a.p_idempotency_key,
      a.p_shop_customer_id,
      a.p_amount_minor,
      a.p_method || 'cash',
      a.p_note || null,
      a.p_order_id || null,
    ],
    result: 'row',
    touches: ['payments', 'ledger_entries', 'orders', 'shop_customers'],
  },
};

/** Validated online-payment start (migration 0008 `init_payment`). Demo gateways only. */
export const INIT_PAYMENT_SQL = `SELECT * FROM public.init_payment($1, $2::uuid, $3::uuid, $4::bigint, $5, $6, 'demo', $7);`;

export function initPaymentParams(input: {
  purpose: string;
  shop_id: string;
  order_id?: string | null;
  amount_minor?: number | null;
  method_code: string;
  idempotency_key: string;
}): unknown[] {
  const ref = `DEMO-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  return [
    input.purpose,
    input.shop_id,
    input.order_id || null,
    input.amount_minor ?? null,
    input.method_code,
    input.idempotency_key,
    ref,
  ];
}
