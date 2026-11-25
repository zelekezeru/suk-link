import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, RotateCcw, ExternalLink, Check, Shield, Store, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { IS_STATIC_DEMO } from '../../lib/supabase';
import { useSessionStore } from '../../features/auth/useSession';
import { getHomeRouteForRole } from '../../app/guards';
import { wipeUserDb } from '../../lib/sync/db';
import { useCartStore } from '../../stores/cart';
import { BottomSheet } from './FeedbackAndSheets';
import { Button } from './Button';

export const SEEDED_DEMO_ACCOUNTS = [
  {
    email: 'customer@demo.suklink.et',
    name: 'Selam Tesfaye',
    role: 'customer' as const,
    badge: 'Customer',
    summary: 'Active shopper · 10+ orders · Open support ticket',
    testId: 'sandbox-switch-customer',
  },
  {
    email: 'customer2@demo.suklink.et',
    name: 'Dawit Bekele',
    role: 'customer' as const,
    badge: 'Customer · Credit',
    summary: 'Outstanding credit ledger balance: Br 865.00',
    testId: 'sandbox-switch-customer2',
  },
  {
    email: 'shop@demo.suklink.et',
    name: 'Abebe Kebede',
    role: 'shop_owner' as const,
    badge: 'Shop Owner · Active',
    summary: 'Abebe Mini Market · 12 products · Pending order ready',
    testId: 'sandbox-switch-shop',
  },
  {
    email: 'shop2@demo.suklink.et',
    name: 'Tsehay Tadesse',
    role: 'shop_owner' as const,
    badge: 'Shop Owner · Trial',
    summary: 'Tsehay Bakery · 5-day trial remaining · 4 bakery items',
    testId: 'sandbox-switch-shop2',
  },
  {
    email: 'admin@demo.suklink.et',
    name: 'Kaleb Admin',
    role: 'admin' as const,
    badge: 'Platform Admin',
    summary: 'Manage users, shops, subscriptions, markets & tickets',
    testId: 'sandbox-switch-admin',
  },
] as const;

export function TrialSandboxButton() {
  const [open, setOpen] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const user = useSessionStore((s) => s.user);
  const login = useSessionStore((s) => s.login);
  const navigate = useNavigate();

  if (!IS_STATIC_DEMO) return null;

  const handleSwitch = async (email: string) => {
    setBusyEmail(email);
    try {
      const nextUser = await login(email, 'Demo@2026');
      setOpen(false);
      toast.success(`Switched to ${nextUser.full_name} (${nextUser.role.replace('_', ' ')})`);
      navigate(getHomeRouteForRole(nextUser.role), { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to switch account');
    } finally {
      setBusyEmail(null);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const { resetBrowserDemoDatabase } = await import('../../lib/browser-gateway/engine');
      await resetBrowserDemoDatabase();
      useCartStore.getState().clearAllCarts();
      if (user) {
        await wipeUserDb(user.id);
        const refreshed = await login(user.email || 'customer@demo.suklink.et', 'Demo@2026');
        navigate(getHomeRouteForRole(refreshed.role), { replace: true });
      }
      toast.success('Trial database restored to fresh seeded state');
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const getRoleIcon = (role: 'customer' | 'shop_owner' | 'admin') => {
    if (role === 'admin') return <Shield className="w-4 h-4 text-primary" />;
    if (role === 'shop_owner') return <Store className="w-4 h-4 text-amber-600" />;
    return <ShoppingBag className="w-4 h-4 text-emerald-600" />;
  };

  return (
    <>
      <button
        type="button"
        data-testid="trial-sandbox-trigger"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill bg-accent-tint text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold hover:opacity-90 transition-opacity"
        title="Switch demo role or reset trial database"
      >
        <FlaskConical className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Trial Switcher</span>
      </button>

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Suk Link Live Trial Sandbox"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-card bg-surface-muted text-xs text-muted space-y-1">
            <div className="font-semibold text-foreground">
              Full in-browser PostgreSQL simulation (all data persists locally)
            </div>
            <p>
              Switch between seeded roles below, or open a second browser tab to watch orders,
              products, payments, and admin changes sync live in real time. All demo accounts use
              password <code className="font-mono font-bold text-foreground">Demo@2026</code>.
            </p>
          </div>

          <div className="space-y-2">
            {SEEDED_DEMO_ACCOUNTS.map((acct) => {
              const isCurrent = user?.email === acct.email;
              return (
                <button
                  key={acct.email}
                  type="button"
                  data-testid={acct.testId}
                  disabled={Boolean(busyEmail) || resetting}
                  onClick={() => handleSwitch(acct.email)}
                  className={`w-full text-left p-3 rounded-card border transition-all flex items-start justify-between gap-3 ${
                    isCurrent
                      ? 'border-primary bg-primary-tint/50 ring-1 ring-primary'
                      : 'border-border bg-surface hover:bg-surface-muted'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5 shrink-0">{getRoleIcon(acct.role)}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">{acct.name}</span>
                        <span className="px-2 py-0.5 rounded-pill text-[11px] font-semibold bg-surface-muted border border-border text-foreground">
                          {acct.badge}
                        </span>
                      </div>
                      <div className="text-xs text-muted truncate mt-0.5">{acct.summary}</div>
                      <div className="text-[11px] font-mono text-subtle mt-0.5">{acct.email}</div>
                    </div>
                  </div>
                  {isCurrent && <Check className="w-4 h-4 text-primary shrink-0 mt-1" />}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => window.open(window.location.href.split('#')[0] + '#/login', '_blank')}
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open 2nd Tab</span>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              loading={resetting}
              data-testid="sandbox-reset-db-btn"
              onClick={handleReset}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Seed Data</span>
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
