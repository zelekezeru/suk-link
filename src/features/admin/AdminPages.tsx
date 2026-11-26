import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Users,
  Store,
  CreditCard,
  TrendingUp,
  ShoppingBag,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, KpiCard } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Switch } from '../../components/ui/SwitchAndStepper';
import { Money, StatusPill } from '../../components/ui/StatusPillAndMoney';
import { BottomSheet } from '../../components/ui/FeedbackAndSheets';
import { useSessionStore } from '../auth/useSession';
import { getUserDb } from '../../lib/sync/db';
import { pullTableDelta } from '../../lib/sync/pull';
import { toMinor, fromMinorToDecimal } from '../../lib/money';
import { translateJsonb } from '../../lib/i18n';
import { useMarket } from '../../lib/useMarket';
import { isMarketToday } from '../../lib/dates';
import {
  apiFetchAdminStats,
  apiCallRpc,
  apiUpdateRow,
} from '../../lib/supabase';

export function AdminOverviewPage() {
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');
  const { market } = useMarket();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    void apiFetchAdminStats()
      .then((res) => setStats(res))
      .catch(() => {});
  }, []);

  const profiles = useLiveQuery(async () => db.profiles.toArray(), [user?.id]) || [];
  const shops = useLiveQuery(async () => db.shops.toArray(), [user?.id]) || [];
  const subs = useLiveQuery(async () => db.subscriptions.toArray(), [user?.id]) || [];
  const orders = useLiveQuery(async () => db.orders.toArray(), [user?.id]) || [];

  // Offline fallback only; the server stats evaluate "today" per shop market.
  const isToday = (iso: string) => isMarketToday(iso, market.timezone);
  const ordersTodayCount = stats?.orders_today ?? orders.filter((o) => isToday(o.placed_at)).length;
  const gmvTodayMinor =
    stats?.gmv_today_minor ??
    orders
      .filter((o) => isToday(o.placed_at) && !['rejected', 'cancelled'].includes(o.status))
      .reduce((acc, o) => acc + o.total_minor, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <KpiCard
          label="Users"
          value={stats ? stats.customers_count + stats.shop_owners_count + stats.admins_count : profiles.length}
          icon={<Users className="w-4 h-4" />}
        />
        <KpiCard
          label="Shops"
          value={stats?.shops_count ?? shops.length}
          icon={<Store className="w-4 h-4" />}
        />
        <KpiCard
          label="Active Subs"
          value={stats?.active_subscriptions ?? subs.filter((s) => s.status === 'active').length}
          icon={<CreditCard className="w-4 h-4" />}
        />
        <KpiCard
          label="Trial Subs"
          value={stats?.trial_subscriptions ?? subs.filter((s) => s.status === 'trial').length}
          icon={<CreditCard className="w-4 h-4" />}
        />
        <KpiCard
          label="Orders Today"
          value={ordersTodayCount}
          icon={<ShoppingBag className="w-4 h-4" />}
        />
        <KpiCard
          label="GMV Today"
          value={<Money amountMinor={Number(gmvTodayMinor)} />}
          icon={<TrendingUp className="w-4 h-4" />}
        />
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');
  const [search, setSearch] = useState('');

  const profiles =
    useLiveQuery(async () => {
      const all = await db.profiles.toArray();
      return all.sort((a, b) => a.full_name.localeCompare(b.full_name));
    }, [user?.id]) || [];

  const toggleDisable = async (profileId: string, nextDisabled: boolean) => {
    try {
      await apiUpdateRow('profiles', { id: profileId, is_disabled: nextDisabled });
      await pullTableDelta(db, 'profiles');
      toast.success(nextDisabled ? 'User disabled' : 'User enabled');
    } catch (err: any) {
      toast.error(err?.message || 'Error');
    }
  };

  const filtered = profiles.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Users ({profiles.length})</h2>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email or phone…"
          className="min-h-[40px] px-3 rounded-input bg-surface border border-border text-sm"
        />
      </div>

      <Card className="divide-y divide-border p-0 overflow-hidden">
        {filtered.map((p) => (
          <div
            key={p.id}
            data-testid={`admin-user-row-${p.email}`}
            className="p-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div>
              <div className="font-bold text-sm text-foreground">
                {p.full_name}{' '}
                <span className="ml-1.5 px-2 py-0.5 rounded-pill text-xs font-semibold bg-primary-tint text-primary">
                  {p.role}
                </span>
              </div>
              <div className="text-xs text-muted">
                {p.email} • {p.phone} • Market: {p.market_code}
              </div>
            </div>

            {p.role !== 'admin' && (
              <Button
                variant={p.is_disabled ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => toggleDisable(p.id, !p.is_disabled)}
              >
                {p.is_disabled ? 'Enable' : 'Disable'}
              </Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

export function AdminShopsAndSubscriptionsPage() {
  const { t } = useTranslation();
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');

  const shops = useLiveQuery(async () => db.shops.toArray(), [user?.id]) || [];
  const subsMap =
    useLiveQuery(async () => {
      const all = await db.subscriptions.toArray();
      return new Map(all.map((s) => [s.shop_id, s]));
    }, [user?.id]) || new Map();

  const [modalAction, setModalAction] = useState<{
    shopId: string;
    shopName: string;
    action: 'activate' | 'extend' | 'suspend' | 'unsuspend';
  } | null>(null);
  const [reason, setReason] = useState('Verified annual subscription payment');
  const [busy, setBusy] = useState(false);

  const runSubscriptionAction = async () => {
    if (!modalAction) return;
    setBusy(true);
    try {
      await apiCallRpc('admin_set_subscription', {
        p_shop_id: modalAction.shopId,
        p_action: modalAction.action,
        p_reason: reason,
        p_reference: `ADM-${Date.now()}`,
      });
      await pullTableDelta(db, 'subscriptions', true);
      await pullTableDelta(db, 'shops', true);
      toast.success(`Subscription ${modalAction.action}d for ${modalAction.shopName}`);
      setModalAction(null);
    } catch (err: any) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Shops &amp; Subscriptions ({shops.length})</h2>

      <div className="space-y-3">
        {shops.map((shop) => {
          const sub = subsMap.get(shop.id);
          return (
            <Card
              key={shop.id}
              data-testid={`admin-shop-row-${shop.name}`}
              className="flex flex-wrap items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-foreground">{shop.name}</span>
                  {sub && <StatusPill status={sub.status} kind="subscription" />}
                </div>
                <div className="text-xs text-muted">
                  Market: {shop.market_code} • Phone: {shop.phone} •{' '}
                  {sub && (
                    <span>
                      Expires:{' '}
                      <strong data-testid={`admin-sub-expiry-${shop.name}`}>
                        {new Date(sub.current_period_end).toLocaleDateString()}
                      </strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  data-testid={`admin-activate-${shop.name}`}
                  onClick={() =>
                    setModalAction({ shopId: shop.id, shopName: shop.name, action: 'activate' })
                  }
                >
                  {t('admin.activate')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid={`admin-extend-${shop.name}`}
                  onClick={() =>
                    setModalAction({ shopId: shop.id, shopName: shop.name, action: 'extend' })
                  }
                >
                  {t('admin.extendYear')}
                </Button>
                {sub?.status !== 'suspended' ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    data-testid={`admin-suspend-${shop.name}`}
                    onClick={() =>
                      setModalAction({ shopId: shop.id, shopName: shop.name, action: 'suspend' })
                    }
                  >
                    {t('admin.suspend')}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setModalAction({ shopId: shop.id, shopName: shop.name, action: 'unsuspend' })
                    }
                  >
                    {t('admin.unsuspend')}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <BottomSheet
        open={Boolean(modalAction)}
        onOpenChange={(o) => !o && setModalAction(null)}
        title={modalAction ? `${modalAction.action.toUpperCase()} — ${modalAction.shopName}` : ''}
      >
        <div className="space-y-4">
          <Input
            label={t('admin.actionReason')}
            data-testid="admin-sub-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <Button
            variant="primary"
            className="w-full"
            loading={busy}
            data-testid="admin-confirm-sub-action-btn"
            onClick={runSubscriptionAction}
          >
            {t('app.confirm')}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

/**
 * Admin Configuration Page (Section 4 Supporting Feature 6 & Section 5.1):
 * - Markets (activate/deactivate e.g. KE market with zero code changes)
 * - Plans per market (update price_minor, duration, trial_days, grace_days)
 * - Payment methods per market (enable/disable)
 */
export function AdminConfigPage() {
  const { t } = useTranslation();
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');

  const markets = useLiveQuery(async () => db.markets.toArray(), [user?.id]) || [];
  // Symbol and minor digits come from the plan's market row, never from code.
  const currencyForPlan = (marketCode: string, currencyCode: string) => {
    const m = markets.find((mk) => mk.code === marketCode);
    return {
      currency: currencyCode,
      symbol: m?.currency_symbol ?? currencyCode,
      digits: m?.minor_unit_digits ?? 2,
    };
  };
  const plans = useLiveQuery(async () => db.plans.toArray(), [user?.id]) || [];
  const paymentMethods =
    useLiveQuery(async () => db.payment_methods.toArray(), [user?.id]) || [];

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planPriceInput, setPlanPriceInput] = useState('');

  const handleToggleMarket = async (code: string, nextActive: boolean) => {
    try {
      await apiUpdateRow('markets', { code, is_active: nextActive }, 'code');
      await pullTableDelta(db, 'markets', true);
      toast.success(`Market ${code} ${nextActive ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      toast.error(err?.message || 'Error');
    }
  };

  const handleSavePlanPrice = async (planId: string) => {
    try {
      const priceMinor = toMinor(planPriceInput, 2);
      await apiUpdateRow('plans', { id: planId, price_minor: priceMinor });
      await pullTableDelta(db, 'plans', true);
      setEditingPlanId(null);
      toast.success('Plan price updated for new purchases and renewals');
    } catch (err: any) {
      toast.error(err?.message || 'Invalid price');
    }
  };

  const handleTogglePaymentMethod = async (id: string, nextEnabled: boolean) => {
    try {
      await apiUpdateRow('payment_methods', { id, is_enabled: nextEnabled });
      await pullTableDelta(db, 'payment_methods', true);
      toast.success('Payment method updated');
    } catch (err: any) {
      toast.error(err?.message || 'Error');
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Markets Configuration */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t('admin.marketsTitle')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {markets.map((m) => (
            <Card
              key={m.code}
              data-testid={`admin-market-card-${m.code}`}
              className="flex items-center justify-between gap-4"
            >
              <div>
                <div className="font-bold text-base">
                  {translateJsonb(m.name_i18n, 'en', m.code)} ({m.code})
                </div>
                <div className="text-xs text-muted">
                  Currency: {m.currency_code} ({m.currency_symbol}) • Phone: {m.phone_country_code} •
                  Locales: {(m.enabled_locales || []).join(', ')}
                </div>
              </div>
              <Switch
                checked={m.is_active}
                onCheckedChange={(val) => handleToggleMarket(m.code, val)}
                aria-label={`Toggle market ${m.code}`}
              />
            </Card>
          ))}
        </div>
      </section>

      {/* 2. Subscription Plans per Market */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t('admin.plansTitle')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((p) => (
            <Card
              key={p.id}
              data-testid={`admin-plan-card-${p.market_code}-${p.code}`}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-base">
                    {translateJsonb(p.name_i18n, 'en', p.code)} ({p.market_code})
                  </div>
                  <div className="text-xs text-muted">
                    Duration: {p.duration_days}d • Trial: {p.trial_days}d • Grace: {p.grace_days}d
                  </div>
                </div>
                <Money
                  amountMinor={p.price_minor}
                  currency={currencyForPlan(p.market_code, p.currency_code)}
                  className="text-lg text-primary"
                />
              </div>

              {editingPlanId === p.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={planPriceInput}
                    data-testid={`admin-plan-price-input-${p.market_code}`}
                    onChange={(e) => setPlanPriceInput(e.target.value)}
                    placeholder="2500.00"
                  />
                  <Button
                    size="sm"
                    data-testid={`admin-save-plan-price-${p.market_code}`}
                    onClick={() => handleSavePlanPrice(p.id)}
                  >
                    {t('app.save')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid={`admin-edit-plan-price-${p.market_code}`}
                  onClick={() => {
                    setEditingPlanId(p.id);
                    setPlanPriceInput(fromMinorToDecimal(p.price_minor, 2));
                  }}
                >
                  Change Plan Price
                </Button>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* 3. Payment Methods per Market */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t('admin.paymentMethodsTitle')}</h2>
        <Card className="divide-y divide-border p-0 overflow-hidden">
          {paymentMethods.map((pm) => (
            <div key={pm.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">
                  [{pm.market_code}] {translateJsonb(pm.name_i18n, 'en', pm.code)} ({pm.code})
                </div>
                <div className="text-xs text-muted">
                  Type: {pm.type} • Routing: {pm.routing}
                </div>
              </div>
              <Switch
                checked={pm.is_enabled}
                onCheckedChange={(val) => handleTogglePaymentMethod(pm.id, val)}
              />
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

export function AdminTicketsPage() {
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');

  const tickets =
    useLiveQuery(async () => {
      const all = await db.support_tickets.toArray();
      return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }, [user?.id]) || [];

  const updateTicketStatus = async (id: string, status: 'open' | 'in_progress' | 'resolved') => {
    await apiUpdateRow('support_tickets', { id, status });
    await pullTableDelta(db, 'support_tickets', true);
    toast.success(`Ticket marked ${status}`);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Support Tickets ({tickets.length})</h2>
      {tickets.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          <ShieldAlert className="w-6 h-6 mx-auto mb-2 text-subtle" />
          No support tickets submitted yet.
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((tk) => (
            <Card key={tk.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-base">{tk.subject}</span>
                <span className="px-2.5 py-0.5 rounded-pill text-xs font-semibold bg-primary-tint text-primary">
                  {tk.status}
                </span>
              </div>
              <p className="text-sm text-muted">{tk.message}</p>
              <div className="flex gap-2 pt-2">
                {(['open', 'in_progress', 'resolved'] as const).map((st) => (
                  <Button
                    key={st}
                    variant={tk.status === st ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => updateTicketStatus(tk.id, st)}
                  >
                    {st}
                  </Button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
