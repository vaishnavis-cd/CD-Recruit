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
      'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#2f68ff]/20 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none';

    const variantStyles = {
      primary:
        'bg-[#2f68ff] hover:bg-[#1e50ff] text-white shadow-xs active:scale-[0.99]',
      secondary:
        'bg-white hover:bg-[#f8fafc] text-[#0d1424] border border-[#e2e8f0] shadow-2xs active:bg-[#f1f5f9]',
      danger:
        'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:bg-rose-200',
      success:
        'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 active:bg-emerald-200',
      outline:
        'bg-white hover:bg-[#f8fafc] text-[#0d1424] border border-[#e2e8f0] active:bg-[#f1f5f9]',
      ghost:
        'bg-transparent hover:bg-[#f1f5f9] text-[#64748b] hover:text-[#0d1424] active:bg-[#e2e8f0]',
    };

    const sizeStyles = {
      sm: 'text-xs px-2.5 py-1.5 gap-1.5',
      md: 'text-xs px-3.5 py-2 gap-2',
      lg: 'text-sm px-4 py-2.5 gap-2.5',
      icon: 'p-2 text-[#64748b] hover:text-[#0d1424] hover:bg-[#f1f5f9] rounded-lg',
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
