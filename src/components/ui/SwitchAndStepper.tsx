import React from 'react';
import { useTranslation } from 'react-i18next';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Minus, Plus } from 'lucide-react';
import { cn } from './Button';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
  'aria-label': ariaLabel,
}: SwitchProps) {
  const id = React.useId();
  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={ariaLabel || label}
        className={cn(
          'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-pill border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'pointer-events-none block h-5 w-5 rounded-pill bg-white shadow-soft1 ring-0 transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </SwitchPrimitive.Root>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </label>
      )}
    </div>
  );
}

export interface StepperProps {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}

export function Stepper({
  value,
  onIncrement,
  onDecrement,
  min = 0,
  max = 999,
  disabled = false,
  className,
}: StepperProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-pill bg-surface-muted border border-border p-0.5',
        className
      )}
    >
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled || value <= min}
        aria-label={t('ui.common.decrease')}
        className="w-9 h-9 min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-pill text-foreground hover:bg-surface transition-colors disabled:opacity-40"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span
        data-testid="stepper-value"
        className="min-w-[32px] px-2 text-center text-sm font-semibold tabular-nums text-foreground"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled || value >= max}
        aria-label={t('ui.common.increase')}
        className="w-9 h-9 min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-pill bg-primary text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-40"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
