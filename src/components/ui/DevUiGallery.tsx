import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, Bell, Users, TrendingUp } from 'lucide-react';
import { Button } from './Button';
import { Input, Textarea, Select } from './Input';
import { Switch, Stepper } from './SwitchAndStepper';
import { StatusPill, Money } from './StatusPillAndMoney';
import { Card, KpiCard, ProductCard, ShopCard, OrderCard } from './Cards';
import {
  Skeleton,
  EmptyState,
  SyncStatusPill,
  OrderTimeline,
  BottomSheet,
  ImagePicker,
} from './FeedbackAndSheets';
import { useUiStore } from '../../stores/ui';
import { SUPPORTED_LOCALES } from '../../lib/i18n';
import type { LocaleCode } from '../../lib/database.types';

export function DevUiGallery() {
  const { t } = useTranslation();
  const { theme, setTheme, locale, setLocale } = useUiStore();
  const [switchVal, setSwitchVal] = useState(true);
  const [stepperVal, setStepperVal] = useState(2);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [imageVal, setImageVal] = useState<string | null>('/seed-images/teff-injera.svg');

  const sampleProduct = {
    id: 'prod-1',
    shop_id: 'shop-1',
    name: 'Teff Injera (5 pcs)',
    description: '100% pure magna teff injera',
    price_minor: 7500,
    unit: 'pack',
    category: 'Staples',
    image_url: '/seed-images/teff-injera.svg',
    is_available: true,
    sort_order: 1,
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sampleShop = {
    id: 'shop-1',
    owner_id: 'owner-1',
    market_code: 'ET',
    name: 'Abebe Mini Market',
    slug: 'abebe-mini-market',
    category: 'grocery',
    description: 'Fresh groceries in Bole',
    phone: '+251911200201',
    address_text: 'Bole Medhanialem, Addis Ababa',
    lat: 8.99,
    lng: 38.78,
    logo_url: '/seed-images/shop-abebe-logo.svg',
    cover_url: '/seed-images/shop-abebe-cover.svg',
    opening_time: '07:00',
    closing_time: '21:00',
    is_open: true,
    accepts_credit: true,
    offers_delivery: true,
    offers_pickup: true,
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sampleOrder = {
    id: 'ord-1',
    order_number: 'SL-0042',
    shop_id: 'shop-1',
    customer_id: 'cust-1',
    status: 'accepted' as const,
    payment_status: 'on_credit' as const,
    fulfilment: 'pickup' as const,
    currency_code: 'ETB',
    preferred_payment_method: 'credit',
    delivery_address: null,
    note: 'Please pack carefully',
    subtotal_minor: 97000,
    delivery_fee_minor: 0,
    total_minor: 97000,
    rejection_reason: null,
    placed_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(),
    completed_at: null,
    client_created_at: new Date().toISOString(),
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold text-primary">Suk Link Design System Gallery</h1>
          <p className="text-sm text-muted">{t('app.tagline')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SyncStatusPill />
          <select
            aria-label="Language switcher"
            value={locale}
            onChange={(e) => setLocale(e.target.value as LocaleCode)}
            className="min-h-[40px] px-3 rounded-input bg-surface border border-border text-sm font-medium"
          >
            {SUPPORTED_LOCALES.map((loc) => (
              <option key={loc.code} value={loc.code}>
                {loc.nativeName} ({loc.code})
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            Theme: {theme}
          </Button>
        </div>
      </div>

      {/* Buttons */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Buttons &amp; Touch Targets (≥ 44px)</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">{t('app.confirm')}</Button>
          <Button variant="secondary">{t('app.cancel')}</Button>
          <Button variant="ghost">{t('app.edit')}</Button>
          <Button variant="destructive">{t('app.delete')}</Button>
          <Button variant="primary" loading>
            {t('app.loading')}
          </Button>
        </div>
      </section>

      {/* Status Pills & Money */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Status Pills &amp; Tabular Money</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status="pending" kind="order" />
          <StatusPill status="accepted" kind="order" />
          <StatusPill status="processing" kind="order" />
          <StatusPill status="completed" kind="order" />
          <StatusPill status="rejected" kind="order" />
          <StatusPill status="cancelled" kind="order" />
          <StatusPill status="pending" kind="order" pendingSync />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusPill status="unpaid" kind="payment" />
          <StatusPill status="partially_paid" kind="payment" />
          <StatusPill status="paid" kind="payment" />
          <StatusPill status="on_credit" kind="payment" />
          <StatusPill status="trial" kind="subscription" />
          <StatusPill status="active" kind="subscription" />
          <StatusPill status="grace" kind="subscription" />
          <StatusPill status="expired" kind="subscription" />
        </div>
        <div className="text-xl pt-2">
          <Money amountMinor={124500} locale={locale} /> ·{' '}
          <Money amountMinor={97000} locale={locale} />
        </div>
      </section>

      {/* Inputs, Switch, Stepper, ImagePicker */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <h3 className="font-bold text-base">Form Controls</h3>
          <Input label={t('auth.fullName')} placeholder="Selam Tesfaye" />
          <Input
            label={t('auth.phone')}
            placeholder="+251 911 234 567"
            hint="Ethiopian format (+251)"
          />
          <Select
            label={t('shop.category')}
            options={[
              { value: 'grocery', label: t('shop.categoryGrocery') },
              { value: 'bakery', label: t('shop.categoryBakery') },
            ]}
          />
          <Textarea label={t('customer.orderNote')} placeholder="Optional delivery note…" />
        </Card>

        <Card className="space-y-5">
          <h3 className="font-bold text-base">Interactive Controls</h3>
          <Switch
            checked={switchVal}
            onCheckedChange={setSwitchVal}
            label={t('shop.acceptsCredit')}
          />
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Stepper:</span>
            <Stepper
              value={stepperVal}
              onIncrement={() => setStepperVal((v) => v + 1)}
              onDecrement={() => setStepperVal((v) => Math.max(0, v - 1))}
            />
          </div>
          <ImagePicker
            label="Product Image"
            value={imageVal}
            onChange={(url) => setImageVal(url)}
          />
          <div>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open Bottom Sheet
            </Button>
          </div>
        </Card>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label={t('shop.todayOrders')}
          value="14"
          icon={<ShoppingBag className="w-4 h-4" />}
        />
        <KpiCard
          label={t('shop.todaySales')}
          value={<Money amountMinor={482000} locale={locale} />}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <KpiCard
          label={t('shop.outstandingCredit')}
          value={<Money amountMinor={86500} locale={locale} />}
          icon={<Users className="w-4 h-4" />}
        />
        <KpiCard
          label="Unread Alerts"
          value="3"
          icon={<Bell className="w-4 h-4" />}
        />
      </section>

      {/* Cards & Timeline */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ShopCard shop={sampleShop} onClick={() => {}} />
        <ProductCard
          product={sampleProduct}
          quantityInCart={stepperVal}
          onAdd={() => setStepperVal(1)}
          onIncrement={() => setStepperVal((v) => v + 1)}
          onDecrement={() => setStepperVal((v) => Math.max(0, v - 1))}
        />
        <div className="space-y-4">
          <OrderCard order={sampleOrder} subtitle="Selam Tesfaye" onClick={() => {}} />
          <Card>
            <h4 className="text-xs font-semibold text-muted uppercase mb-2">Timeline</h4>
            <OrderTimeline currentStatus="processing" />
          </Card>
        </div>
      </section>

      {/* Skeleton & EmptyState */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="space-y-3">
          <h4 className="text-sm font-semibold">Skeleton Loading State</h4>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-6 w-2/3" />
        </Card>
        <EmptyState
          icon={<ShoppingBag className="w-6 h-6" />}
          title={t('customer.emptyCart')}
          description="Add fresh items from nearby neighborhood shops."
          actionLabel={t('customer.emptyCartAction')}
          onAction={() => {}}
        />
      </section>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Sample Bottom Sheet"
      >
        <p className="text-sm text-muted mb-4">
          Radix Dialog + responsive mobile bottom sheet / desktop modal.
        </p>
        <Button className="w-full" onClick={() => setSheetOpen(false)}>
          {t('app.close')}
        </Button>
      </BottomSheet>
    </div>
  );
}
