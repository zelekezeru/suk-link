import { z } from 'zod';
import type { OrderStatus } from '../lib/database.types';

export const LoginSchema = z.object({
  identifier: z.string().min(3, 'Required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().default(true),
});

export const RegisterSchema = z.object({
  role: z.enum(['customer', 'shop_owner']),
  full_name: z.string().min(2, 'Full name is required').max(100),
  phone: z.string().min(9, 'Valid phone number is required'),
  email: z.string().email('Valid email address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  market_code: z.string().length(2).default('ET'),
  locale: z.enum(['en', 'am', 'om', 'so', 'ti', 'sw']).default('en'),
});

export const ShopSetupSchema = z.object({
  name: z.string().min(2, 'Shop name is required').max(120),
  category: z.enum(['grocery', 'bakery', 'pharmacy', 'electronics', 'other']),
  description: z.string().max(400).optional().nullable(),
  phone: z.string().min(9, 'Valid phone number is required'),
  address_text: z.string().min(3, 'Address is required'),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  logo_url: z.string().optional().nullable(),
  cover_url: z.string().optional().nullable(),
  opening_time: z.string().default('07:00'),
  closing_time: z.string().default('21:00'),
  is_open: z.boolean().default(true),
  accepts_credit: z.boolean().default(true),
  offers_delivery: z.boolean().default(true),
  offers_pickup: z.boolean().default(true),
});

export const ProductFormSchema = z.object({
  name: z.string().min(2, 'Product name is required').max(120),
  description: z.string().max(500).optional().nullable(),
  price_decimal: z.string().min(1, 'Price is required'),
  unit: z.enum(['piece', 'kg', 'litre', 'pack']),
  category: z.string().min(1, 'Category is required').max(80),
  image_url: z.string().optional().nullable(),
  is_available: z.boolean().default(true),
});

export const PlaceOrderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
});

export const PlaceOrderSchema = z.object({
  order_id: z.string().uuid(),
  shop_id: z.string().uuid(),
  items: z.array(PlaceOrderItemSchema).min(1),
  fulfilment: z.enum(['pickup', 'delivery']),
  delivery_address: z.string().optional().nullable(),
  note: z.string().max(300).optional().nullable(),
  expected_total_minor: z.number().int().nonnegative(),
  preferred_payment_method: z.string().optional().nullable(),
});

export const SupportTicketSchema = z.object({
  subject: z.string().min(3, 'Subject is required').max(150),
  message: z.string().min(5, 'Message is required').max(1500),
});

export const RecordPaymentSchema = z.object({
  shop_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  order_id: z.string().uuid().optional().nullable(),
  amount_decimal: z.string().min(1, 'Amount is required'),
  method: z.enum(['cash', 'chapa', 'telebirr', 'cbe_birr', 'other']).default('cash'),
  note: z.string().max(240).optional().nullable(),
});

/**
 * Allowed order status transition table (Section 4 D & Section 6).
 */
export const ALLOWED_ORDER_TRANSITIONS: Record<
  OrderStatus,
  { shop_owner: OrderStatus[]; customer: OrderStatus[] }
> = {
  pending: {
    shop_owner: ['accepted', 'rejected'],
    customer: ['cancelled'],
  },
  accepted: {
    shop_owner: ['processing', 'cancelled', 'rejected'],
    customer: [],
  },
  processing: {
    shop_owner: ['completed', 'cancelled'],
    customer: [],
  },
  completed: {
    shop_owner: [],
    customer: [],
  },
  rejected: {
    shop_owner: [],
    customer: [],
  },
  cancelled: {
    shop_owner: [],
    customer: [],
  },
};

export function canTransitionOrderStatus(
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  actorRole: 'customer' | 'shop_owner' | 'admin'
): boolean {
  if (fromStatus === toStatus) return true; // Idempotent no-op
  const rule = ALLOWED_ORDER_TRANSITIONS[fromStatus];
  if (!rule) return false;
  if (actorRole === 'admin' || actorRole === 'shop_owner') {
    return rule.shop_owner.includes(toStatus);
  }
  return rule.customer.includes(toStatus);
}
