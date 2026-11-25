// supabase/functions/payments-webhook/index.ts
// Edge Function: Provider webhook verification & double-check via verifyTransaction

import type { PaymentProvider } from '../_shared/provider';

export async function processProviderWebhook(
  req: Request,
  provider: PaymentProvider,
  expectedPayment: {
    id: string;
    amount_minor: number;
    currency_code: string;
    status: string;
  }
) {
  // 1. Verify webhook signature and parse payload
  const webhookResult = await provider.verifyWebhook(req);

  // 2. Re-confirm transaction status and amount directly with provider (Section 4 & 10)
  const verifiedTx = await provider.verifyTransaction(webhookResult.providerRef);

  if (
    verifiedTx.amountMinor !== Number(expectedPayment.amount_minor) ||
    verifiedTx.currency !== expectedPayment.currency_code
  ) {
    throw new Error('PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH');
  }

  return {
    providerRef: webhookResult.providerRef,
    finalStatus: verifiedTx.status === 'succeeded' ? ('succeeded' as const) : ('failed' as const),
  };
}

