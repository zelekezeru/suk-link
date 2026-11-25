import { describe, it, expect } from 'vitest';
import type { PaymentMethodRow, ShopPaymentMethodRow, PlanRow, SubscriptionRow } from '../../src/lib/database.types';

/**
 * Filter payment methods enabled for BOTH the market and the shop (Section 4 Payments & Section 13).
 */
export function filterEnabledPaymentMethods(
  marketCode: string,
  shopAcceptsCredit: boolean,
  marketMethods: PaymentMethodRow[],
  shopMethods: ShopPaymentMethodRow[]
): PaymentMethodRow[] {
  const shopEnabledSet = new Set(
    shopMethods.filter((sm) => sm.is_enabled).map((sm) => sm.method_code)
  );
  return marketMethods
    .filter((pm) => {
      if (pm.market_code !== marketCode || !pm.is_enabled) return false;
      if (!shopEnabledSet.has(pm.code)) return false;
      if (pm.code === 'credit' && !shopAcceptsCredit) return false;
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Changing a plan's price affects new purchases and renewals only.
 * Existing subscriptions preserve their `last_paid_minor` and `current_period_end` (Section 4 Subscription & Section 13).
 */
export function applyPlanPriceChange(
  plan: PlanRow,
  newPriceMinor: number,
  existingSubscriptions: SubscriptionRow[]
): { updatedPlan: PlanRow; existingSubscriptions: SubscriptionRow[]; nextRenewalPriceMinor: number } {
  const updatedPlan: PlanRow = {
    ...plan,
    price_minor: newPriceMinor,
    updated_at: new Date().toISOString(),
  };

  // Existing subscriptions are not mutated when a plan price changes
  const untouchedSubs = existingSubscriptions.map((sub) => ({ ...sub }));

  return {
    updatedPlan,
    existingSubscriptions: untouchedSubs,
    nextRenewalPriceMinor: updatedPlan.price_minor,
  };
}

describe('Payment method filtering and Plan price change isolation (Section 13)', () => {
  const marketMethods: PaymentMethodRow[] = [
    {
      id: 'pm-1',
      market_code: 'ET',
      code: 'chapa',
      type: 'online',
      routing: 'via_chapa',
      name_i18n: { en: 'Chapa' },
      icon: 'CreditCard',
      sort_order: 1,
      is_enabled: true,
      config: {},
      created_at: '',
      updated_at: '',
    },
    {
      id: 'pm-2',
      market_code: 'ET',
      code: 'telebirr',
      type: 'online',
      routing: 'via_chapa',
      name_i18n: { en: 'telebirr' },
      icon: 'Smartphone',
      sort_order: 2,
      is_enabled: true,
      config: {},
      created_at: '',
      updated_at: '',
    },
    {
      id: 'pm-3',
      market_code: 'ET',
      code: 'cbe_birr',
      type: 'online',
      routing: 'via_chapa',
      name_i18n: { en: 'CBE Birr' },
      icon: 'Building2',
      sort_order: 3,
      is_enabled: false, // Disabled in market!
      config: {},
      created_at: '',
      updated_at: '',
    },
    {
      id: 'pm-4',
      market_code: 'ET',
      code: 'cash',
      type: 'offline',
      routing: 'manual',
      name_i18n: { en: 'Cash' },
      icon: 'Banknote',
      sort_order: 4,
      is_enabled: true,
      config: {},
      created_at: '',
      updated_at: '',
    },
    {
      id: 'pm-5',
      market_code: 'ET',
      code: 'credit',
      type: 'credit',
      routing: 'none',
      name_i18n: { en: 'Pay later (credit)' },
      icon: 'BookOpen',
      sort_order: 5,
      is_enabled: true,
      config: {},
      created_at: '',
      updated_at: '',
    },
  ];

  const shopMethods: ShopPaymentMethodRow[] = [
    { id: 'sm-1', shop_id: 'shop-1', method_code: 'chapa', is_enabled: true, created_at: '', updated_at: '' },
    { id: 'sm-2', shop_id: 'shop-1', method_code: 'telebirr', is_enabled: false, created_at: '', updated_at: '' }, // Disabled by shop!
    { id: 'sm-3', shop_id: 'shop-1', method_code: 'cbe_birr', is_enabled: true, created_at: '', updated_at: '' },
    { id: 'sm-4', shop_id: 'shop-1', method_code: 'cash', is_enabled: true, created_at: '', updated_at: '' },
    { id: 'sm-5', shop_id: 'shop-1', method_code: 'credit', is_enabled: true, created_at: '', updated_at: '' },
  ];

  it('shows only payment methods enabled for both the market and the shop (and respects accepts_credit)', () => {
    const enabledWithCredit = filterEnabledPaymentMethods('ET', true, marketMethods, shopMethods);
    expect(enabledWithCredit.map((m) => m.code)).toEqual(['chapa', 'cash', 'credit']);

    const enabledWithoutCredit = filterEnabledPaymentMethods('ET', false, marketMethods, shopMethods);
    expect(enabledWithoutCredit.map((m) => m.code)).toEqual(['chapa', 'cash']);
  });

  it('changing a plan price does not alter existing subscriptions', () => {
    const annualPlan: PlanRow = {
      id: 'plan-et-annual',
      market_code: 'ET',
      code: 'annual',
      name_i18n: { en: 'Annual Plan' },
      price_minor: 240000,
      currency_code: 'ETB',
      duration_days: 365,
      trial_days: 30,
      grace_days: 7,
      is_active: true,
      is_default: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const existingSub: SubscriptionRow = {
      id: 'sub-abebe',
      shop_id: 'shop-abebe',
      plan_id: annualPlan.id,
      status: 'active',
      last_paid_minor: 240000,
      current_period_start: '2026-01-01T00:00:00Z',
      current_period_end: '2027-01-01T00:00:00Z',
      suspended_reason: null,
      deleted_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const res = applyPlanPriceChange(annualPlan, 300000, [existingSub]);

    // Existing subscriber keeps last_paid_minor = 240000 and same expiry date
    expect(res.existingSubscriptions[0].last_paid_minor).toBe(240000);
    expect(res.existingSubscriptions[0].current_period_end).toBe('2027-01-01T00:00:00Z');
    // New purchases and renewals use the new price (300000)
    expect(res.nextRenewalPriceMinor).toBe(300000);
  });
});
