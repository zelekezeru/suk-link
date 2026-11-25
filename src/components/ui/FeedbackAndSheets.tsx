import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Circle,
  XCircle,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  Check,
  X,
  Camera,
} from 'lucide-react';
import { Button, cn } from './Button';
import { resolveAssetUrl } from '../../lib/images';
import { useUiStore } from '../../stores/ui';
import type { OrderStatus } from '../../lib/database.types';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-card bg-slate-200 dark:bg-slate-800',
        className
      )}
    />
  );
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="p-8 text-center rounded-card border border-dashed border-border bg-surface/50 space-y-3">
      {icon && (
        <div className="mx-auto w-12 h-12 rounded-pill bg-primary-tint text-primary flex items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="text-sm text-muted max-w-sm mx-auto">{description}</p>}
      {actionLabel && onAction && (
        <div className="pt-2">
          <Button variant="primary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export function SyncStatusPill({ onClickNeedsAttention }: { onClickNeedsAttention?: () => void }) {
  const { t } = useTranslation();
  const { isOnline, isSyncing, pendingOutboxCount, failedOutboxCount } = useUiStore();

  if (failedOutboxCount > 0) {
    return (
      <button
        type="button"
        onClick={onClickNeedsAttention}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-semibold bg-danger-tint text-danger border border-danger/30"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>{t('app.needsAttention', { count: failedOutboxCount })}</span>
      </button>
    );
  }

  if (isSyncing) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-medium bg-info-tint text-info">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>{t('app.syncing')}</span>
      </span>
    );
  }

  if (!isOnline || pendingOutboxCount > 0) {
    return (
      <span
        data-testid="sync-status-pill"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-semibold bg-warning-tint text-warning"
      >
        <WifiOff className="w-3.5 h-3.5" />
        <span>{t('app.offlineWaiting', { count: pendingOutboxCount })}</span>
      </span>
    );
  }

  return (
    <span
      data-testid="sync-status-pill"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-medium bg-primary-tint text-primary"
    >
      <Check className="w-3.5 h-3.5" />
      <span>{t('app.onlineSynced')}</span>
    </span>
  );
}

export function OfflineBanner() {
  const { t } = useTranslation();
  const isOnline = useUiStore((s) => s.isOnline);
  const pendingOutboxCount = useUiStore((s) => s.pendingOutboxCount);

  if (isOnline) return null;
  return (
    <div
      role="status"
      className="bg-warning text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        {t('app.youAreOffline')} — {t('app.offlineWaiting', { count: pendingOutboxCount })}
      </span>
    </div>
  );
}

export interface TimelineProps {
  currentStatus: OrderStatus;
  rejectionReason?: string | null;
}

const TIMELINE_STEPS: OrderStatus[] = ['pending', 'accepted', 'processing', 'completed'];

export function OrderTimeline({ currentStatus, rejectionReason }: TimelineProps) {
  const { t } = useTranslation();

  if (currentStatus === 'rejected' || currentStatus === 'cancelled') {
    return (
      <div className="p-4 rounded-card bg-danger-tint border border-danger/30 flex items-start gap-3">
        <XCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-sm text-danger">
            {t(`status.${currentStatus}`)}
          </div>
          {rejectionReason && (
            <p className="text-xs text-foreground mt-1">{rejectionReason}</p>
          )}
        </div>
      </div>
    );
  }

  const currentIdx = TIMELINE_STEPS.indexOf(currentStatus);

  return (
    <div data-testid="order-timeline" className="grid grid-cols-4 gap-2 pt-2">
      {TIMELINE_STEPS.map((step, idx) => {
        const done = idx <= currentIdx;
        return (
          <div key={step} className="flex flex-col items-center text-center gap-1.5">
            <div
              className={cn(
                'w-7 h-7 rounded-pill flex items-center justify-center text-xs font-bold transition-colors',
                done
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-muted text-subtle border border-border'
              )}
            >
              {done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                done ? 'text-foreground font-semibold' : 'text-subtle'
              )}
            >
              {t(`status.${step}`)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onOpenChange, title, children }: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 md:top-1/2 md:left-1/2 md:bottom-auto md:right-auto md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:w-full z-50 bg-surface border border-border rounded-t-sheet md:rounded-sheet p-5 shadow-soft3 max-h-[90vh] overflow-y-auto focus:outline-none">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
            <Dialog.Title className="text-lg font-bold text-foreground">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="w-9 h-9 rounded-pill inline-flex items-center justify-center text-muted hover:bg-surface-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface ImagePickerProps {
  value?: string | null;
  onChange: (dataUrlOrUrl: string) => void;
  label?: string;
}

export function ImagePicker({ value, onChange, label }: ImagePickerProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-foreground">{label}</label>}
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-card bg-surface-muted border border-border overflow-hidden flex items-center justify-center shrink-0">
          {value ? (
            <img src={resolveAssetUrl(value)} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <Camera className="w-6 h-6 text-subtle" />
          )}
        </div>
        <div className="flex-1 space-y-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="w-4 h-4" />
            <span>Upload Photo</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
