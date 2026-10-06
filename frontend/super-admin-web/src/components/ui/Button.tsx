import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'secondary',
      size = 'md',
      loading = false,
      isLoading = false,
      disabled,
      icon,
      children,
      ...props
    },
    ref
  ) => {
    const isBusy = loading || isLoading;

    const baseStyles =
      'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

    const variantStyles = {
      primary:
        'bg-gradient-to-tr from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white shadow-lg shadow-indigo-500/20 active:scale-[0.98]',
      secondary:
        'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 active:bg-slate-950',
      danger:
        'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 active:bg-rose-500/30',
      success:
        'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 active:bg-emerald-500/30',
      outline:
        'bg-transparent hover:bg-slate-800/60 text-slate-300 border border-slate-700 active:bg-slate-800',
      ghost:
        'bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 active:bg-slate-800',
    };

    const sizeStyles = {
      sm: 'text-xs px-2.5 py-1.5 gap-1.5',
      md: 'text-xs px-3.5 py-2 gap-2',
      lg: 'text-sm px-4 py-2.5 gap-2.5',
      icon: 'p-2 text-slate-400 hover:text-slate-200',
    };

    const renderIcon = () => {
      if (!icon) return null;
      if (React.isValidElement(icon)) return icon;
      const IconComp = icon as React.ComponentType<{ className?: string }>;
      return <IconComp className="w-3.5 h-3.5 shrink-0" />;
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isBusy}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : renderIcon()}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
