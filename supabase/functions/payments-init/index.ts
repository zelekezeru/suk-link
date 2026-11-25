// supabase/functions/payments-init/index.ts
// Edge Function: Initiate an online order or subscription payment

import { PaymentInitSchema } from '../_shared/schemas';
import { DemoProvider } from '../_shared/demo';
import { ChapaProvider, TelebirrProvider, CbeBirrProvider } from '../_shared/chapa';

export async function handlePaymentInit(
  body: unknown,
  env: Record<string, string | undefined>,
  context: {
    userId: string;
    amountMinor: number;
    currencyCode: string;
    customerName: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    paymentId: string;
    routing: 'via_chapa' | 'direct' | 'manual' | 'none';
  }
) {
  const parsed = PaymentInitSchema.parse(body);
  const paymentMode = env.PAYMENT_MODE || 'demo';
  const appPublicUrl = env.APP_PUBLIC_URL || 'http://localhost:5173';

  if (paymentMode === 'demo') {
    const demo = new DemoProvider(appPublicUrl);
    const res = await demo.initiate({
      paymentId: context.paymentId,
      amountMinor: context.amountMinor,
      currency: context.currencyCode,
      customer: {
        id: context.userId,
        name: context.customerName,
        email: context.customerEmail,
        phone: context.customerPhone,
      },
      returnUrl: parsed.return_url || `${appPublicUrl}/c/orders`,
      callbackUrl: `${appPublicUrl}/api/functions/payments-webhook/demo`,
      method: parsed.method_code,
    });
    return { ...res, provider: 'demo' as const };
  }

  if (parsed.method_code === 'telebirr' && context.routing === 'direct') {
    const telebirr = new TelebirrProvider(env.TELEBIRR_APP_ID, env.TELEBIRR_APP_KEY);
    const res = await telebirr.initiate({
      paymentId: context.paymentId,
      amountMinor: context.amountMinor,
      currency: context.currencyCode,
      customer: { id: context.userId, name: context.customerName },
      returnUrl: parsed.return_url || `${appPublicUrl}/c/orders`,
      callbackUrl: `${appPublicUrl}/api/functions/payments-webhook/telebirr`,
      method: 'telebirr',
    });
    return { ...res, provider: 'telebirr' as const };
  }

  if (parsed.method_code === 'cbe_birr' && context.routing === 'direct') {
    const cbe = new CbeBirrProvider(env.CBEBIRR_MERCHANT_ID, env.CBEBIRR_API_KEY);
    const res = await cbe.initiate({
      paymentId: context.paymentId,
      amountMinor: context.amountMinor,
      currency: context.currencyCode,
      customer: { id: context.userId, name: context.customerName },
      returnUrl: parsed.return_url || `${appPublicUrl}/c/orders`,
      callbackUrl: `${appPublicUrl}/api/functions/payments-webhook/cbe_birr`,
      method: 'cbe_birr',
    });
    return { ...res, provider: 'cbe_birr' as const };
  }

  const chapa = new ChapaProvider(
    env.CHAPA_SECRET_KEY || '',
    env.CHAPA_WEBHOOK_SECRET || ''
  );
  const res = await chapa.initiate({
    paymentId: context.paymentId,
    amountMinor: context.amountMinor,
    currency: context.currencyCode,
    customer: {
      id: context.userId,
      name: context.customerName,
      email: context.customerEmail,
      phone: context.customerPhone,
    },
    returnUrl: parsed.return_url || `${appPublicUrl}/c/orders`,
    callbackUrl: `${appPublicUrl}/api/functions/payments-webhook/chapa`,
    method: parsed.method_code,
  });
  return { ...res, provider: 'chapa' as const };
}

