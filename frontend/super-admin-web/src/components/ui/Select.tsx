import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, options, ...props }, ref) => {
    return (
      <div className="relative inline-block w-full">
        <select
          ref={ref}
          className={cn(
            'w-full appearance-none bg-white border border-[#e2e8f0] rounded-xl pl-3 pr-8 py-2 text-xs text-[#0d1424] focus:outline-none focus:border-[#2f68ff] focus:ring-2 focus:ring-[#2f68ff]/10 transition-all font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs',
            className
          )}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-white text-[#0d1424]">
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none" />
      </div>
    );
  }
);

Select.displayName = 'Select';
