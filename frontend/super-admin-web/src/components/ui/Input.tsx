import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', icon, ...props }, ref) => {
    const renderIcon = () => {
      if (!icon) return null;
      if (React.isValidElement(icon)) return icon;
      const IconComp = icon as React.ComponentType<{ className?: string }>;
      return <IconComp className="w-4 h-4" />;
    };

    if (icon) {
      return (
        <div className="relative w-full">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none">
            {renderIcon()}
          </div>
          <input
            type={type}
            ref={ref}
            className={cn(
              'w-full bg-white border border-[#e2e8f0] rounded-xl pl-9 pr-3.5 py-2 text-xs text-[#0d1424] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2f68ff] focus:ring-2 focus:ring-[#2f68ff]/10 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs',
              className
            )}
            {...props}
          />
        </div>
      );
    }

    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'w-full bg-white border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-[#0d1424] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2f68ff] focus:ring-2 focus:ring-[#2f68ff]/10 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
