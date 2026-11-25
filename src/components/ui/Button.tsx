import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-soft1',
      secondary:
        'bg-surface-raised text-foreground border border-border hover:bg-surface-muted shadow-soft1',
      ghost: 'bg-transparent text-foreground hover:bg-surface-muted',
      destructive: 'bg-danger text-white hover:opacity-90 shadow-soft1',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'min-h-[38px] px-3 py-1.5 text-sm',
      md: 'min-h-[44px] px-4 py-2.5 text-base',
      lg: 'min-h-[52px] px-6 py-3 text-base font-semibold',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-input font-medium transition-all duration-150 ease-calm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-55 disabled:pointer-events-none select-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />}
        <span className="break-words">{children}</span>
      </button>
    );
  }
);
Button.displayName = 'Button';
