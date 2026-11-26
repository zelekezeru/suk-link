import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Plus, Store, MapPin, ChevronRight } from 'lucide-react';
import { cn } from './Button';
import { Stepper } from './SwitchAndStepper';
import { Money, StatusPill } from './StatusPillAndMoney';
import { resolveAssetUrl } from '../../lib/images';
import type { CurrencyConfig } from '../../lib/money';
import type { ProductRow, ShopRow, OrderRow } from '../../lib/database.types';

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-card p-4 shadow-soft1',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  subtitle?: string;
  className?: string;
}

export function KpiCard({ label, value, icon, subtitle, className }: KpiCardProps) {
  return (
    <Card className={cn('flex flex-col justify-between gap-2', className)}>
      <div className="flex items-center justify-between text-muted text-xs font-medium">
        <span>{label}</span>
        {icon && <span className="text-primary">{icon}</span>}
      </div>
      <div className="text-xl font-bold tabular-nums text-foreground">{value}</div>
      {subtitle && <div className="text-xs text-subtle">{subtitle}</div>}
    </Card>
  );
}

export interface ProductCardProps {
  product: ProductRow;
  quantityInCart: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  currency?: CurrencyConfig;
  disabled?: boolean;
}

export function ProductCard({
  product,
  quantityInCart,
  onAdd,
  onIncrement,
  onDecrement,
  currency,
  disabled = false,
}: ProductCardProps) {
  const { t } = useTranslation();
  const unavailable = !product.is_available;

  return (
    <Card
      data-testid={`product-card-${product.name}`}
      className={cn(
        'p-3 flex flex-col justify-between gap-3 transition-shadow hover:shadow-soft2',
        unavailable && 'opacity-65'
      )}
    >
      <div className="space-y-2">
        <div className="relative aspect-[4/3] w-full rounded-input overflow-hidden bg-surface-muted">
          {product.image_url ? (
            <img
              src={resolveAssetUrl(product.image_url)}
              alt={product.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-primary font-bold text-lg">
              {product.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          {product._pending && (
            <span
              title={t('ui.common.pendingSync')}
              className="absolute top-2 right-2 bg-surface/90 p-1 rounded-pill text-warning shadow-soft1"
            >
              <Clock className="w-3.5 h-3.5" />
            </span>
          )}
          {unavailable && (
            <div className="absolute inset-0 bg-slate-900/55 flex items-center justify-center p-2">
              <span className="px-2.5 py-1 rounded-pill bg-surface text-xs font-semibold text-danger">
                {t('customer.outOfStock')}
              </span>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground line-clamp-2">{product.name}</h3>
          <p className="text-xs text-muted mt-0.5">/{product.unit}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Money amountMinor={product.price_minor} currency={currency} className="text-base text-primary" />

        {!unavailable && (
          quantityInCart > 0 ? (
            <Stepper
              value={quantityInCart}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              disabled={disabled}
            />
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={disabled}
              aria-label={`${t('customer.addToCart')} ${product.name}`}
              className="min-w-[44px] min-h-[44px] px-3 rounded-pill bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center justify-center gap-1 text-sm font-semibold shadow-soft1 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{t('customer.addToCart')}</span>
            </button>
          )
        )}
      </div>
    </Card>
  );
}

export interface ShopCardProps {
  shop: ShopRow;
  onClick: () => void;
  testId?: string;
}

export function ShopCard({ shop, onClick, testId }: ShopCardProps) {
  const { t } = useTranslation();
  return (
    <Card
      onClick={onClick}
      role="button"
      tabIndex={0}
      data-testid={testId || `shop-card-${shop.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      className="p-0 overflow-hidden cursor-pointer hover:shadow-soft2 transition-all group"
    >
      <div className="h-28 w-full bg-primary/15 relative overflow-hidden">
        {shop.cover_url ? (
          <img src={resolveAssetUrl(shop.cover_url)} alt={shop.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-primary to-emerald-700" />
        )}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {shop.accepts_credit && (
            <span className="px-2.5 py-0.5 rounded-pill text-xs font-semibold bg-accent text-accent-foreground shadow-soft1">
              {t('customer.acceptsCreditBadge')}
            </span>
          )}
          <span
            className={cn(
              'px-2.5 py-0.5 rounded-pill text-xs font-semibold shadow-soft1',
              shop.is_open ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200'
            )}
          >
            {shop.is_open ? t('customer.open') : t('customer.closed')}
          </span>
        </div>
      </div>
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-card bg-primary-tint text-primary flex items-center justify-center font-bold shrink-0 overflow-hidden border border-border">
            {shop.logo_url ? (
              <img src={resolveAssetUrl(shop.logo_url)} alt={shop.name} className="w-full h-full object-cover" />
            ) : (
              <Store className="w-6 h-6" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors">
              {shop.name}
            </h3>
            <p className="text-xs text-muted flex items-center gap-1 truncate mt-0.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{shop.address_text}</span>
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-subtle shrink-0" />
      </div>
    </Card>
  );
}

export interface OrderCardProps {
  order: OrderRow;
  subtitle?: string;
  currency?: CurrencyConfig;
  onClick: () => void;
  actions?: React.ReactNode;
}

export function OrderCard({ order, subtitle, currency, onClick, actions }: OrderCardProps) {
  return (
    <Card className="space-y-3 hover:shadow-soft2 transition-shadow">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClick();
        }}
        className="flex items-start justify-between gap-3 cursor-pointer"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-base text-foreground">{order.order_number}</span>
            <StatusPill status={order.status} kind="order" pendingSync={order._pending} />
            <StatusPill status={order.payment_status} kind="payment" />
          </div>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          <p className="text-xs text-subtle">
            {new Date(order.placed_at).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <Money amountMinor={order.total_minor} currency={currency} className="text-base text-foreground" />
          <div className="text-xs text-muted capitalize">{order.fulfilment}</div>
        </div>
      </div>
      {actions && <div className="pt-2 border-t border-border flex items-center gap-2">{actions}</div>}
    </Card>
  );
}
