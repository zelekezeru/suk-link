// supabase/functions/_shared/demo.ts
// DemoProvider implementation of PaymentProvider (Section 4 — Payments)

import type {
  PaymentProvider,
  PaymentInitInput,
  PaymentInitOutput,
  WebhookVerifyOutput,
  TransactionVerifyOutput,
} from './provider';

const demoTransactions = new Map<
  string,
  { amountMinor: number; currency: string; status: 'succeeded' | 'failed' | 'pending' }
>();

export class DemoProvider implements PaymentProvider {
  code: 'demo' = 'demo';
  private appPublicUrl: string;

  constructor(appPublicUrl = 'http://localhost:5173') {
    this.appPublicUrl = appPublicUrl.replace(/\/$/, '');
  }

  async initiate(input: PaymentInitInput): Promise<PaymentInitOutput> {
    const providerRef = `DEMO-${input.paymentId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    demoTransactions.set(providerRef, {
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'pending',
    });
    const methodParam = input.method ? `?method=${encodeURIComponent(input.method)}` : '';
    return {
      checkoutUrl: `${this.appPublicUrl}/pay/demo/${input.paymentId}${methodParam}`,
      providerRef,
    };
  }

  async verifyWebhook(req: Request): Promise<WebhookVerifyOutput> {
    const body = (await req.json()) as {
      providerRef: string;
      status: 'succeeded' | 'failed';
      amountMinor: number;
      currency: string;
    };
    demoTransactions.set(body.providerRef, {
      amountMinor: body.amountMinor,
      currency: body.currency,
      status: body.status,
    });
    return {
      providerRef: body.providerRef,
      status: body.status,
      amountMinor: body.amountMinor,
      currency: body.currency,
    };
  }

  async verifyTransaction(providerRef: string): Promise<TransactionVerifyOutput> {
    const tx = demoTransactions.get(providerRef);
    if (!tx) {
      throw new Error(`DEMO_TX_NOT_FOUND:${providerRef}`);
    }
    return tx;
  }

  recordDemoDecision(
    providerRef: string,
    amountMinor: number,
    currency: string,
    status: 'succeeded' | 'failed'
  ) {
    demoTransactions.set(providerRef, { amountMinor, currency, status });
  }
}

