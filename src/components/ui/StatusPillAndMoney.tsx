import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { cn } from './Button';
import { formatMoney, type CurrencyConfig, DEFAULT_ETB_CURRENCY } from '../../lib/money';
import type { OrderStatus, PaymentStatus, SubscriptionStatus } from '../../lib/database.types';

/**
 * Section 8 Fixed Status Colors:
 * Order status: pending = amber, accepted = blue, processing = violet, completed = green, rejected/cancelled = slate or red.
 * Payment status: paid = green, partially_paid = amber, on_credit = orange, unpaid = slate.
 */
const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300/60',
  accepted: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-300/60',
  processing:
    'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300 border-violet-300/60',
  completed:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300/60',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border-red-300/60',
  cancelled:
    'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300/60',
};

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300/60',
  partially_paid:
    'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300/60',
  on_credit:
    'bg-orange-100 text-orange-800 dark:bg-orange-950/70 dark:text-orange-300 border-orange-300/60',
  unpaid: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300/60',
};

const SUBSCRIPTION_STATUS_STYLES: Record<SubscriptionStatus, string> = {
  trial: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-300/60',
  active:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300/60',
  grace: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300/60',
  expired: 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border-red-300/60',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border-red-300/60',
};

export interface StatusPillProps {
  status: OrderStatus | PaymentStatus | SubscriptionStatus;
  kind?: 'order' | 'payment' | 'subscription';
  pendingSync?: boolean;
  className?: string;
}

export function StatusPill({
  status,
  kind = 'order',
  pendingSync = false,
  className,
}: StatusPillProps) {
  const { t } = useTranslation();
  const styleMap =
    kind === 'payment'
      ? PAYMENT_STATUS_STYLES[status as PaymentStatus]
      : kind === 'subscription'
        ? SUBSCRIPTION_STATUS_STYLES[status as SubscriptionStatus]
        : ORDER_STATUS_STYLES[status as OrderStatus];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill text-xs font-semibold border',
        styleMap || ORDER_STATUS_STYLES.pending,
        className
      )}
    >
      {pendingSync && <Clock className="w-3 h-3 animate-pulse" aria-label={t('ui.common.pendingSync')} />}
      <span>{pendingSync ? t('status.waitingConnection') : t(`status.${status}`)}</span>
    </span>
  );
}

export interface MoneyProps {
  amountMinor: number;
  currency?: CurrencyConfig;
  locale?: string;
  className?: string;
}

export function Money({
  amountMinor,
  currency = DEFAULT_ETB_CURRENCY,
  locale = 'en',
  className,
}: MoneyProps) {
  return (
    <span className={cn('tabular-nums font-semibold', className)}>
      {formatMoney(amountMinor, currency, locale)}
    </span>
  );
}
