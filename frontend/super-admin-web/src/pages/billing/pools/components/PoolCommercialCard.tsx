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
    <Card className="bg-white border-[#e8ecf4]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900">
          <Coins className="w-4 h-4 text-[#2f68ff]" /> Commercial Capacity
        </CardTitle>
        <StatusBadge status={pool.poolType} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-[#f8fafc] rounded-xl border border-[#e8ecf4]">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Available Balance</span>
            <span className="text-xl font-bold font-mono text-[#12b76a]">
              {formatNumber(pool.balance)}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Credits</span>
          </div>

          <div className="p-3 bg-[#f8fafc] rounded-xl border border-[#e8ecf4]">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Initial Granted</span>
            <span className="text-xl font-bold font-mono text-slate-900">
              {formatNumber(original)}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Credits</span>
          </div>
        </div>

        {/* Consumption Progress Bar */}
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs text-slate-500 font-mono">
            <span className="flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-slate-400" /> Consumed: {formatNumber(consumed)}
            </span>
            <span className="font-semibold text-slate-700">{percentage}%</span>
          </div>
          <div className="h-2 w-full bg-[#f1f5f9] rounded-full overflow-hidden border border-[#e2e8f0]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percentage > 85 ? 'bg-[#f79009]' : 'bg-[#2f68ff]'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
