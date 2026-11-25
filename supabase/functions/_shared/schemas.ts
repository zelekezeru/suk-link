// supabase/functions/_shared/schemas.ts
// Shared Zod validation schemas between Client and Edge Functions

import { z } from 'zod';

export const PaymentInitSchema = z.object({
  purpose: z.enum(['order', 'subscription']).default('order'),
  order_id: z.string().uuid().optional().nullable(),
  subscription_id: z.string().uuid().optional().nullable(),
  shop_id: z.string().uuid(),
  method_code: z.enum(['chapa', 'telebirr', 'cbe_birr', 'cash', 'credit', 'demo']),
  idempotency_key: z.string().min(6),
  return_url: z.string().url().optional(),
});

export const DemoPaymentConfirmSchema = z.object({
  payment_id: z.string().uuid(),
  decision: z.enum(['approve', 'decline']),
});

export const WebhookPayloadSchema = z.object({
  provider: z.enum(['chapa', 'telebirr', 'cbe_birr', 'demo']),
  tx_ref: z.string().min(3),
  status: z.enum(['succeeded', 'failed', 'success']),
  amount_minor: z.number().int().positive(),
  currency: z.string().length(3),
});

