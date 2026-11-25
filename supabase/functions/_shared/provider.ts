// supabase/functions/_shared/provider.ts
// Common PaymentProvider interface (Section 4 — Payments)

export interface PaymentInitInput {
  paymentId: string;
  amountMinor: number;
  currency: string;
  customer: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  returnUrl: string;
  callbackUrl: string;
  method?: string;
}

export interface PaymentInitOutput {
  checkoutUrl: string;
  providerRef: string;
}

export interface WebhookVerifyOutput {
  providerRef: string;
  status: 'succeeded' | 'failed';
  amountMinor: number;
  currency: string;
}

export interface TransactionVerifyOutput {
  status: 'succeeded' | 'failed' | 'pending';
  amountMinor: number;
  currency: string;
}

export interface PaymentProvider {
  code: 'chapa' | 'telebirr' | 'cbe_birr' | 'demo';
  initiate(input: PaymentInitInput): Promise<PaymentInitOutput>;
  verifyWebhook(req: Request): Promise<WebhookVerifyOutput>;
  verifyTransaction(providerRef: string): Promise<TransactionVerifyOutput>;
}

