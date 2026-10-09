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
      <div className={cn('bg-white rounded-2xl p-5 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)]', className)}>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-9 rounded-full" />
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
        'bg-white rounded-2xl p-5 border transition-all duration-200 shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between',
        alert
          ? isDanger
            ? 'border-rose-200 bg-rose-50/40'
            : 'border-amber-200 bg-amber-50/40'
          : 'border-[#e8ecf4] hover:border-[#cbd5e1]',
        className
      )}
    >
      <div>
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[12px] font-bold tracking-wider text-[#94a3b8] block">
              {title}
            </span>
            <div className="text-2xl font-extrabold text-[#0d1424] tracking-tight mt-1">
              {value}
            </div>
            {subtitle && <p className="text-xs text-[#64748b] mt-0.5 font-normal">{subtitle}</p>}
          </div>

          {Icon && (
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                alert
                  ? isDanger
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-amber-50 text-amber-600'
                  : 'bg-[#eff6ff] text-[#2f68ff]'
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>

      {(trend || alert) && (
        <div className="mt-3.5 pt-2.5 border-t border-[#f1f5f9]">
          {alert ? (
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium',
                isDanger ? 'text-rose-600' : 'text-amber-600'
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{alert.message}</span>
            </div>
          ) : trend ? (
            <div>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border',
                  trend.neutral
                    ? 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'
                    : (trend.positive ?? trend.isPositive)
                    ? 'bg-[#ecfdf3] text-[#12b76a] border-[#a6f4c5]'
                    : 'bg-[#fef3f2] text-[#f04438] border-[#fecdca]'
                )}
              >
                <span>{(trend.positive ?? trend.isPositive) ? '▲' : trend.neutral ? '•' : '▼'}</span>{' '}
                {typeof trend.value === 'number'
                  ? trend.value > 0
                    ? `+${trend.value}%`
                    : `${trend.value}%`
                  : trend.value}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
