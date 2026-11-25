// supabase/functions/_shared/chapa.ts
// ChapaProvider (primary Ethiopian gateway, supports telebirr and CBE Birr via_chapa)
// Plus direct TelebirrProvider and CbeBirrProvider behind credentials flags

import type {
  PaymentProvider,
  PaymentInitInput,
  PaymentInitOutput,
  WebhookVerifyOutput,
  TransactionVerifyOutput,
} from './provider';
import { formatMinor } from './money';

async function computeHmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class ChapaProvider implements PaymentProvider {
  code: 'chapa' = 'chapa';
  private secretKey: string;
  private webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.secretKey = secretKey;
    this.webhookSecret = webhookSecret;
  }

  async initiate(input: PaymentInitInput): Promise<PaymentInitOutput> {
    const providerRef = `CHAPA-${input.paymentId}`;
    const [firstName, ...rest] = (input.customer.name || 'Customer').split(' ');
    const lastName = rest.join(' ') || 'SukLink';

    // Map telebirr / cbe_birr wallet preselection hint when routing via Chapa
    const preferredWallet =
      input.method === 'telebirr'
        ? 'telebirr'
        : input.method === 'cbe_birr'
          ? 'cbebirr'
          : undefined;

    const payload: Record<string, unknown> = {
      amount: formatMinor(input.amountMinor, 2),
      currency: input.currency,
      email: input.customer.email || 'customer@suklink.et',
      first_name: firstName,
      last_name: lastName,
      phone_number: input.customer.phone || undefined,
      tx_ref: providerRef,
      callback_url: input.callbackUrl,
      return_url: input.returnUrl,
      customization: {
        title: 'Suk Link Order Payment',
        description: `Payment ${providerRef}`,
      },
      meta: {
        payment_id: input.paymentId,
        preferred_method: input.method || 'chapa',
      },
    };

    if (preferredWallet) {
      payload.payment_method = preferredWallet;
    }

    const res = await fetch('https://api.chapa.co/v1/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`CHAPA_INIT_FAILED:${errText}`);
    }

    const data = (await res.json()) as { data?: { checkout_url?: string } };
    if (!data?.data?.checkout_url) {
      throw new Error('CHAPA_MISSING_CHECKOUT_URL');
    }

    return {
      checkoutUrl: data.data.checkout_url,
      providerRef,
    };
  }

  async verifyWebhook(req: Request): Promise<WebhookVerifyOutput> {
    const signature =
      req.headers.get('x-chapa-signature') || req.headers.get('chapa-signature') || '';
    const rawBody = await req.text();
    const expectedHmac = await computeHmacSha256Hex(this.webhookSecret, rawBody);

    if (!signature || signature !== expectedHmac) {
      throw new Error('INVALID_CHAPA_WEBHOOK_SIGNATURE');
    }

    const parsed = JSON.parse(rawBody) as {
      tx_ref: string;
      status: string;
      amount: string | number;
      currency: string;
    };

    const amountMinor = Math.round(Number(parsed.amount) * 100);
    return {
      providerRef: parsed.tx_ref,
      status: parsed.status === 'success' || parsed.status === 'succeeded' ? 'succeeded' : 'failed',
      amountMinor,
      currency: parsed.currency,
    };
  }

  async verifyTransaction(providerRef: string): Promise<TransactionVerifyOutput> {
    const res = await fetch(
      `https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(providerRef)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      }
    );

    if (!res.ok) {
      throw new Error(`CHAPA_VERIFY_FAILED:${providerRef}`);
    }

    const json = (await res.json()) as {
      data: { status: string; amount: string | number; currency: string };
    };
    const amountMinor = Math.round(Number(json.data.amount) * 100);
    const status =
      json.data.status === 'success'
        ? 'succeeded'
        : json.data.status === 'failed'
          ? 'failed'
          : 'pending';

    return {
      status,
      amountMinor,
      currency: json.data.currency,
    };
  }
}

export class TelebirrProvider implements PaymentProvider {
  code: 'telebirr' = 'telebirr';
  private appId: string;
  private appKey: string;

  constructor(appId = '', appKey = '') {
    this.appId = appId;
    this.appKey = appKey;
  }

  isConfigured(): boolean {
    return Boolean(this.appId && this.appKey);
  }

  async initiate(_input: PaymentInitInput): Promise<PaymentInitOutput> {
    if (!this.isConfigured()) {
      throw new Error('TELEBIRR_DIRECT_CREDENTIALS_NOT_CONFIGURED');
    }
    throw new Error('TELEBIRR_DIRECT_LIVE_ENDPOINT_UNREACHABLE');
  }

  async verifyWebhook(_req: Request): Promise<WebhookVerifyOutput> {
    if (!this.isConfigured()) {
      throw new Error('TELEBIRR_DIRECT_CREDENTIALS_NOT_CONFIGURED');
    }
    throw new Error('TELEBIRR_WEBHOOK_NOT_CONFIGURED');
  }

  async verifyTransaction(_providerRef: string): Promise<TransactionVerifyOutput> {
    if (!this.isConfigured()) {
      throw new Error('TELEBIRR_DIRECT_CREDENTIALS_NOT_CONFIGURED');
    }
    throw new Error('TELEBIRR_VERIFY_NOT_CONFIGURED');
  }
}

export class CbeBirrProvider implements PaymentProvider {
  code: 'cbe_birr' = 'cbe_birr';
  private merchantId: string;
  private apiKey: string;

  constructor(merchantId = '', apiKey = '') {
    this.merchantId = merchantId;
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.merchantId && this.apiKey);
  }

  async initiate(_input: PaymentInitInput): Promise<PaymentInitOutput> {
    if (!this.isConfigured()) {
      throw new Error('CBEBIRR_DIRECT_CREDENTIALS_NOT_CONFIGURED');
    }
    throw new Error('CBEBIRR_DIRECT_LIVE_ENDPOINT_UNREACHABLE');
  }

  async verifyWebhook(_req: Request): Promise<WebhookVerifyOutput> {
    if (!this.isConfigured()) {
      throw new Error('CBEBIRR_DIRECT_CREDENTIALS_NOT_CONFIGURED');
    }
    throw new Error('CBEBIRR_WEBHOOK_NOT_CONFIGURED');
  }

  async verifyTransaction(_providerRef: string): Promise<TransactionVerifyOutput> {
    if (!this.isConfigured()) {
      throw new Error('CBEBIRR_DIRECT_CREDENTIALS_NOT_CONFIGURED');
    }
    throw new Error('CBEBIRR_VERIFY_NOT_CONFIGURED');
  }
}

