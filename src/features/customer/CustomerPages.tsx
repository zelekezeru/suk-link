import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Search,
  Store,
  MapPin,
  Clock,
  ArrowLeft,
  Trash2,
  ShoppingBag,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, ShopCard, ProductCard, OrderCard } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Stepper } from '../../components/ui/SwitchAndStepper';
import { Money, StatusPill } from '../../components/ui/StatusPillAndMoney';
import {
  EmptyState,
  OrderTimeline,
  BottomSheet,
} from '../../components/ui/FeedbackAndSheets';
import { useSessionStore } from '../auth/useSession';
import { useCartStore } from '../../stores/cart';
import { useUiStore } from '../../stores/ui';
import { useMarket } from '../../lib/useMarket';
import { resolveAssetUrl } from '../../lib/images';
import { getUserDb } from '../../lib/sync/db';
import { enqueueOutboxMutation } from '../../lib/sync/outbox';
import { refreshOutboxBadges, subscribeRealtimeEvents } from '../../lib/sync/engine';
import { pullTableDelta } from '../../lib/sync/pull';
import { apiCallRpc, apiFetchTable } from '../../lib/supabase';
import { triggerHapticImpact } from '../../lib/native';
import { PayOrderSheet } from '../payments/PaymentFlows';
import { computeCartTotals } from '../../lib/money';

function computeShopCartSummary(cart: { items: { unit_price_minor: number; quantity: number }[] } | undefined) {
  if (!cart || cart.items.length === 0) {
    return { itemCount: 0, subtotal_minor: 0, delivery_fee_minor: 0, total_minor: 0 };
  }
  const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  const computed = computeCartTotals(
    cart.items.map((i) => ({ unit_price_minor: i.unit_price_minor, quantity: i.quantity })),
    0
  );
  return {
    itemCount,
    subtotal_minor: computed.subtotal_minor,
    delivery_fee_minor: computed.delivery_fee_minor,
    total_minor: computed.total_minor,
  };
}

export function CustomerHomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');
  const [search, setSearch] = useState('');

  const shops =
    useLiveQuery(async () => {
      const all = await db.shops.toArray();
      return all.filter((s) => !s.deleted_at && (!user?.market_code || s.market_code === user.market_code));
    }, [user?.id, user?.market_code]) || [];

  const products =
    useLiveQuery(async () => {
      const all = await db.products.toArray();
      return all.filter((p) => !p.deleted_at);
    }, [user?.id]) || [];

  const myOrders =
    useLiveQuery(async () => {
      if (!user) return [];
      return await db.orders.where('customer_id').equals(user.id).toArray();
    }, [user?.id]) || [];

  const myLedger =
    useLiveQuery(async () => {
      if (!user) return [];
      return await db.ledger_entries.where('customer_id').equals(user.id).toArray();
    }, [user?.id]) || [];

  const orderedShopIds = new Set(myOrders.map((o) => o.shop_id));

  const q = search.trim().toLowerCase();
  const filteredShops = shops.filter((s) => {
    if (!q) return true;
    const shopMatch =
      s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    const prodMatch = products.some(
      (p) => p.shop_id === s.id && p.name.toLowerCase().includes(q)
    );
    return shopMatch || prodMatch;
  });

  const yourShops = filteredShops.filter((s) => orderedShopIds.has(s.id));

  // Check if customer has any outstanding credit balance across shops (for reminder banner)
  const balanceByShop = new Map<string, number>();
  for (const entry of myLedger) {
    balanceByShop.set(entry.shop_id, (balanceByShop.get(entry.shop_id) || 0) + entry.amount_minor);
  }
  const shopsWithDebt = shops.filter((s) => (balanceByShop.get(s.id) || 0) > 0);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-foreground">
          {t('customer.greeting', { name: user?.full_name?.split(' ')[0] || 'Customer' })}
        </h1>

        {/* Credit reminder banner if customer owes money (Supporting Feature 4) */}
        {shopsWithDebt.map((sh) => {
          const owed = balanceByShop.get(sh.id) || 0;
          return (
            <div
              key={sh.id}
              onClick={() => navigate('/c/balances')}
              role="button"
              tabIndex={0}
              className="p-3.5 rounded-card bg-warning-tint border border-warning/40 flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-2.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
                <Wallet className="w-4 h-4 shrink-0" />
                <span>
                  {t('customer.youOwe', {
                    amount: `Br ${(owed / 100).toFixed(2)}`,
                    shop: sh.name,
                  })}
                </span>
              </div>
              <span className="text-xs font-bold underline">View</span>
            </div>
          );
        })}

        <div className="relative">
          <Search className="w-4 h-4 text-subtle absolute left-3.5 top-3.5" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('customer.searchPlaceholder')}
            data-testid="customer-search-input"
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-input bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {yourShops.length > 0 && !q && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">{t('customer.yourShops')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {yourShops.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                testId={`your-shop-card-${shop.name}`}
                onClick={() => navigate(`/c/shops/${shop.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">{t('customer.nearbyShops')}</h2>
        {filteredShops.length === 0 ? (
          <EmptyState
            icon={<Store className="w-6 h-6" />}
            title="No shops found"
            description="Try searching for another neighborhood shop or product."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredShops.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                onClick={() => navigate(`/c/shops/${shop.id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function CustomerShopPage() {
  const { t } = useTranslation();
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const userId = user?.id;
  const userRole = user?.role;
  const userEmail = user?.email;
  const db = getUserDb(userId || 'guest');

  const [liveShop, setLiveShop] = useState<any | null>(null);
  const [liveProducts, setLiveProducts] = useState<any[]>([]);

  React.useEffect(() => {
    if (!shopId || !userId || !userRole) return;
    let active = true;
    const authUser = {
      id: userId,
      role: userRole,
      email: userEmail || null,
      phone: null,
      full_name: '',
      locale: 'en' as const,
      market_code: 'ET',
    };

    // Load cached from Dexie immediately (for offline support)
    db.shops.get(shopId).then((s) => {
      if (active && s) setLiveShop((prev: any) => prev || s);
    }).catch(() => {});
    db.products.toArray().then((list) => {
      if (active && list.length > 0) setLiveProducts((prev) => (prev.length > 0 ? prev : list));
    }).catch(() => {});

    const syncShopAndProducts = async () => {
      if (navigator.onLine) {
        try {
          const [shopsData, prodsData] = await Promise.all([
            apiFetchTable<any>('shops', undefined, authUser),
            apiFetchTable<any>('products', undefined, authUser),
          ]);
          if (!active) return;
          const foundShop = shopsData.find((s: any) => s.id === shopId);
          if (foundShop) setLiveShop(foundShop);
          setLiveProducts(prodsData);
          if (db.isOpen()) {
            await db.shops.bulkPut(shopsData.filter((s: any) => !s.deleted_at));
            await db.products.bulkPut(prodsData.filter((p: any) => !p.deleted_at));
          }
        } catch {
          // ignore offline
        }
      }
    };
    void syncShopAndProducts();
    const unsub = subscribeRealtimeEvents((evt) => {
      if (evt.table === 'products' || evt.table === 'shops') {
        void syncShopAndProducts();
      }
    });
    const timer = window.setInterval(syncShopAndProducts, 1000);
    return () => {
      active = false;
      unsub();
      window.clearInterval(timer);
    };
  }, [shopId, userId, userRole, userEmail, db]);

  const shop = liveShop;
  const products = liveProducts
    .filter((p) => p.shop_id === shopId && !p.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const { currency } = useMarket(shop?.market_code);
  const cartsByShop = useCartStore((s) => s.cartsByShop);
  const cart = shopId ? cartsByShop[shopId] : undefined;
  const addItem = useCartStore((s) => s.addItem);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const totals = computeShopCartSummary(cart);

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  if (!shop) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted">{t('app.loading')}</p>
      </div>
    );
  }

  const categories = ['ALL', ...Array.from(new Set(products.map((p) => p.category)))];
  const visibleProducts =
    selectedCategory === 'ALL'
      ? products
      : products.filter((p) => p.category === selectedCategory);

  const qtyMap = new Map<string, number>();
  for (const item of cart?.items || []) {
    qtyMap.set(item.product_id, item.quantity);
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <Link
          to="/c/home"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('app.back')}</span>
        </Link>

        {/* Shop Header Card */}
        <Card className="p-0 overflow-hidden">
          <div className="h-32 md:h-40 w-full bg-primary relative">
            {shop.cover_url && (
              <img src={resolveAssetUrl(shop.cover_url)} alt={shop.name} className="w-full h-full object-cover" />
            )}
          </div>
          <div className="p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">{shop.name}</h1>
                <span
                  className={`px-2.5 py-0.5 rounded-pill text-xs font-semibold ${
                    shop.is_open
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {shop.is_open ? t('customer.open') : t('customer.closed')}
                </span>
              </div>
              {shop.description && <p className="text-xs text-muted">{shop.description}</p>}
              <div className="flex flex-wrap items-center gap-4 text-xs text-subtle pt-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {shop.address_text}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {shop.opening_time} – {shop.closing_time}
                </span>
              </div>
            </div>

            {totals.itemCount > 0 && (
              <Button
                variant="primary"
                data-testid="shop-go-to-cart"
                onClick={() => navigate(`/c/cart/${shop.id}`)}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>
                  {t('customer.viewCart', { count: totals.itemCount })} ·{' '}
                  <Money amountMinor={totals.total_minor} currency={currency} />
                </span>
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Closed shop notice (Section 4 B) */}
      {!shop.is_open && (
        <div
          role="alert"
          className="p-3.5 rounded-card bg-warning-tint border border-warning/40 text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{t('customer.closedBanner')}</span>
        </div>
      )}

      {/* Category Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap border transition-colors ${
              selectedCategory === cat
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface text-muted border-border hover:text-foreground'
            }`}
          >
            {cat === 'ALL' ? 'All Items' : cat}
          </button>
        ))}
      </div>

      {/* Product Grid: 2 columns on mobile, 3-4 on wider screens (Section 4 C) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            currency={currency}
            quantityInCart={qtyMap.get(product.id) || 0}
            disabled={!shop.is_open}
            onAdd={() => {
              void triggerHapticImpact();
              addItem(
                { id: shop.id, name: shop.name, currency_code: currency.currency },
                product,
                1
              );
            }}
            onIncrement={() => {
              void triggerHapticImpact();
              increment(shop.id, product.id);
            }}
            onDecrement={() => decrement(shop.id, product.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function CustomerCartPage() {
  const { t } = useTranslation();
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const isOnline = useUiStore((s) => s.isOnline);
  const locale = useUiStore((s) => s.locale);
  const db = getUserDb(user?.id || 'guest');

  const shop = useLiveQuery(async () => (shopId ? db.shops.get(shopId) : undefined), [shopId]);
  const { currency } = useMarket(shop?.market_code);

  const cartsByShop = useCartStore((s) => s.cartsByShop);
  const cart = shopId ? cartsByShop[shopId] : undefined;
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const removeItem = useCartStore((s) => s.removeItem);
  const setFulfilment = useCartStore((s) => s.setFulfilment);
  const setDeliveryAddress = useCartStore((s) => s.setDeliveryAddress);
  const setNote = useCartStore((s) => s.setNote);
  const updatePricesFromServer = useCartStore((s) => s.updatePricesFromServer);
  const clearShopCart = useCartStore((s) => s.clearShopCart);
  const totals = computeShopCartSummary(cart);

  const [submitting, setSubmitting] = useState(false);
  const [priceDiffDialog, setPriceDiffDialog] = useState<{
    expected_total_minor: number;
    actual_total_minor: number;
    items: { product_id: string; product_name: string; unit_price_minor: number; quantity: number }[];
  } | null>(null);

  if (!shopId || !cart || cart.items.length === 0) {
    return (
      <div className="py-12">
        <EmptyState
          icon={<ShoppingBag className="w-6 h-6" />}
          title={t('customer.emptyCart')}
          actionLabel={t('customer.emptyCartAction')}
          onAction={() => navigate('/c/home')}
        />
      </div>
    );
  }

  const handlePlaceOrder = async (overrideExpectedTotalMinor?: number) => {
    if (!user || !shopId) return;
    if (cart.fulfilment === 'delivery' && !cart.delivery_address.trim()) {
      toast.error('Please enter your delivery address');
      return;
    }

    setSubmitting(true);
    const orderId = crypto.randomUUID();
    const expectedTotal = overrideExpectedTotalMinor ?? totals.total_minor;
    const itemsPayload = cart.items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
    }));

    try {
      if (!isOnline || !navigator.onLine) {
        // Offline order placement: queue in Dexie outbox & apply optimistic row (Section 7.1 & 7.2)
        await enqueueOutboxMutation(
          db,
          'place_order',
          {
            order_id: orderId,
            shop_id: shopId,
            customer_id: user.id,
            items: itemsPayload,
            items_snapshot: cart.items,
            fulfilment: cart.fulfilment,
            delivery_address: cart.delivery_address || null,
            note: cart.note || null,
            client_created_at: new Date().toISOString(),
            expected_total_minor: expectedTotal,
            currency_code: currency.currency,
          },
          orderId
        );
        await refreshOutboxBadges(db);
        clearShopCart(shopId);
        toast.info(t('status.waitingConnection'));
        navigate(`/c/orders/${orderId}`, { replace: true });
        return;
      }

      // Online order placement: authoritative server RPC
      const created = await apiCallRpc('place_order', {
        p_order_id: orderId,
        p_shop_id: shopId,
        p_items: itemsPayload,
        p_fulfilment: cart.fulfilment,
        p_address: cart.delivery_address || null,
        p_note: cart.note || null,
        p_client_created_at: new Date().toISOString(),
        p_expected_total_minor: expectedTotal,
      });

      await pullTableDelta(db, 'orders');
      await pullTableDelta(db, 'order_items');
      await pullTableDelta(db, 'order_events');
      clearShopCart(shopId);
      setPriceDiffDialog(null);
      toast.success(`Order ${created.order_number} placed!`);
      navigate(`/c/orders/${created.id}`, { replace: true });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('PRICE_CHANGED:')) {
        const jsonPart = msg.split('PRICE_CHANGED:')[1];
        try {
          const parsed = JSON.parse(jsonPart);
          updatePricesFromServer(shopId, parsed.items || []);
          setPriceDiffDialog(parsed);
        } catch {
          toast.error('Product prices changed. Please review your cart.');
        }
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <Link
          to={`/c/shops/${shopId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{cart.shop_name}</span>
        </Link>
        <h1 className="text-xl font-bold text-foreground">{t('customer.cartTitle')}</h1>
      </div>

      {/* Line Items */}
      <Card className="divide-y divide-border p-0 overflow-hidden">
        {cart.items.map((item) => (
          <div
            key={item.product_id}
            data-testid={`cart-line-${item.name}`}
            className="p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-foreground truncate">{item.name}</div>
              <div className="text-xs text-muted mt-0.5">
                <Money amountMinor={item.unit_price_minor} currency={currency} locale={locale} /> /{' '}
                {item.unit}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Stepper
                value={item.quantity}
                onIncrement={() => increment(shopId, item.product_id)}
                onDecrement={() => decrement(shopId, item.product_id)}
              />
              <div className="w-24 text-right">
                <Money
                  amountMinor={item.unit_price_minor * item.quantity}
                  currency={currency}
                  locale={locale}
                  className="text-sm text-foreground"
                />
              </div>
              <button
                type="button"
                aria-label="Remove item"
                onClick={() => removeItem(shopId, item.product_id)}
                className="text-subtle hover:text-danger p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </Card>

      {/* Fulfilment & Note */}
      <Card className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-foreground">
            {t('customer.fulfilment')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFulfilment(shopId, 'pickup')}
              className={`min-h-[44px] px-3 py-2 rounded-input border text-sm font-medium transition-colors ${
                cart.fulfilment === 'pickup'
                  ? 'bg-primary-tint border-primary text-primary font-semibold'
                  : 'bg-surface border-border text-muted'
              }`}
            >
              {t('customer.pickup')}
            </button>
            <button
              type="button"
              onClick={() => setFulfilment(shopId, 'delivery')}
              className={`min-h-[44px] px-3 py-2 rounded-input border text-sm font-medium transition-colors ${
                cart.fulfilment === 'delivery'
                  ? 'bg-primary-tint border-primary text-primary font-semibold'
                  : 'bg-surface border-border text-muted'
              }`}
            >
              {t('customer.delivery')}
            </button>
          </div>
        </div>

        {cart.fulfilment === 'delivery' && (
          <Input
            label={t('customer.deliveryAddress')}
            value={cart.delivery_address}
            onChange={(e) => setDeliveryAddress(shopId, e.target.value)}
            placeholder="Bole Medhanialem, House 142"
            required
          />
        )}

        <Textarea
          label={t('customer.orderNote')}
          value={cart.note}
          onChange={(e) => setNote(shopId, e.target.value)}
          placeholder="Any instructions for the shop owner…"
        />
      </Card>

      {/* Totals Breakdown */}
      <Card className="space-y-2.5">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{t('customer.subtotal')}</span>
          <Money amountMinor={totals.subtotal_minor} currency={currency} locale={locale} />
        </div>
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{t('customer.deliveryFee')}</span>
          <Money amountMinor={totals.delivery_fee_minor} currency={currency} locale={locale} />
        </div>
        <div className="flex items-center justify-between text-lg font-bold text-foreground pt-2 border-t border-border">
          <span>{t('customer.total')}</span>
          <span data-testid="cart-total-amount">
            <Money amountMinor={totals.total_minor} currency={currency} locale={locale} />
          </span>
        </div>

        <div className="pt-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={submitting}
            data-testid="place-order-button"
            onClick={() => handlePlaceOrder()}
          >
            {t('customer.placeOrderBtn', {
              amount: `${currency.symbol} ${(totals.total_minor / Math.pow(10, currency.digits)).toLocaleString('en-US', { minimumFractionDigits: currency.digits, maximumFractionDigits: currency.digits })}`,
            })}
          </Button>
        </div>
      </Card>

      {/* Price Change Confirmation Dialog (Section 4 C) */}
      <BottomSheet
        open={Boolean(priceDiffDialog)}
        onOpenChange={(open) => !open && setPriceDiffDialog(null)}
        title={t('customer.pricesUpdatedTitle')}
      >
        {priceDiffDialog && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{t('customer.pricesUpdatedDesc')}</p>
            <div className="p-3 rounded-card bg-surface-muted space-y-2">
              {priceDiffDialog.items.map((line) => (
                <div key={line.product_id} className="flex justify-between text-xs">
                  <span>
                    {line.quantity}× {line.product_name}
                  </span>
                  <Money amountMinor={line.unit_price_minor * line.quantity} currency={currency} />
                </div>
              ))}
              <div className="flex justify-between font-bold text-sm pt-2 border-t border-border">
                <span>New Total</span>
                <Money amountMinor={priceDiffDialog.actual_total_minor} currency={currency} />
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setPriceDiffDialog(null)}
              >
                {t('app.cancel')}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                loading={submitting}
                onClick={() => handlePlaceOrder(priceDiffDialog.actual_total_minor)}
              >
                {t('app.confirm')}
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

export function CustomerOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');
  const { currency } = useMarket();
  const [tab, setTab] = useState<'active' | 'past'>('active');

  const orders =
    useLiveQuery(async () => {
      if (!user) return [];
      const rows = await db.orders.where('customer_id').equals(user.id).toArray();
      return rows.sort((a, b) => b.placed_at.localeCompare(a.placed_at));
    }, [user?.id]) || [];

  const shopsMap =
    useLiveQuery(async () => {
      const all = await db.shops.toArray();
      return new Map(all.map((s) => [s.id, s.name]));
    }, [user?.id]) || new Map<string, string>();

  const activeOrders = orders.filter((o) =>
    ['pending', 'accepted', 'processing'].includes(o.status)
  );
  const pastOrders = orders.filter((o) =>
    ['completed', 'rejected', 'cancelled'].includes(o.status)
  );

  const displayed = tab === 'active' ? activeOrders : pastOrders;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('nav.orders')}</h1>
        <div className="inline-flex rounded-input bg-surface-muted p-1 border border-border">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`px-3.5 py-1.5 rounded-input text-xs font-semibold ${
              tab === 'active' ? 'bg-primary text-primary-foreground' : 'text-muted'
            }`}
          >
            {t('customer.activeOrders')} ({activeOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('past')}
            className={`px-3.5 py-1.5 rounded-input text-xs font-semibold ${
              tab === 'past' ? 'bg-primary text-primary-foreground' : 'text-muted'
            }`}
          >
            {t('customer.pastOrders')} ({pastOrders.length})
          </button>
        </div>
      </div>

      {displayed.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="w-6 h-6" />}
          title={t('customer.noOrdersYet')}
          actionLabel={t('customer.emptyCartAction')}
          onAction={() => navigate('/c/home')}
        />
      ) : (
        <div className="space-y-3">
          {displayed.map((ord) => (
            <OrderCard
              key={ord.id}
              order={ord}
              currency={currency}
              subtitle={shopsMap.get(ord.shop_id) || 'Shop'}
              onClick={() => navigate(`/c/orders/${ord.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomerOrderDetailPage() {
  const { t } = useTranslation();
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const userId = user?.id;
  const userRole = user?.role;
  const userEmail = user?.email;
  const db = getUserDb(userId || 'guest');

  const [liveOrder, setLiveOrder] = useState<any | null>(null);
  const [liveItems, setLiveItems] = useState<any[]>([]);
  const [liveShop, setLiveShop] = useState<any | null>(null);

  React.useEffect(() => {
    if (!orderId || !userId || !userRole) return;
    let active = true;
    const authUser = {
      id: userId,
      role: userRole,
      email: userEmail || null,
      phone: null,
      full_name: '',
      locale: 'en' as const,
      market_code: 'ET',
    };
    const syncOrder = async () => {
      if (navigator.onLine) {
        try {
          const [ordersData, itemsData, shopsData] = await Promise.all([
            apiFetchTable<any>('orders', undefined, authUser),
            apiFetchTable<any>('order_items', undefined, authUser),
            apiFetchTable<any>('shops', undefined, authUser),
          ]);
          if (!active) return;
          const foundOrder = ordersData.find((o: any) => o.id === orderId);
          if (foundOrder) {
            setLiveOrder(foundOrder);
            const foundShop = shopsData.find((s: any) => s.id === foundOrder.shop_id);
            if (foundShop) setLiveShop(foundShop);
          }
          setLiveItems(itemsData.filter((i: any) => i.order_id === orderId));
          if (db.isOpen()) {
            await db.orders.bulkPut(ordersData);
            await db.order_items.bulkPut(itemsData);
          }
        } catch {
          // ignore offline
        }
      }
    };
    void syncOrder();
    const unsub = subscribeRealtimeEvents((evt) => {
      if (evt.table === 'orders' || evt.table === 'payments') {
        void syncOrder();
      }
    });
    const timer = window.setInterval(syncOrder, 1000);
    return () => {
      active = false;
      unsub();
      window.clearInterval(timer);
    };
  }, [orderId, userId, userRole, userEmail, db]);

  const dexieOrder = useLiveQuery(
    async () => (orderId ? db.orders.get(orderId) : undefined),
    [orderId, user?.id]
  );
  const dexieItems =
    useLiveQuery(async () => {
      return await db.order_items.toArray();
    }, [user?.id]) || [];
  const order = liveOrder || dexieOrder;
  const items = liveItems.length > 0 ? liveItems : dexieItems.filter((i) => i.order_id === orderId);
  const dexieShop = useLiveQuery(
    async () => (order?.shop_id ? db.shops.get(order.shop_id) : undefined),
    [order?.shop_id, user?.id]
  );
  const shop = liveShop || dexieShop;

  const { currency } = useMarket(shop?.market_code);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!order) {
    return (
      <div className="py-12 text-center text-sm text-muted">
        {t('app.loading')}
      </div>
    );
  }

  // Cancel allowed only while pending (Section 4 C)
  const canCancel = order.status === 'pending';

  // Pay button appears only after acceptance and while unpaid / partially_paid (Section 5: Pending orders create no ledger entry and cannot be paid)
  const canPay =
    ['accepted', 'processing', 'completed'].includes(order.status) &&
    ['unpaid', 'partially_paid'].includes(order.payment_status);

  const handleCancelOrder = async () => {
    setCancelling(true);
    try {
      await apiCallRpc('update_order_status', {
        p_order_id: order.id,
        p_to_status: 'cancelled',
        p_reason: 'Cancelled by customer',
      });
      await pullTableDelta(db, 'orders');
      toast.success('Order cancelled');
    } catch (err: any) {
      toast.error(err?.message || 'Could not cancel order');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <Link
          to="/c/orders"
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

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{order.order_number}</h1>
            <p className="text-xs text-muted">{shop?.name}</p>
          </div>
          <Money amountMinor={order.total_minor} currency={currency} className="text-xl text-primary" />
        </div>

        <OrderTimeline
          currentStatus={order.status}
          rejectionReason={order.rejection_reason}
        />

        <div className="flex flex-wrap gap-3 pt-2">
          {canPay && (
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              data-testid="customer-pay-order-btn"
              onClick={() => setPaySheetOpen(true)}
            >
              {t('customer.payOrder')} · <Money amountMinor={order.total_minor} currency={currency} />
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              size="md"
              loading={cancelling}
              data-testid="customer-cancel-order-btn"
              onClick={handleCancelOrder}
            >
              {t('customer.cancelOrder')}
            </Button>
          )}
        </div>
      </Card>

      {/* Order Items */}
      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Items</h2>
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="py-2.5 flex items-center justify-between text-sm">
              <div>
                <span className="font-semibold">{item.quantity}×</span>{' '}
                <span>{item.product_name_snapshot}</span>
                <span className="text-xs text-muted ml-1">
                  (<Money amountMinor={item.unit_price_minor} currency={currency} /> /{' '}
                  {item.unit_snapshot})
                </span>
              </div>
              <Money amountMinor={item.line_total_minor} currency={currency} />
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-border flex items-center justify-between font-bold text-base">
          <span>{t('customer.total')}</span>
          <span data-testid="order-detail-total">
            <Money amountMinor={order.total_minor} currency={currency} />
          </span>
        </div>
      </Card>

      {shop && (
        <PayOrderSheet
          open={paySheetOpen}
          onOpenChange={setPaySheetOpen}
          order={order}
          shop={shop}
          onPaidOrCredit={(resultType) => {
            setPaySheetOpen(false);
            navigate(`/c/orders/${order.id}/confirm?type=${resultType}`);
          }}
        />
      )}
    </div>
  );
}

export function CustomerBalancesPage() {
  const { t } = useTranslation();
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');
  const { currency } = useMarket();

  const entries =
    useLiveQuery(async () => {
      if (!user) return [];
      const all = await db.ledger_entries.where('customer_id').equals(user.id).toArray();
      return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }, [user?.id]) || [];

  const shops =
    useLiveQuery(async () => {
      const all = await db.shops.toArray();
      return new Map(all.map((s) => [s.id, s]));
    }, [user?.id]) || new Map();

  // Compute balance per shop
  const balancesByShop = new Map<string, number>();
  for (const e of entries) {
    balancesByShop.set(e.shop_id, (balancesByShop.get(e.shop_id) || 0) + e.amount_minor);
  }

  const shopIds = Array.from(balancesByShop.keys());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t('customer.myBalancesTitle')}</h1>

      {shopIds.length === 0 ? (
        <EmptyState
          icon={<Wallet className="w-6 h-6" />}
          title={t('customer.noBalances')}
        />
      ) : (
        <div className="space-y-4">
          {shopIds.map((shopId) => {
            const shop = shops.get(shopId);
            const balance = balancesByShop.get(shopId) || 0;
            const shopEntries = entries.filter((e) => e.shop_id === shopId);

            return (
              <Card key={shopId} className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h2 className="text-base font-bold text-foreground">
                      {shop?.name || 'Neighborhood Shop'}
                    </h2>
                    <p className="text-xs text-muted">{shop?.phone}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted">{t('shop.outstandingCredit')}</div>
                    <Money
                      amountMinor={balance}
                      currency={currency}
                      className={`text-lg ${balance > 0 ? 'text-warning' : 'text-success'}`}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted uppercase">
                    {t('shop.transactionHistory')}
                  </div>
                  {shopEntries.slice(0, 8).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-none"
                    >
                      <div>
                        <span className="font-medium text-foreground">{entry.description}</span>
                        <div className="text-[11px] text-subtle">
                          {new Date(entry.created_at).toLocaleDateString()}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
