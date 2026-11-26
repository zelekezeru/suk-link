import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Home,
  ClipboardList,
  Wallet,
  User,
  ShoppingCart,
  LayoutDashboard,
  Package,
  Users,
  Menu,
  ShieldCheck,
  Store,
  CreditCard,
  Settings,
  HelpCircle,
  LogOut,
  Trash2,
} from 'lucide-react';
import {
  SyncStatusPill,
  OfflineBanner,
  BottomSheet,
} from '../../components/ui/FeedbackAndSheets';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { useCartStore } from '../../stores/cart';
import { useSessionStore } from '../../features/auth/useSession';
import { getUserDb } from '../../lib/sync/db';
import { getFailedOutboxMutations } from '../../lib/sync/outbox';
import { refreshOutboxBadges } from '../../lib/sync/engine';
import { Button } from '../../components/ui/Button';
import { TrialSandboxButton } from '../../components/ui/TrialDemoControls';
import { RouteSuspense } from '../lazyPage';

function NeedsAttentionSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');
  const failedOps =
    useLiveQuery(async () => getFailedOutboxMutations(db), [user?.id, open]) || [];

  const dismissFailed = async (id: string) => {
    await db.outbox.delete(id);
    await refreshOutboxBadges(db);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t('ui.sync.attentionTitle')}>
      <div className="space-y-3">
        {failedOps.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">{t('ui.sync.allSynced')}</p>
        ) : (
          failedOps.map((op) => (
            <div key={op.id} className="p-3 rounded-card border border-danger/30 bg-danger-tint/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-danger uppercase">{op.op}</span>
                <Button variant="ghost" size="sm" onClick={() => dismissFailed(op.id)}>
                  <Trash2 className="w-4 h-4" />
                  <span>{t('ui.common.dismiss')}</span>
                </Button>
              </div>
              <p className="text-xs text-foreground break-words">{op.last_error}</p>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}

export function CustomerLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cartsByShop = useCartStore((s) => s.cartsByShop);
  const totalCartItems = Object.values(cartsByShop).reduce(
    (acc, cart) => acc + cart.items.reduce((s, i) => s + i.quantity, 0),
    0
  );
  const [attentionOpen, setAttentionOpen] = useState(false);

  const firstCartShopId = Object.keys(cartsByShop)[0];

  const navItems = [
    { to: '/c/home', label: t('nav.home'), icon: Home },
    { to: '/c/orders', label: t('nav.orders'), icon: ClipboardList },
    { to: '/c/balances', label: t('nav.balances'), icon: Wallet },
    { to: '/c/profile', label: t('nav.profile'), icon: User },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border bg-surface p-4 justify-between shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-9 h-9 rounded-input bg-primary text-primary-foreground font-bold flex items-center justify-center">
              SL
            </div>
            <span className="font-bold text-lg text-primary">{t('app.name')}</span>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-input text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted hover:bg-surface-muted hover:text-foreground'
                    }`
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
        <div className="pt-4 border-t border-border">
          <NavLink
            to="/c/support"
            className="flex items-center gap-2 text-xs text-muted hover:text-foreground px-2 py-1.5"
          >
            <HelpCircle className="w-4 h-4" />
            <span>{t('nav.support')}</span>
          </NavLink>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        <OfflineBanner />
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-xs border-b border-border px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 rounded-input bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center">
              SL
            </div>
            <span className="font-bold text-base text-primary">{t('app.name')}</span>
          </div>
          <div className="hidden lg:block text-sm font-medium text-muted">
            {t('app.tagline')}
          </div>
          <div className="flex items-center gap-2">
            <TrialSandboxButton />
            <SyncStatusPill onClickNeedsAttention={() => setAttentionOpen(true)} />
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6">
          <RouteSuspense>
            <Outlet />
          </RouteSuspense>
        </main>
      </div>

      {/* Floating Cart Button when cart is not empty (Section 8) */}
      {totalCartItems > 0 && firstCartShopId && (
        <button
          type="button"
          data-testid="floating-cart-button"
          onClick={() => navigate(`/c/cart/${firstCartShopId}`)}
          className="fixed bottom-20 lg:bottom-6 right-4 z-30 min-h-[48px] px-5 py-3 rounded-pill bg-primary text-primary-foreground shadow-soft3 hover:bg-primary-hover flex items-center gap-2.5 font-semibold text-sm transition-transform active:scale-95"
        >
          <ShoppingCart className="w-5 h-5" />
          <span>{t('customer.viewCart', { count: totalCartItems })}</span>
        </button>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border grid grid-cols-4 h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 text-xs font-medium ${
                  isActive ? 'text-primary font-semibold' : 'text-muted'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-[80px]">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <NeedsAttentionSheet open={attentionOpen} onOpenChange={setAttentionOpen} />
    </div>
  );
}

export function ShopLayout() {
  const { t } = useTranslation();
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');
  const [attentionOpen, setAttentionOpen] = useState(false);

  // Live count of pending ("New") orders for the Orders tab badge (Section 4 D & Supporting Feature 1)
  const pendingOrdersCount =
    useLiveQuery(async () => {
      if (!user) return 0;
      const myShops = await db.shops.where('owner_id').equals(user.id).toArray();
      if (myShops.length === 0) return 0;
      const orders = await db.orders.where('shop_id').equals(myShops[0].id).toArray();
      return orders.filter((o) => o.status === 'pending').length;
    }, [user?.id]) || 0;

  const navItems = [
    { to: '/s/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, badge: 0 },
    { to: '/s/orders', label: t('nav.orders'), icon: ClipboardList, badge: pendingOrdersCount },
    { to: '/s/products', label: t('nav.products'), icon: Package, badge: 0 },
    { to: '/s/customers', label: t('nav.customers'), icon: Users, badge: 0 },
    { to: '/s/more', label: t('nav.more'), icon: Menu, badge: 0 },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border bg-surface p-4 justify-between shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-9 h-9 rounded-input bg-primary text-primary-foreground font-bold flex items-center justify-center">
              SL
            </div>
            <div>
              <div className="font-bold text-base text-primary">{t('app.name')}</div>
              <div className="text-[11px] text-muted">{t('ui.layout.shopPortal')}</div>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2.5 rounded-input text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted hover:bg-surface-muted hover:text-foreground'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge > 0 && (
                    <span
                      data-testid="shop-orders-badge"
                      className="px-2 py-0.5 rounded-pill text-xs font-bold bg-accent text-accent-foreground"
                    >
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="space-y-1 pt-4 border-t border-border">
          <NavLink
            to="/s/subscription"
            className="flex items-center gap-2 text-xs text-muted hover:text-foreground px-2 py-1.5"
          >
            <CreditCard className="w-4 h-4" />
            <span>{t('nav.subscription')}</span>
          </NavLink>
          <NavLink
            to="/s/profile"
            className="flex items-center gap-2 text-xs text-muted hover:text-foreground px-2 py-1.5"
          >
            <Store className="w-4 h-4" />
            <span>{t('nav.shopProfile')}</span>
          </NavLink>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        <OfflineBanner />
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-xs border-b border-border px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-input bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center lg:hidden">
              SL
            </div>
            <span className="font-bold text-base text-foreground">{user?.full_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrialSandboxButton />
            <SyncStatusPill onClickNeedsAttention={() => setAttentionOpen(true)} />
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6">
          <RouteSuspense>
            <Outlet />
          </RouteSuspense>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border grid grid-cols-5 h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 text-xs font-medium ${
                  isActive ? 'text-primary font-semibold' : 'text-muted'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-[70px]">{item.label}</span>
              {item.badge > 0 && (
                <span
                  data-testid="shop-orders-badge-mobile"
                  className="absolute top-1.5 right-3 min-w-[18px] h-[18px] px-1 rounded-pill bg-accent text-accent-foreground text-[11px] font-bold flex items-center justify-center"
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <NeedsAttentionSheet open={attentionOpen} onOpenChange={setAttentionOpen} />
    </div>
  );
}

export function AdminLayout() {
  const { t } = useTranslation();
  const logout = useSessionStore((s) => s.logout);
  const navigate = useNavigate();

  const navItems = [
    { to: '/a/overview', label: t('nav.adminOverview'), icon: ShieldCheck },
    { to: '/a/users', label: t('nav.adminUsers'), icon: Users },
    { to: '/a/shops', label: t('nav.adminShops'), icon: Store },
    { to: '/a/subscriptions', label: t('nav.adminSubscriptions'), icon: CreditCard },
    { to: '/a/config', label: t('nav.adminConfig'), icon: Settings },
    { to: '/a/tickets', label: t('nav.adminTickets'), icon: HelpCircle },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/welcome');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:flex-row">
      <aside className="lg:w-64 border-b lg:border-b-0 lg:border-r border-border bg-surface p-4 flex flex-col justify-between shrink-0">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-input bg-primary text-primary-foreground font-bold flex items-center justify-center">
                SL
              </div>
              <div>
                <div className="font-bold text-base text-primary">{t('admin.title')}</div>
                <div className="text-xs text-muted">{t('ui.layout.adminConsole')}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={handleLogout}
              data-testid="logout-button-mobile"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-input text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted hover:bg-surface-muted hover:text-foreground'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block pt-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-danger"
            onClick={handleLogout}
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('auth.signOut')}</span>
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <OfflineBanner />
        <header className="bg-surface border-b border-border px-6 h-14 flex items-center justify-between">
          <h1 className="font-bold text-base text-foreground">{t('admin.title')}</h1>
          <div className="flex items-center gap-2">
            <TrialSandboxButton />
            <SyncStatusPill />
          </div>
        </header>
        <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6">
          <RouteSuspense>
            <Outlet />
          </RouteSuspense>
        </main>
      </div>
    </div>
  );
}
