import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ShoppingBag,
  TrendingUp,
  Wallet,
  Users,
  Plus,
  Search,
  Phone,
  ArrowLeft,
  Trash2,
  Edit3,
  CreditCard,
  Store,
  HelpCircle,
  User,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, KpiCard, OrderCard } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { Input, Textarea, Select } from '../../components/ui/Input';
import { Switch } from '../../components/ui/SwitchAndStepper';
import { Money, StatusPill } from '../../components/ui/StatusPillAndMoney';
import {
  EmptyState,
  OrderTimeline,
  BottomSheet,
  ImagePicker,
} from '../../components/ui/FeedbackAndSheets';
import { useSessionStore } from '../auth/useSession';
import { useUiStore } from '../../stores/ui';
import { useMarket } from '../../lib/useMarket';
import { isMarketToday } from '../../lib/dates';
import { resolveAssetUrl } from '../../lib/images';
import { toMinor, fromMinorToDecimal } from '../../lib/money';
import { translateJsonb } from '../../lib/i18n';
import { getUserDb } from '../../lib/sync/db';
import { enqueueOutboxMutation } from '../../lib/sync/outbox';
import { refreshOutboxBadges } from '../../lib/sync/engine';
import { pullTableDelta, type SyncedTableName } from '../../lib/sync/pull';
import { useFreshTables } from '../../lib/sync/useFreshTables';
import {
  apiCallRpc,
  apiUpsertRow,
  apiUpdateRow,
  apiInitPayment,
} from '../../lib/supabase';
import type { ProductRow, OrderStatus } from '../../lib/database.types';

const SHOP_ORDERS_TABLES: readonly SyncedTableName[] = ['orders', 'order_items'];
const SUBSCRIPTION_TABLES: readonly SyncedTableName[] = ['subscriptions', 'plans', 'payments'];

export function useMyShop() {
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');

  const shops =
    useLiveQuery(async () => {
      if (!user) return [];
      return await db.shops.toArray();
    }, [user?.id]) || [];

  const shop = shops.find((s) => s.owner_id === user?.id && !s.deleted_at);

  const subs =
    useLiveQuery(async () => {
      if (!user) return [];
      return await db.subscriptions.toArray();
    }, [user?.id]) || [];

  const subscription = shop ? subs.find((s) => s.shop_id === shop.id) : undefined;

  return { shop, subscription, db, user };
}

export function ShopSetupOrProfilePage({ isSetupWizard = false }: { isSetupWizard?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shop, db, user } = useMyShop();
  const { market } = useMarket(shop?.market_code || user?.market_code);

  const [name, setName] = useState(shop?.name || '');
  const [category, setCategory] = useState(shop?.category || 'grocery');
  const [phone, setPhone] = useState(shop?.phone || user?.phone || market.phone_country_code + '9');
  const [addressText, setAddressText] = useState(shop?.address_text || 'Bole, Addis Ababa');
  const [description, setDescription] = useState(shop?.description || '');
  const [openingTime, setOpeningTime] = useState(shop?.opening_time || '07:00');
  const [closingTime, setClosingTime] = useState(shop?.closing_time || '21:00');
  const [isOpen, setIsOpen] = useState(shop?.is_open ?? true);
  const [acceptsCredit, setAcceptsCredit] = useState(shop?.accepts_credit ?? true);
  const [offersDelivery, setOffersDelivery] = useState(shop?.offers_delivery ?? true);
  const [offersPickup, setOffersPickup] = useState(shop?.offers_pickup ?? true);
  const [logoUrl, setLogoUrl] = useState<string | null>(shop?.logo_url || null);
  const [coverUrl, setCoverUrl] = useState<string | null>(shop?.cover_url || null);
  const [saving, setSaving] = useState(false);

  // Sync local state when shop loads
  React.useEffect(() => {
    if (shop) {
      setName(shop.name);
      setCategory(shop.category);
      setPhone(shop.phone);
      setAddressText(shop.address_text);
      setDescription(shop.description || '');
      setOpeningTime(shop.opening_time);
      setClosingTime(shop.closing_time);
      setIsOpen(shop.is_open);
      setAcceptsCredit(shop.accepts_credit);
      setOffersDelivery(shop.offers_delivery);
      setOffersPickup(shop.offers_pickup);
      setLogoUrl(shop.logo_url);
      setCoverUrl(shop.cover_url);
    }
  }, [shop]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const shopId = shop?.id || crypto.randomUUID();
      const slug =
        shop?.slug ||
        `${name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')}-${shopId.slice(0, 4)}`;

      await apiUpsertRow('shops', {
        id: shopId,
        owner_id: user.id,
        market_code: shop?.market_code || user.market_code || 'ET',
        name,
        slug,
        category,
        description,
        phone,
        address_text: addressText,
        opening_time: openingTime,
        closing_time: closingTime,
        is_open: isOpen,
        accepts_credit: acceptsCredit,
        offers_delivery: offersDelivery,
        offers_pickup: offersPickup,
        logo_url: logoUrl,
        cover_url: coverUrl,
      });

      await pullTableDelta(db, 'shops', true);
      await pullTableDelta(db, 'subscriptions', true);
      await pullTableDelta(db, 'shop_payment_methods', true);

      toast.success(isSetupWizard ? 'Shop launched with 30-day free trial!' : t('app.save'));
      navigate('/s/dashboard', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save shop');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {isSetupWizard ? t('shop.setupTitle') : t('nav.shopProfile')}
        </h1>
        {isSetupWizard && <p className="text-sm text-muted mt-1">{t('shop.setupSubtitle')}</p>}
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isSetupWizard && (
            <div className="p-3 rounded-card bg-surface-muted flex items-center justify-between">
              <span className="text-sm font-semibold">{t('shop.shopOpenToggle')}</span>
              <Switch
                checked={isOpen}
                onCheckedChange={setIsOpen}
                aria-label={t('shop.shopOpenToggle')}
              />
            </div>
          )}

          <Input
            label={t('shop.shopName')}
            data-testid="shop-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('ui.examples.shopName')}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label={t('shop.category')}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={[
                { value: 'grocery', label: t('shop.categoryGrocery') },
                { value: 'bakery', label: t('shop.categoryBakery') },
                { value: 'pharmacy', label: t('shop.categoryPharmacy') },
                { value: 'electronics', label: t('shop.categoryElectronics') },
                { value: 'other', label: t('shop.categoryOther') },
              ]}
            />
            <Input
              label={t('auth.phone')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <Input
            label={t('shop.address')}
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            required
          />

          <Textarea
            label={t('shop.productDescription')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('ui.shop.openingTime')}
              type="time"
              value={openingTime}
              onChange={(e) => setOpeningTime(e.target.value)}
            />
            <Input
              label={t('ui.shop.closingTime')}
              type="time"
              value={closingTime}
              onChange={(e) => setClosingTime(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImagePicker label={t('ui.shop.logo')} value={logoUrl} onChange={setLogoUrl} />
            <ImagePicker label={t('ui.shop.cover')} value={coverUrl} onChange={setCoverUrl} />
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            <Switch
              checked={acceptsCredit}
              onCheckedChange={setAcceptsCredit}
              label={t('shop.acceptsCredit')}
            />
            <div className="flex flex-wrap gap-6">
              <Switch
                checked={offersPickup}
                onCheckedChange={setOffersPickup}
                label={t('shop.offersPickup')}
              />
              <Switch
                checked={offersDelivery}
                onCheckedChange={setOffersDelivery}
                label={t('shop.offersDelivery')}
              />
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={saving}
            data-testid="shop-save-btn"
          >
            {isSetupWizard ? t('shop.launchShopBtn') : t('app.save')}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function ShopDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shop, subscription, db, user } = useMyShop();
  const { currency, market } = useMarket(shop?.market_code);

  // Indexed by shop_id: a year of orders on a budget phone must not be scanned in JS.
  const shopId = shop?.id;
  const shopOrders =
    useLiveQuery(
      async () => (shopId ? db.orders.where('shop_id').equals(shopId).toArray() : []),
      [shopId, db]
    ) || [];
  const orders = [...shopOrders].sort((a, b) => b.placed_at.localeCompare(a.placed_at));

  const payments =
    useLiveQuery(
      async () => (shopId ? db.payments.where('shop_id').equals(shopId).toArray() : []),
      [shopId, db]
    ) || [];

  const ledgerEntries =
    useLiveQuery(
      async () => (shopId ? db.ledger_entries.where('shop_id').equals(shopId).toArray() : []),
      [shopId, db]
    ) || [];

  const profilesMap =
    useLiveQuery(async () => {
      const all = await db.profiles.toArray();
      return new Map(all.map((p) => [p.id, p]));
    }, [user?.id]) || new Map();

  if (!shop) {
    return (
      <div className="py-12">
        <EmptyState
          icon={<Store className="w-6 h-6" />}
          title={t('shop.setupTitle')}
          description={t('shop.setupSubtitle')}
          actionLabel={t('shop.setupTitle')}
          onAction={() => navigate('/s/setup')}
        />
      </div>
    );
  }

  // "Today" is the market's calendar day (e.g. Africa/Addis_Ababa), not the UTC day.
  const now = new Date();
  const ordersToday = orders.filter((o) => isMarketToday(o.placed_at, market.timezone, now));
  const salesTodayMinor = ordersToday
    .filter((o) => ['accepted', 'processing', 'completed'].includes(o.status))
    .reduce((sum, o) => sum + o.total_minor, 0);

  const collectedTodayMinor = payments
    .filter(
      (p) =>
        p.purpose === 'order' &&
        p.status === 'succeeded' &&
        isMarketToday(p.paid_at || p.created_at, market.timezone, now)
    )
    .reduce((sum, p) => sum + p.amount_minor, 0);

  // Per-customer credit balance
  const customerBalances = new Map<string, number>();
  for (const e of ledgerEntries) {
    customerBalances.set(e.customer_id, (customerBalances.get(e.customer_id) || 0) + e.amount_minor);
  }
  const totalOutstandingMinor = Array.from(customerBalances.values())
    .filter((v) => v > 0)
    .reduce((a, b) => a + b, 0);

  const customersWithBalances = Array.from(customerBalances.entries()).filter(
    ([, bal]) => bal > 0
  );

  const newPendingOrders = orders.filter((o) => o.status === 'pending');

  const daysLeft = subscription
    ? Math.ceil(
        (new Date(subscription.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : 30;

  const handleQuickAccept = async (orderId: string) => {
    try {
      await apiCallRpc('update_order_status', {
        p_order_id: orderId,
        p_to_status: 'accepted',
        p_reason: null,
      });
      await pullTableDelta(db, 'orders');
      await pullTableDelta(db, 'ledger_entries');
      toast.success(t('ui.shop.orderAccepted'));
    } catch (err: any) {
      toast.error(err?.message || 'Error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{shop.name}</h1>
          <p className="text-xs text-muted">{shop.address_text}</p>
        </div>
        {subscription && (
          <StatusPill status={subscription.status} kind="subscription" />
        )}
      </div>

      {/* Subscription Reminder Banner if trial, grace, or expiring within 30 days (Section 8) */}
      {subscription && (subscription.status !== 'active' || daysLeft <= 30) && (
        <button
          type="button"
          onClick={() => navigate('/s/subscription')}
          className="w-full text-left p-3.5 rounded-card bg-warning-tint border border-warning/40 flex items-center justify-between gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex items-center gap-2.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{t('subscription.expiryBanner', { days: Math.max(0, daysLeft) })}</span>
          </span>
          <span className="text-xs font-bold underline">{t('ui.common.manage')}</span>
        </button>
      )}

      {/* Today's 4 KPI Cards (Section 8) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard
          label={t('shop.todayOrders')}
          value={<span data-testid="kpi-orders-today">{ordersToday.length}</span>}
          icon={<ShoppingBag className="w-4 h-4" />}
        />
        <KpiCard
          label={t('shop.todaySales')}
          value={
            <span data-testid="kpi-sales-today">
              <Money amountMinor={salesTodayMinor} currency={currency} />
            </span>
          }
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <KpiCard
          label={t('shop.todayCollected')}
          value={
            <span data-testid="kpi-collected-today">
              <Money amountMinor={collectedTodayMinor} currency={currency} />
            </span>
          }
          icon={<Wallet className="w-4 h-4" />}
        />
        <KpiCard
          label={t('shop.outstandingCredit')}
          value={
            <span data-testid="kpi-outstanding-credit">
              <Money amountMinor={totalOutstandingMinor} currency={currency} />
            </span>
          }
          icon={<Users className="w-4 h-4" />}
        />
      </div>

      {/* New Orders List with Quick Accept */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">
            {t('shop.newOrders')} ({newPendingOrders.length})
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/s/orders')}>
            {t('ui.common.viewAll')}
          </Button>
        </div>

        {newPendingOrders.length === 0 ? (
          <Card className="text-center py-6 text-sm text-muted">
            {t('ui.shop.noPendingOrders')}
          </Card>
        ) : (
          <div className="space-y-3">
            {newPendingOrders.slice(0, 5).map((ord) => {
              const cust = profilesMap.get(ord.customer_id);
              return (
                <OrderCard
                  key={ord.id}
                  order={ord}
                  currency={currency}
                  subtitle={cust?.full_name || 'Customer'}
                  onClick={() => navigate(`/s/orders/${ord.id}`)}
                  actions={
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        data-testid={`dashboard-accept-${ord.order_number}`}
                        onClick={() => handleQuickAccept(ord.id)}
                      >
                        {t('shop.acceptOrder')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/s/orders/${ord.id}`)}
                      >
                        {t('ui.common.details')}
                      </Button>
                    </>
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Customers with Balances Summary Card (Supporting Feature 4) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">
            {t('shop.customersWithBalances')} ({customersWithBalances.length})
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/s/customers')}>
            {t('ui.common.viewAll')}
          </Button>
        </div>

        <Card className="divide-y divide-border p-0 overflow-hidden">
          {customersWithBalances.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              {t('ui.shop.noBalances')}
            </div>
          ) : (
            customersWithBalances.map(([custId, bal]) => {
              const cust = profilesMap.get(custId);
              return (
                <button
                  type="button"
                  key={custId}
                  onClick={() => navigate(`/s/customers/${custId}`)}
                  className="w-full text-left p-4 flex items-center justify-between hover:bg-surface-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="block">
                    <span className="block text-sm font-bold text-foreground">
                      {cust?.full_name || 'Customer'}
                    </span>
                    <span className="block text-xs text-muted">{cust?.phone}</span>
                  </span>
                  <Money amountMinor={bal} currency={currency} className="text-base text-warning" />
                </button>
              );
            })
          )}
        </Card>
      </section>
    </div>
  );
}

export function ShopOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shop, db } = useMyShop();
  const { currency } = useMarket(shop?.market_code);
  const [tab, setTab] = useState<'new' | 'active' | 'completed' | 'cancelled'>('new');
  const [search, setSearch] = useState('');

  // Opens on fresh data; new orders then arrive through Realtime into Dexie.
  useFreshTables(SHOP_ORDERS_TABLES);

  const shopOrders =
    useLiveQuery(
      async () => (shop ? db.orders.where('shop_id').equals(shop.id).toArray() : []),
      [shop?.id, db]
    ) || [];

  const orders = [...shopOrders].sort((a, b) => b.placed_at.localeCompare(a.placed_at));

  const profilesMap =
    useLiveQuery(async () => {
      const all = await db.profiles.toArray();
      return new Map(all.map((p) => [p.id, p]));
    }, [shop?.id, db]) || new Map();

  const counts = {
    new: orders.filter((o) => o.status === 'pending').length,
    active: orders.filter((o) => ['accepted', 'processing'].includes(o.status)).length,
    completed: orders.filter((o) => o.status === 'completed').length,
    cancelled: orders.filter((o) => ['rejected', 'cancelled'].includes(o.status)).length,
  };

  const filtered = orders.filter((o) => {
    const inTab =
      tab === 'new'
        ? o.status === 'pending'
        : tab === 'active'
          ? ['accepted', 'processing'].includes(o.status)
          : tab === 'completed'
            ? o.status === 'completed'
            : ['rejected', 'cancelled'].includes(o.status);
    if (!inTab) return false;
    if (!search.trim()) return true;
    const cust = profilesMap.get(o.customer_id);
    const q = search.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      (cust?.full_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">{t('nav.orders')}</h1>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('ui.shop.searchOrders')}
          className="min-h-[40px] px-3.5 py-1.5 rounded-input bg-surface border border-border text-sm"
        />
      </div>

      {/* 4 Status Tabs with Count Badges (Section 4 D) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(
          [
            { key: 'new', label: t('shop.tabNew'), count: counts.new },
            { key: 'active', label: t('shop.tabActive'), count: counts.active },
            { key: 'completed', label: t('shop.tabCompleted'), count: counts.completed },
            { key: 'cancelled', label: t('shop.tabCancelled'), count: counts.cancelled },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            data-testid={`shop-orders-tab-${item.key}`}
            onClick={() => setTab(item.key)}
            className={`min-h-[40px] px-4 py-2 rounded-pill text-xs font-bold inline-flex items-center gap-2 border transition-colors ${
              tab === item.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface text-muted border-border hover:text-foreground'
            }`}
          >
            <span>{item.label}</span>
            <span className="px-1.5 py-0.5 rounded-pill bg-black/15 text-[11px]">
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="w-6 h-6" />}
          title={t('ui.shop.noOrdersInTab')}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((ord) => {
            const cust = profilesMap.get(ord.customer_id);
            return (
              <OrderCard
                key={ord.id}
                order={ord}
                currency={currency}
                subtitle={`${cust?.full_name || 'Customer'} • ${cust?.phone || ''}`}
                onClick={() => navigate(`/s/orders/${ord.id}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ShopOrderDetailPage() {
  const { t } = useTranslation();
  const { orderId } = useParams<{ orderId: string }>();
  const { shop, db } = useMyShop();
  const isOnline = useUiStore((s) => s.isOnline);
  const { currency } = useMarket(shop?.market_code);

  const order = useLiveQuery(async () => (orderId ? db.orders.get(orderId) : undefined), [orderId]);
  const items =
    useLiveQuery(async () => {
      if (!orderId) return [];
      return await db.order_items.where('order_id').equals(orderId).toArray();
    }, [orderId]) || [];
  const customer = useLiveQuery(
    async () => (order?.customer_id ? db.profiles.get(order.customer_id) : undefined),
    [order?.customer_id]
  );

  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('Item out of stock');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmountDecimal, setPaymentAmountDecimal] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  if (!order) {
    return <div className="py-12 text-center text-sm text-muted">{t('app.loading')}</div>;
  }

  const transitionTo = async (toStatus: OrderStatus, reason?: string) => {
    setBusy(true);
    try {
      if (!isOnline || !navigator.onLine) {
        await enqueueOutboxMutation(db, 'update_order_status', {
          order_id: order.id,
          to_status: toStatus,
          reason: reason || null,
        });
        await refreshOutboxBadges(db);
        toast.info(t('ui.shop.statusQueued'));
      } else {
        await apiCallRpc('update_order_status', {
          p_order_id: order.id,
          p_to_status: toStatus,
          p_reason: reason || null,
        });
        await pullTableDelta(db, 'orders');
        await pullTableDelta(db, 'order_events');
        await pullTableDelta(db, 'ledger_entries');
        toast.success(`Order marked ${toStatus}`);
      }
      setRejectOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Transition failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePutOnCredit = async () => {
    setBusy(true);
    try {
      await apiCallRpc('set_order_on_credit', { p_order_id: order.id });
      await pullTableDelta(db, 'orders');
      toast.success(t('ui.shop.orderOnCredit'));
    } catch (err: any) {
      toast.error(err?.message || 'Could not put on credit');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setBusy(true);
    try {
      const amountMinor = toMinor(paymentAmountDecimal, currency.digits);
      await apiCallRpc('record_payment', {
        p_idempotency_key: `shop_pay_${order.id}_${Date.now()}`,
        p_shop_id: shop.id,
        p_customer_id: order.customer_id,
        p_order_id: order.id,
        p_amount_minor: amountMinor,
        p_method: 'cash',
        p_note: paymentNote || `Cash payment for ${order.order_number}`,
      });
      await pullTableDelta(db, 'payments');
      await pullTableDelta(db, 'ledger_entries');
      await pullTableDelta(db, 'orders');
      setPaymentOpen(false);
      toast.success(t('ui.shop.paymentRecorded'));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-20">
      <div className="flex items-center justify-between">
        <Link
          to="/s/orders"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('nav.orders')}</span>
        </Link>
        <div className="flex items-center gap-2">
          <StatusPill status={order.status} kind="order" pendingSync={order._pending} />
          <StatusPill status={order.payment_status} kind="payment" />
        </div>
      </div>

      {/* Customer & Timeline */}
      <Card className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{order.order_number}</h1>
            <p className="text-sm font-medium text-foreground mt-0.5">
              {customer?.full_name || 'Customer'}
            </p>
            {customer?.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-1"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>{customer.phone}</span>
              </a>
            )}
          </div>
          <div className="text-right">
            <Money amountMinor={order.total_minor} currency={currency} className="text-xl text-primary" />
            <div className="text-xs text-muted capitalize">{order.fulfilment}</div>
          </div>
        </div>

        {order.note && (
          <div className="p-3 rounded-input bg-surface-muted text-xs text-foreground">
            <span className="font-semibold">{t('ui.shop.noteLabel')}</span> {order.note}
          </div>
        )}

        <OrderTimeline
          currentStatus={order.status}
          rejectionReason={order.rejection_reason}
        />

        {/* Status Transition Actions (Section 4 D) */}
        <div className="flex flex-wrap gap-3 pt-3 border-t border-border">
          {order.status === 'pending' && (
            <>
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                loading={busy}
                data-testid="shop-accept-order-btn"
                onClick={() => transitionTo('accepted')}
              >
                {t('shop.acceptOrder')}
              </Button>
              <Button
                variant="destructive"
                size="lg"
                disabled={busy}
                data-testid="shop-reject-order-btn"
                onClick={() => setRejectOpen(true)}
              >
                {t('shop.rejectOrder')}
              </Button>
            </>
          )}

          {order.status === 'accepted' && (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              loading={busy}
              data-testid="shop-start-processing-btn"
              onClick={() => transitionTo('processing')}
            >
              {t('shop.startProcessing')}
            </Button>
          )}

          {order.status === 'processing' && (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              loading={busy}
              data-testid="shop-mark-completed-btn"
              onClick={() => transitionTo('completed')}
            >
              {t('shop.markCompleted')}
            </Button>
          )}

          {order.status !== 'pending' &&
            order.status !== 'rejected' &&
            order.status !== 'cancelled' &&
            order.payment_status !== 'paid' && (
              <div className="w-full flex flex-wrap gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="shop-record-payment-btn"
                  onClick={() => {
                    setPaymentAmountDecimal(fromMinorToDecimal(order.total_minor, currency.digits));
                    setPaymentOpen(true);
                  }}
                >
                  {t('shop.recordPayment')}
                </Button>
                {order.payment_status !== 'on_credit' && shop?.accepts_credit && (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="shop-put-on-credit-btn"
                    onClick={handlePutOnCredit}
                  >
                    {t('shop.putOnCredit')}
                  </Button>
                )}
              </div>
            )}
        </div>
      </Card>

      {/* Items Table */}
      <Card className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider">{t('ui.shop.orderItems')}</h2>
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="py-2.5 flex items-center justify-between text-sm">
              <div>
                <span className="font-bold">{item.quantity}×</span> {item.product_name_snapshot}
                <span className="text-xs text-muted ml-1.5">
                  (<Money amountMinor={item.unit_price_minor} currency={currency} /> /{' '}
                  {item.unit_snapshot})
                </span>
              </div>
              <Money amountMinor={item.line_total_minor} currency={currency} />
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-border flex justify-between font-bold text-base">
          <span>{t('customer.total')}</span>
          <Money amountMinor={order.total_minor} currency={currency} />
        </div>
      </Card>

      {/* Reject Reason Sheet */}
      <BottomSheet
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={t('shop.rejectReasonTitle')}
      >
        <div className="space-y-4">
          <Input
            label={t('ui.shop.reason')}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            required
          />
          <Button
            variant="destructive"
            className="w-full"
            loading={busy}
            onClick={() => transitionTo('rejected', rejectReason)}
          >
            {t('ui.shop.confirmReject')}
          </Button>
        </div>
      </BottomSheet>

      {/* Record Cash Payment Sheet */}
      <BottomSheet
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        title={t('shop.recordPayment')}
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <Input
            label={`${t('payments.amount')} (${currency.symbol})`}
            value={paymentAmountDecimal}
            onChange={(e) => setPaymentAmountDecimal(e.target.value)}
            required
          />
          <Input
            label={t('payments.paymentNote')}
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
          />
          <Button type="submit" className="w-full" loading={busy}>
            {t('app.confirm')}
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}

export function ShopProductsPage() {
  const { t } = useTranslation();
  const { shop, db, user } = useMyShop();
  const { currency } = useMarket(shop?.market_code);
  const isOnline = useUiStore((s) => s.isOnline);

  const allProducts =
    useLiveQuery(async () => {
      if (!user) return [];
      return await db.products.toArray();
    }, [user?.id]) || [];

  const products = allProducts
    .filter((p) => shop && p.shop_id === shop.id && !p.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const [search, setSearch] = useState('');
  const [filterAvail, setFilterAvail] = useState<'all' | 'available' | 'out'>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceDecimal, setPriceDecimal] = useState('');
  const [unit, setUnit] = useState('piece');
  const [category, setCategory] = useState('Pantry');
  const [imageUrl, setImageUrl] = useState<string | null>('/seed-images/teff-injera.svg');
  const [isAvailable, setIsAvailable] = useState(true);
  const [saving, setSaving] = useState(false);

  const openAddSheet = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setPriceDecimal('');
    setUnit('piece');
    setCategory('Pantry');
    setImageUrl('/seed-images/teff-injera.svg');
    setIsAvailable(true);
    setEditorOpen(true);
  };

  const openEditSheet = (p: ProductRow) => {
    setEditingProduct(p);
    setName(p.name);
    setDescription(p.description || '');
    setPriceDecimal(fromMinorToDecimal(p.price_minor, currency.digits));
    setUnit(p.unit);
    setCategory(p.category);
    setImageUrl(p.image_url);
    setIsAvailable(p.is_available);
    setEditorOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    try {
      const priceMinor = toMinor(priceDecimal, currency.digits);
      const id = editingProduct?.id || crypto.randomUUID();
      const rowData = {
        id,
        shop_id: shop.id,
        name: name.trim(),
        description: description.trim() || null,
        price_minor: priceMinor,
        unit,
        category: category.trim() || 'General',
        image_url: imageUrl || '/seed-images/teff-injera.svg',
        is_available: isAvailable,
        sort_order: editingProduct?.sort_order ?? products.length + 1,
      };

      if (!isOnline || !navigator.onLine) {
        await enqueueOutboxMutation(db, 'upsert_product', rowData, id);
        await refreshOutboxBadges(db);
      } else {
        const saved = await apiUpsertRow('products', rowData);
        await db.products.put({ ...rowData, ...saved, _pending: false });
        await pullTableDelta(db, 'products', true);
      }
      setEditorOpen(false);
      toast.success(t('app.save'));
    } catch (err: any) {
      toast.error(err?.message || 'Invalid product details');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailable = async (p: ProductRow, nextVal: boolean) => {
    await db.products.update(p.id, { is_available: nextVal });
    try {
      await apiUpdateRow('products', { id: p.id, is_available: nextVal });
      await pullTableDelta(db, 'products');
    } catch {
      // queued or offline
    }
  };

  const handleSoftDelete = async (p: ProductRow) => {
    const deletedAt = new Date().toISOString();
    await db.products.delete(p.id);
    await apiUpdateRow('products', { id: p.id, deleted_at: deletedAt });

    toast(t('shop.productDeletedToast'), {
      duration: 5000,
      action: {
        label: t('app.undo'),
        onClick: async () => {
          await apiUpdateRow('products', { id: p.id, deleted_at: null });
          await pullTableDelta(db, 'products', true);
        },
      },
    });
  };

  const visible = products.filter((p) => {
    if (filterAvail === 'available' && !p.is_available) return false;
    if (filterAvail === 'out' && p.is_available) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">
          {t('nav.products')} ({products.length})
        </h1>
        <Button
          variant="primary"
          data-testid="shop-add-product-btn"
          onClick={openAddSheet}
        >
          <Plus className="w-4 h-4" />
          <span>{t('shop.addProduct')}</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-subtle absolute left-3 top-3" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('app.search')}
            className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-input bg-surface border border-border text-sm"
          />
        </div>
        <div className="inline-flex rounded-input bg-surface-muted p-1 border border-border text-xs font-semibold">
          {(['all', 'available', 'out'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterAvail(f)}
              className={`px-3 py-1 rounded-input capitalize ${
                filterAvail === f ? 'bg-primary text-primary-foreground' : 'text-muted'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <Card className="divide-y divide-border p-0 overflow-hidden">
        {visible.map((p) => (
          <div
            key={p.id}
            data-testid={`shop-product-row-${p.name}`}
            className="p-4 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-input bg-surface-muted overflow-hidden shrink-0">
                {p.image_url && (
                  <img src={resolveAssetUrl(p.image_url)} alt={p.name} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm text-foreground truncate">{p.name}</div>
                <div className="text-xs text-muted">
                  <Money amountMinor={p.price_minor} currency={currency} /> / {p.unit} ·{' '}
                  {p.category}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={p.is_available}
                onCheckedChange={(val) => handleToggleAvailable(p, val)}
                aria-label={`Toggle ${p.name} availability`}
              />
              <button
                type="button"
                aria-label={`Edit ${p.name}`}
                onClick={() => openEditSheet(p)}
                className="p-2 text-muted hover:text-foreground"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${p.name}`}
                onClick={() => handleSoftDelete(p)}
                className="p-2 text-muted hover:text-danger"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </Card>

      <BottomSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingProduct ? t('shop.editProduct') : t('shop.addProduct')}
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <ImagePicker label={t('ui.common.photo')} value={imageUrl} onChange={setImageUrl} />
          <Input
            label={t('shop.productName')}
            data-testid="product-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={`${t('shop.productPrice')} (${currency.symbol})`}
              data-testid="product-price-input"
              value={priceDecimal}
              onChange={(e) => setPriceDecimal(e.target.value)}
              placeholder="140.00"
              required
            />
            <Select
              label={t('shop.productUnit')}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              options={[
                { value: 'piece', label: t('shop.unitPiece') },
                { value: 'kg', label: t('shop.unitKg') },
                { value: 'litre', label: t('shop.unitLitre') },
                { value: 'pack', label: t('shop.unitPack') },
              ]}
            />
          </div>
          <Input
            label={t('shop.productCategory')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <Switch
            checked={isAvailable}
            onCheckedChange={setIsAvailable}
            label={t('shop.productAvailable')}
          />
          <Button
            type="submit"
            className="w-full"
            loading={saving}
            data-testid="save-product-btn"
          >
            {t('app.save')}
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}

export function ShopCustomersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shop, db, user } = useMyShop();
  const { currency } = useMarket(shop?.market_code);

  const allShopCustomers =
    useLiveQuery(async () => {
      if (!user) return [];
      return await db.shop_customers.toArray();
    }, [user?.id]) || [];

  const shopCustomers = allShopCustomers.filter((sc) => shop && sc.shop_id === shop.id);

  const profilesMap =
    useLiveQuery(async () => {
      const all = await db.profiles.toArray();
      return new Map(all.map((p) => [p.id, p]));
    }, [user?.id]) || new Map();

  const allLedgerEntries =
    useLiveQuery(async () => {
      if (!user) return [];
      return await db.ledger_entries.toArray();
    }, [user?.id]) || [];

  const ledgerEntries = allLedgerEntries.filter((le) => shop && le.shop_id === shop.id);

  const balancesMap = new Map<string, number>();
  for (const e of ledgerEntries) {
    balancesMap.set(e.customer_id, (balancesMap.get(e.customer_id) || 0) + e.amount_minor);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">{t('nav.customers')}</h1>

      {shopCustomers.length === 0 ? (
        <EmptyState icon={<Users className="w-6 h-6" />} title={t('ui.shop.noCustomers')} />
      ) : (
        <Card className="divide-y divide-border p-0 overflow-hidden">
          {shopCustomers.map((sc) => {
            const prof = profilesMap.get(sc.customer_id);
            const bal = balancesMap.get(sc.customer_id) || 0;
            return (
              <button
                type="button"
                key={sc.id}
                data-testid={`shop-customer-row-${prof?.full_name || sc.customer_id}`}
                onClick={() => navigate(`/s/customers/${sc.customer_id}`)}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-surface-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="block">
                  <span className="block text-base font-bold text-foreground">
                    {prof?.full_name || 'Customer'}
                  </span>
                  <span className="block text-xs text-muted">{prof?.phone}</span>
                </span>
                <span className="block text-right">
                  <span className="block text-xs text-muted">{t('shop.outstandingCredit')}</span>
                  <Money
                    amountMinor={bal}
                    currency={currency}
                    className={`text-base ${bal > 0 ? 'text-warning' : 'text-success'}`}
                  />
                </span>
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}

export function ShopCustomerDetailPage() {
  const { t } = useTranslation();
  const { customerId } = useParams<{ customerId: string }>();
  const { shop, db, user } = useMyShop();
  const { currency } = useMarket(shop?.market_code);

  const customer = useLiveQuery(
    async () => (customerId ? db.profiles.get(customerId) : undefined),
    [customerId]
  );

  const allCustomerEntries =
    useLiveQuery(async () => {
      if (!customerId) return [];
      return await db.ledger_entries.toArray();
    }, [customerId, user?.id]) || [];

  const entries = allCustomerEntries
    .filter((e) => (!shop || e.shop_id === shop.id) && e.customer_id === customerId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const balanceMinor = entries.reduce((sum, e) => sum + e.amount_minor, 0);

  const [payOpen, setPayOpen] = useState(false);
  const [amountDecimal, setAmountDecimal] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleRecordCashPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !customerId) return;
    setSaving(true);
    try {
      const amountMinor = toMinor(amountDecimal, currency.digits);
      await apiCallRpc('record_payment', {
        p_idempotency_key: `ledger_pay_${shop.id}_${customerId}_${Date.now()}`,
        p_shop_id: shop.id,
        p_customer_id: customerId,
        p_order_id: null,
        p_amount_minor: amountMinor,
        p_method: 'cash',
        p_note: note || 'Partial cash settlement',
      });
      await pullTableDelta(db, 'payments');
      await pullTableDelta(db, 'ledger_entries');
      await pullTableDelta(db, 'orders');
      setPayOpen(false);
      setAmountDecimal('');
      setNote('');
      toast.success(t('ui.shop.cashRecorded'));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Link
        to="/s/customers"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t('nav.customers')}</span>
      </Link>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {customer?.full_name || 'Customer'}
          </h1>
          <p className="text-xs text-muted">{customer?.phone}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-muted">{t('shop.outstandingCredit')}</div>
            <span data-testid="customer-detail-balance">
              <Money
                amountMinor={balanceMinor}
                currency={currency}
                className={`text-2xl ${balanceMinor > 0 ? 'text-warning' : 'text-success'}`}
              />
            </span>
          </div>

          {balanceMinor > 0 && (
            <Button
              variant="primary"
              data-testid="record-customer-payment-btn"
              onClick={() => {
                setAmountDecimal('200.00');
                setPayOpen(true);
              }}
            >
              {t('shop.recordPayment')}
            </Button>
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider">
          {t('shop.transactionHistory')}
        </h2>
        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <div key={entry.id} className="py-3 flex items-center justify-between text-sm">
              <div>
                <div className="font-semibold text-foreground">{entry.description}</div>
                <div className="text-xs text-subtle capitalize">
                  {entry.type} • {new Date(entry.created_at).toLocaleString()}
                </div>
              </div>
              <Money
                amountMinor={entry.amount_minor}
                currency={currency}
                className={entry.amount_minor > 0 ? 'text-warning' : 'text-success'}
              />
            </div>
          ))}
        </div>
      </Card>

      <BottomSheet
        open={payOpen}
        onOpenChange={setPayOpen}
        title={t('shop.recordPayment')}
      >
        <form onSubmit={handleRecordCashPayment} className="space-y-4">
          <Input
            label={`${t('payments.amount')} (${currency.symbol})`}
            data-testid="partial-payment-amount-input"
            value={amountDecimal}
            onChange={(e) => setAmountDecimal(e.target.value)}
            required
          />
          <Input
            label={t('payments.paymentNote')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('ui.shop.partialPaymentPlaceholder')}
          />
          <Button
            type="submit"
            className="w-full"
            loading={saving}
            data-testid="submit-partial-payment-btn"
          >
            {t('app.confirm')}
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}

export function ShopSubscriptionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shop, subscription, db } = useMyShop();
  const locale = useUiStore((s) => s.locale);
  const { currency } = useMarket(shop?.market_code);

  useFreshTables(SUBSCRIPTION_TABLES);

  const plan = useLiveQuery(
    async () => (subscription?.plan_id ? db.plans.get(subscription.plan_id) : undefined),
    [subscription?.plan_id, db]
  );

  const subPayments =
    useLiveQuery(async () => {
      if (!shop) return [];
      const all = await db.payments.where('shop_id').equals(shop.id).toArray();
      return all.filter((p) => p.purpose === 'subscription');
    }, [shop?.id]) || [];

  const [renewing, setRenewing] = useState(false);

  if (!shop || !subscription) {
    return <div className="py-12 text-center text-sm text-muted">{t('app.loading')}</div>;
  }

  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(subscription.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
  );

  const handleRenew = async () => {
    setRenewing(true);
    try {
      const res = await apiInitPayment({
        purpose: 'subscription',
        subscription_id: subscription.id,
        shop_id: shop.id,
        method_code: 'chapa',
        idempotency_key: `sub_renew_${subscription.id}_${Date.now()}`,
      });
      await pullTableDelta(db, 'payments');
      const urlObj = new URL(res.checkoutUrl, window.location.origin);
      navigate(urlObj.pathname + urlObj.search);
    } catch (err: any) {
      toast.error(err?.message || 'Renewal failed');
    } finally {
      setRenewing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{t('subscription.title')}</h1>

      <Card className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {translateJsonb(plan?.name_i18n, locale, t('subscription.annualPlan'))}
            </h2>
            <p className="text-xs text-muted">{shop.name}</p>
          </div>
          <StatusPill status={subscription.status} kind="subscription" />
        </div>

        <div className="grid grid-cols-3 gap-3 p-4 rounded-card bg-surface-muted text-center">
          <div>
            <div className="text-xs text-muted">{t('subscription.periodStart')}</div>
            <div className="text-sm font-semibold mt-0.5">
              {new Date(subscription.current_period_start).toLocaleDateString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">{t('subscription.periodEnd')}</div>
            <div data-testid="subscription-expiry-date" className="text-sm font-semibold mt-0.5">
              {new Date(subscription.current_period_end).toLocaleDateString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">{t('ui.shop.remaining')}</div>
            <div className="text-sm font-bold text-primary mt-0.5">
              {t('subscription.daysRemaining', { days: daysLeft })}
            </div>
          </div>
        </div>

        {plan && (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={renewing}
            data-testid="renew-subscription-btn"
            onClick={handleRenew}
          >
            {t('subscription.renewNow', {
              amount: `${currency.symbol} ${(plan.price_minor / Math.pow(10, currency.digits)).toFixed(currency.digits)}`,
            })}
          </Button>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider">
          {t('subscription.paymentHistory')}
        </h2>
        {subPayments.length === 0 ? (
          <p className="text-xs text-muted">{t('ui.shop.noRenewals')}</p>
        ) : (
          <div className="divide-y divide-border">
            {subPayments.map((p) => (
              <div key={p.id} className="py-2.5 flex justify-between text-sm">
                <span>
                  {p.provider_ref} ({p.status})
                </span>
                <Money amountMinor={p.amount_minor} currency={currency} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function ShopMorePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useSessionStore((s) => s.logout);

  const items = [
    { to: '/s/profile', label: t('nav.shopProfile'), icon: Store },
    { to: '/s/subscription', label: t('nav.subscription'), icon: CreditCard },
    { to: '/s/support', label: t('nav.support'), icon: HelpCircle },
    { to: '/s/account', label: t('nav.profile'), icon: User },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/welcome', { replace: true });
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{t('nav.more')}</h1>
      <Card className="divide-y divide-border p-0 overflow-hidden">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.to}
              type="button"
              onClick={() => navigate(item.to)}
              className="w-full p-4 flex items-center gap-3 text-left hover:bg-surface-muted"
            >
              <Icon className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          );
        })}
      </Card>

      <Button
        variant="destructive"
        className="w-full"
        data-testid="logout-button"
        onClick={handleLogout}
      >
        <LogOut className="w-4 h-4" />
        <span>{t('auth.signOut')}</span>
      </Button>
    </div>
  );
}
