import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CreditCard,
  Smartphone,
  Building2,
  Banknote,
  BookOpen,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { BottomSheet } from '../../components/ui/FeedbackAndSheets';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Cards';
import { Money } from '../../components/ui/StatusPillAndMoney';
import { useSessionStore } from '../auth/useSession';
import { useUiStore } from '../../stores/ui';
import { useMarket } from '../../lib/useMarket';
import { translateJsonb } from '../../lib/i18n';
import { getUserDb } from '../../lib/sync/db';
import { pullTableDelta } from '../../lib/sync/pull';
import { apiInitPayment, apiConfirmDemoPayment, apiCallRpc } from '../../lib/supabase';
import type { OrderRow, ShopRow } from '../../lib/database.types';

export function PayOrderSheet({
  open,
  onOpenChange,
  order,
  shop,
  onPaidOrCredit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  order: OrderRow;
  shop: ShopRow;
  onPaidOrCredit: (resultType: 'paid' | 'on_credit' | 'cash') => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const locale = useUiStore((s) => s.locale);
  const isOnline = useUiStore((s) => s.isOnline);
  const db = getUserDb(user?.id || 'guest');
  const { currency } = useMarket(shop.market_code);

  const marketMethods =
    useLiveQuery(async () => {
      const all = await db.payment_methods
        .where('market_code')
        .equals(shop.market_code || 'ET')
        .toArray();
      return all.filter((m) => m.is_enabled).sort((a, b) => a.sort_order - b.sort_order);
    }, [shop.market_code]) || [];

  const shopMethods =
    useLiveQuery(async () => {
      return await db.shop_payment_methods.where('shop_id').equals(shop.id).toArray();
    }, [shop.id]) || [];

  const shopEnabledSet = new Set(
    shopMethods.length > 0
      ? shopMethods.filter((sm) => sm.is_enabled).map((sm) => sm.method_code)
      : ['chapa', 'telebirr', 'cbe_birr', 'cash', 'credit']
  );

  // Filter payment methods enabled for BOTH market and shop (Section 4 Payments & Section 13)
  const availableMethods = marketMethods.filter((pm) => {
    if (!shopEnabledSet.has(pm.code)) return false;
    if (pm.code === 'credit' && !shop.accepts_credit) return false;
    return true;
  });

  const [selectedCode, setSelectedCode] = useState<string>('chapa');
  const [loading, setLoading] = useState(false);

  const getMethodIcon = (code: string) => {
    if (code === 'telebirr') return <Smartphone className="w-5 h-5 text-primary" />;
    if (code === 'cbe_birr') return <Building2 className="w-5 h-5 text-primary" />;
    if (code === 'cash') return <Banknote className="w-5 h-5 text-emerald-600" />;
    if (code === 'credit') return <BookOpen className="w-5 h-5 text-amber-600" />;
    return <CreditCard className="w-5 h-5 text-primary" />;
  };

  const handleConfirmPay = async () => {
    setLoading(true);
    try {
      if (selectedCode === 'credit') {
        await apiCallRpc('set_order_on_credit', { p_order_id: order.id });
        await pullTableDelta(db, 'orders');
        await pullTableDelta(db, 'ledger_entries');
        onPaidOrCredit('on_credit');
        return;
      }

      if (selectedCode === 'cash') {
        toast.success('Selected Cash on pickup/delivery');
        onOpenChange(false);
        return;
      }

      // Online payment (Chapa, telebirr, CBE Birr)
      if (!isOnline || !navigator.onLine) {
        toast.error(t('app.offlineActionDisabled'));
        return;
      }

      const res = await apiInitPayment({
        purpose: 'order',
        order_id: order.id,
        shop_id: shop.id,
        method_code: selectedCode,
        idempotency_key: `pay_${order.id}_${selectedCode}`,
      });

      await pullTableDelta(db, 'payments');
      onOpenChange(false);
      // Navigate to hosted checkout URL (/pay/demo/:paymentId in demo mode)
      if (res.checkoutUrl.startsWith('http') && !res.checkoutUrl.includes(window.location.host)) {
        window.location.href = res.checkoutUrl;
      } else {
        const urlObj = new URL(res.checkoutUrl, window.location.origin);
        navigate(urlObj.pathname + urlObj.search);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t('payments.chooseMethod')}>
      <div className="space-y-4">
        <div className="p-3 rounded-card bg-surface-muted flex items-center justify-between">
          <span className="text-sm font-medium text-muted">Order {order.order_number}</span>
          <Money amountMinor={order.total_minor} currency={currency} className="text-lg text-primary" />
        </div>

        <div className="space-y-2" role="radiogroup" aria-label={t('payments.chooseMethod')}>
          {availableMethods.map((pm) => {
            const active = selectedCode === pm.code;
            const onlineOnlyDisabled = pm.type === 'online' && !isOnline;
            return (
              <button
                key={pm.code}
                type="button"
                disabled={onlineOnlyDisabled}
                data-testid={`payment-method-${pm.code}`}
                onClick={() => setSelectedCode(pm.code)}
                className={`w-full min-h-[52px] p-3.5 rounded-card border flex items-center justify-between transition-all ${
                  active
                    ? 'border-primary bg-primary-tint/60 ring-1 ring-primary'
                    : 'border-border bg-surface hover:bg-surface-muted'
                } ${onlineOnlyDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {getMethodIcon(pm.code)}
                  <div className="text-left">
                    <div className="text-sm font-bold text-foreground">
                      {translateJsonb(pm.name_i18n, locale, pm.code)}
                    </div>
                    {onlineOnlyDisabled && (
                      <div className="text-[11px] text-danger">{t('app.youAreOffline')}</div>
                    )}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-pill border flex items-center justify-center ${
                    active ? 'border-primary bg-primary text-white' : 'border-border'
                  }`}
                >
                  {active && <div className="w-2 h-2 rounded-pill bg-white" />}
                </div>
              </button>
            );
          })}
        </div>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={loading}
          data-testid="confirm-pay-method-btn"
          onClick={handleConfirmPay}
        >
          {t('payments.payNow', {
            amount: `${currency.symbol} ${(order.total_minor / Math.pow(10, currency.digits)).toFixed(currency.digits)}`,
          })}
        </Button>
      </div>
    </BottomSheet>
  );
}

/**
 * Hosted DemoProvider Checkout Page (/pay/demo/:paymentId) (Section 4 Payments)
 */
export function DemoPayPage() {
  const { t } = useTranslation();
  const { paymentId } = useParams<{ paymentId: string }>();
  const [searchParams] = useSearchParams();
  const method = searchParams.get('method') || 'chapa';
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');

  const payment = useLiveQuery(
    async () => (paymentId ? db.payments.get(paymentId) : undefined),
    [paymentId]
  );

  const [processing, setProcessing] = useState(false);

  const handleDecision = async (decision: 'approve' | 'decline') => {
    if (!paymentId) return;
    setProcessing(true);
    try {
      const updated = await apiConfirmDemoPayment(paymentId, decision);
      await pullTableDelta(db, 'payments');
      await pullTableDelta(db, 'orders');
      await pullTableDelta(db, 'ledger_entries');
      await pullTableDelta(db, 'subscriptions');

      if (decision === 'approve') {
        if (updated.purpose === 'subscription') {
          toast.success('Subscription renewed!');
          navigate('/s/subscription', { replace: true });
        } else {
          navigate(
            `/c/orders/${updated.order_id}/confirm?type=paid&paymentId=${updated.id}`,
            { replace: true }
          );
        }
      } else {
        toast.error('Payment declined');
        if (updated.purpose === 'subscription') {
          navigate('/s/subscription', { replace: true });
        } else {
          navigate(`/c/orders/${updated.order_id}`, { replace: true });
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Payment verification failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-6 space-y-6 shadow-soft3 border-primary/30">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-11 h-11 rounded-card bg-primary text-primary-foreground flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t('payments.demoCheckoutTitle')}</h1>
            <p className="text-xs text-muted uppercase">
              Selected Gateway: <span className="font-bold text-primary">{method}</span>
            </p>
          </div>
        </div>

        {payment ? (
          <div className="p-4 rounded-card bg-surface-muted space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">{t('payments.amount')}</span>
              <Money amountMinor={payment.amount_minor} className="text-lg text-primary" />
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('payments.reference')}</span>
              <span className="font-mono text-xs">{payment.provider_ref}</span>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-card bg-surface-muted text-center text-sm text-muted">
            Payment ID: {paymentId}
          </div>
        )}

        <div className="space-y-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={processing}
            data-testid="demo-pay-approve-btn"
            onClick={() => handleDecision('approve')}
          >
            {t('payments.demoApprove')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            disabled={processing}
            data-testid="demo-pay-decline-btn"
            onClick={() => handleDecision('decline')}
          >
            {t('payments.demoDecline')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * Full-screen Payment Confirmation screen (Section 4 Payments & Section 8)
 */
export function PaymentConfirmPage() {
  const { t } = useTranslation();
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'paid';
  const paymentId = searchParams.get('paymentId');
  const navigate = useNavigate();

  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');

  const order = useLiveQuery(async () => (orderId ? db.orders.get(orderId) : undefined), [orderId]);
  const shop = useLiveQuery(
    async () => (order?.shop_id ? db.shops.get(order.shop_id) : undefined),
    [order?.shop_id]
  );
  const payment = useLiveQuery(
    async () => (paymentId ? db.payments.get(paymentId) : undefined),
    [paymentId]
  );
  const { currency } = useMarket(shop?.market_code);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card
        data-testid="payment-confirmation-card"
        className="max-w-md w-full p-6 text-center space-y-6 shadow-soft2"
      >
        <div className="mx-auto w-16 h-16 rounded-pill bg-success-tint text-success flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div className="space-y-1">
          <h1
            data-testid="payment-confirm-title"
            className="text-2xl font-bold text-foreground"
          >
            {type === 'on_credit'
              ? t('payments.onCreditSuccessTitle')
              : t('payments.paidSuccessTitle')}
          </h1>
          <p className="text-sm text-muted">{shop?.name}</p>
        </div>

        {order && (
          <div className="p-4 rounded-card bg-surface-muted space-y-2.5 text-sm text-left">
            <div className="flex justify-between">
              <span className="text-muted">{t('payments.amount')}</span>
              <Money amountMinor={order.total_minor} currency={currency} className="text-base" />
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Order</span>
              <span className="font-semibold">{order.order_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('payments.reference')}</span>
              <span className="font-mono text-xs">
                {payment?.provider_ref || (type === 'on_credit' ? 'CREDIT-LEDGER' : 'CONFIRMED')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('payments.dateTime')}</span>
              <span className="text-xs">{new Date().toLocaleString()}</span>
            </div>
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          data-testid="back-to-order-btn"
          onClick={() => navigate(`/c/orders/${orderId}`)}
        >
          {t('payments.backToOrder')}
        </Button>
      </Card>
    </div>
  );
}
