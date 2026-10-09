import React from 'react';
import { Link } from 'react-router-dom';
import { Layers, Clock, Plus } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { formatNumber, formatDateTime, truncateId } from '@/lib/utils';
import type { CreditPoolDetail } from '@/lib/api/billing/types';

interface AccountPoolsTabProps {
  pools: CreditPoolDetail[];
  onCreatePool?: () => void;
  canCreatePool?: boolean;
}

export const AccountPoolsTab: React.FC<AccountPoolsTabProps> = ({
  pools,
  onCreatePool,
  canCreatePool,
}) => {
  if (pools.length === 0) {
    return (
      <div className="p-12 text-center bg-white border border-[#e8ecf4] rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
        <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-slate-900 mb-1">No Active Credit Pools</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
          This account does not have any active or historical credit buckets.
        </p>
        {canCreatePool && onCreatePool && (
          <Button size="sm" variant="primary" onClick={onCreatePool} icon={Plus}>
            Grant Credit Pool
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Credit Pools ({pools.length})</h3>
          <p className="text-xs text-slate-500">
            Isolated buckets consumed under strict priority: Expiring First, then Trial, Goodwill, Contract.
          </p>
        </div>
        {canCreatePool && onCreatePool && (
          <Button size="sm" variant="outline" onClick={onCreatePool} icon={Plus}>
            Grant Credits
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#e8ecf4] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#e8ecf4] bg-[#f8fafc] text-[11px] font-semibold text-slate-500 uppercase font-mono text-[10px]">
              <th className="py-3 px-4">Pool ID</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Remaining Balance</th>
              <th className="py-3 px-4 text-right">Initial Credits</th>
              <th className="py-3 px-4">Validity Window</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8ecf4] text-xs">
            {pools.map((pool) => {
              const isExhausted = pool.balance <= 0;
              const isExpired = pool.expiresAt && new Date(pool.expiresAt).getTime() < Date.now();

              let displayStatus: string = pool.status;
              if (isExpired) displayStatus = 'EXPIRED';
              else if (isExhausted) displayStatus = 'EXHAUSTED';

              return (
                <tr key={pool.id} className="hover:bg-[#f8fafc]/70 transition">
                  <td className="py-3.5 px-4 font-mono font-medium text-[#2f68ff]">
                    <Link to={`/billing/pools/${pool.id}`} className="hover:underline flex items-center gap-1">
                      {truncateId(pool.id, 8, 6)}
                    </Link>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={pool.poolType} />
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={displayStatus} dot />
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                    {formatNumber(pool.balance)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-500">
                    {formatNumber(pool.originalAmount || pool.balance)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>
                        {pool.expiresAt ? formatDateTime(pool.expiresAt) : 'Never Expires'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link to={`/billing/pools/${pool.id}`}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-[#2f68ff]">
                        View Details
                      </Button>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
