// Generated TypeScript types for Suk Link Postgres Schema (Section 5 & Section 5.1)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'customer' | 'shop_owner' | 'admin';
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'on_credit';
export type FulfilmentType = 'pickup' | 'delivery';
export type PaymentPurpose = 'order' | 'subscription';
export type PaymentTxStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type PaymentMethodType = 'online' | 'offline' | 'credit';
export type PaymentRoutingType = 'via_chapa' | 'direct' | 'manual' | 'none';
export type LedgerEntryType = 'charge' | 'payment' | 'adjustment';
export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'expired' | 'suspended';
export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved';
export type LocaleCode = 'en' | 'am' | 'om' | 'so' | 'ti' | 'sw';

export interface MarketRow {
  code: string;
  name_i18n: Record<string, string>;
  currency_code: string;
  currency_symbol: string;
  minor_unit_digits: number;
  phone_country_code: string;
  phone_regex: string;
  timezone: string;
  default_locale: LocaleCode;
  enabled_locales: LocaleCode[];
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethodRow {
  id: string;
  market_code: string;
  code: 'chapa' | 'telebirr' | 'cbe_birr' | 'cash' | 'credit' | 'demo';
  type: PaymentMethodType;
  routing: PaymentRoutingType;
  name_i18n: Record<string, string>;
  icon: string;
  sort_order: number;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ShopPaymentMethodRow {
  id: string;
  shop_id: string;
  method_code: 'chapa' | 'telebirr' | 'cbe_birr' | 'cash' | 'credit' | 'demo';
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppSettingRow {
  key: string;
  value: unknown;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  locale: LocaleCode;
  market_code: string;
  default_address: string | null;
  is_disabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopRow {
  id: string;
  owner_id: string;
  market_code: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  phone: string;
  address_text: string;
  lat: number | null;
  lng: number | null;
  logo_url: string | null;
  cover_url: string | null;
  opening_time: string;
  closing_time: string;
  is_open: boolean;
  accepts_credit: boolean;
  offers_delivery: boolean;
  offers_pickup: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  _pending?: boolean;
}

export interface ProductRow {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  unit: string;
  category: string;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  _pending?: boolean;
}

export interface PlanRow {
  id: string;
  market_code: string;
  code: string;
  name_i18n: Record<string, string>;
  price_minor: number;
  currency_code: string;
  duration_days: number;
  trial_days: number;
  grace_days: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRow {
  id: string;
  shop_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  last_paid_minor: number;
  current_period_start: string;
  current_period_end: string;
  suspended_reason: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  order_number: string;
  shop_id: string;
  customer_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfilment: FulfilmentType;
  currency_code: string;
  preferred_payment_method: string | null;
  delivery_address: string | null;
  note: string | null;
  subtotal_minor: number;
  delivery_fee_minor: number;
  total_minor: number;
  rejection_reason: string | null;
  placed_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  client_created_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  _pending?: boolean;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  product_name_snapshot: string;
  unit_snapshot: string;
  unit_price_minor: number;
  quantity: number;
  line_total_minor: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderEventRow {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string;
  reason: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  purpose: PaymentPurpose;
  order_id: string | null;
  subscription_id: string | null;
  shop_id: string;
  payer_id: string;
  amount_minor: number;
  currency_code: string;
  method_code: string;
  provider: string;
  provider_ref: string | null;
  status: PaymentTxStatus;
  idempotency_key: string;
  recorded_by: string | null;
  paid_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  _pending?: boolean;
}

export interface ShopCustomerRow {
  id: string;
  shop_id: string;
  customer_id: string;
  credit_limit_minor: number | null;
  notes: string | null;
  first_order_at: string;
  last_order_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntryRow {
  id: string;
  shop_id: string;
  customer_id: string;
  order_id: string | null;
  payment_id: string | null;
  type: LedgerEntryType;
  amount_minor: number;
  currency_code: string;
  description: string;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketRow {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string;
  action: string;
  entity: string;
  entity_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CustomerBalanceViewRow {
  shop_id: string;
  customer_id: string;
  currency_code: string;
  balance_minor: number;
  last_activity: string;
}

export interface ShopSalesDailyViewRow {
  shop_id: string;
  day: string;
  currency_code: string;
  orders_count: number;
  gross_minor: number;
  collected_minor: number;
}

