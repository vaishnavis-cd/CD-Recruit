import React from 'react';
import { LucideIcon, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';

export interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  trend?: {
    value: string | number;
    positive?: boolean;
    isPositive?: boolean;
    neutral?: boolean;
  };
  alert?: {
    message: string;
    level?: 'warning' | 'danger';
  };
  loading?: boolean;
  isLoading?: boolean;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  alert,
  loading = false,
  isLoading = false,
  className,
}) => {
  const isBusy = loading || isLoading;

  if (isBusy) {
    return (
      <div className={cn('glass-panel rounded-2xl p-5 border border-slate-800/80', className)}>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <Skeleton className="h-7 w-36 mb-2" />
        <Skeleton className="h-3 w-44" />
      </div>
    );
  }

  const isDanger = alert?.level === 'danger';

  return (
    <div
      className={cn(
        'glass-panel rounded-2xl p-5 border transition-all duration-200 flex flex-col justify-between',
        alert
          ? isDanger
            ? 'border-rose-500/50 bg-rose-950/20 shadow-lg shadow-rose-950/30'
            : 'border-amber-500/50 bg-amber-950/20'
          : 'border-slate-800/80 hover:border-slate-700/80',
        className
      )}
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
            {title}
          </span>
          {Icon && (
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center border',
                alert
                  ? isDanger
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-slate-900 text-indigo-400 border-slate-800'
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
          )}
        </div>

        <div className="text-2xl font-bold text-white tracking-tight font-mono">{value}</div>

        {subtitle && <p className="text-xs text-slate-400 mt-1 font-medium">{subtitle}</p>}
      </div>

      {(trend || alert) && (
        <div className="mt-4 pt-3 border-t border-slate-800/60">
          {alert ? (
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium',
                isDanger ? 'text-rose-400' : 'text-amber-400'
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{alert.message}</span>
            </div>
          ) : trend ? (
            <div
              className={cn(
                'text-xs font-mono font-medium',
                trend.neutral
                  ? 'text-slate-400'
                  : (trend.positive ?? trend.isPositive)
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              )}
            >
              {typeof trend.value === 'number'
                ? trend.value > 0
                  ? `+${trend.value}%`
                  : `${trend.value}%`
                : trend.value}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
