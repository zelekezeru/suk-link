// supabase/functions/payments-demo-confirm/index.ts
// Edge Function: DemoProvider approve/decline confirmation endpoint

import { DemoPaymentConfirmSchema } from '../_shared/schemas';

export function validateDemoConfirm(body: unknown) {
  return DemoPaymentConfirmSchema.parse(body);
}

