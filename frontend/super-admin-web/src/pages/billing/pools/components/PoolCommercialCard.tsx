import React from 'react';
import { Coins, TrendingDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatNumber } from '@/lib/utils';
import type { CreditPoolDetail } from '@/lib/api/billing/types';

interface PoolCommercialCardProps {
  pool: CreditPoolDetail;
}

export const PoolCommercialCard: React.FC<PoolCommercialCardProps> = ({ pool }) => {
  const original = pool.originalAmount || pool.balance;
  const consumed = Math.max(0, original - pool.balance);
  const percentage = original > 0 ? Math.min(100, Math.round((consumed / original) * 100)) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Coins className="w-4 h-4 text-indigo-400" /> Commercial Capacity
        </CardTitle>
        <StatusBadge status={pool.poolType} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Available Balance</span>
            <span className="text-xl font-bold font-mono text-emerald-400">
              {formatNumber(pool.balance)}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Credits</span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Initial Granted</span>
            <span className="text-xl font-bold font-mono text-slate-200">
              {formatNumber(original)}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Credits</span>
          </div>
        </div>

        {/* Consumption Progress Bar */}
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-slate-500" /> Consumed: {formatNumber(consumed)}
            </span>
            <span>{percentage}%</span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percentage > 85 ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
