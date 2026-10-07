import React, { createContext, useContext } from 'react';
import { cn } from '@/lib/utils';

interface TabsContextType {
  value: string;
  onValueChange: (val: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export interface TabsProps {
  value: string;
  onValueChange: (val: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ value, onValueChange, children, className }) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
};

export const TabsList: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 p-1 bg-slate-950/80 border border-slate-800/80 rounded-xl overflow-x-auto',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  count?: number;
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
}

export const TabsTrigger: React.FC<TabsTriggerProps> = ({
  value,
  count,
  icon,
  className,
  children,
  ...props
}) => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('TabsTrigger must be used within Tabs');

  const isActive = ctx.value === value;

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    const IconComp = icon as React.ComponentType<{ className?: string }>;
    return <IconComp className="w-3.5 h-3.5 shrink-0" />;
  };

  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap',
        isActive
          ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent',
        className
      )}
      {...props}
    >
      {renderIcon()}
      <span>{children}</span>
      {count !== undefined && (
        <span
          className={cn(
            'px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold border',
            isActive
              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              : 'bg-slate-900 text-slate-500 border-slate-800'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
};

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent: React.FC<TabsContentProps> = ({
  value,
  className,
  children,
  ...props
}) => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('TabsContent must be used within Tabs');

  if (ctx.value !== value) return null;

  return (
    <div className={cn('mt-4 animate-in fade-in-0 duration-150', className)} {...props}>
      {children}
    </div>
  );
};
