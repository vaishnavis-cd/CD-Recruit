import React from 'react';
import { Link } from 'react-router-dom';
import { Layers, ChevronRight, Clock, Plus } from 'lucide-react';
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
      <div className="p-12 text-center bg-slate-900/40 border border-slate-800/80 rounded-2xl">
        <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-white mb-1">No Active Credit Pools</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
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
          <h3 className="text-sm font-bold text-white">Credit Pools ({pools.length})</h3>
          <p className="text-xs text-slate-400">
            Isolated buckets consumed under strict priority: Expiring First, then Trial, Goodwill, Contract.
          </p>
        </div>
        {canCreatePool && onCreatePool && (
          <Button size="sm" variant="outline" onClick={onCreatePool} icon={Plus}>
            Grant Credits
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/50 text-[11px] font-semibold text-slate-400">
              <th className="py-3 px-4">Pool ID</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Remaining Balance</th>
              <th className="py-3 px-4 text-right">Initial Credits</th>
              <th className="py-3 px-4">Validity Window</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {pools.map((pool) => {
              const isExhausted = pool.balance <= 0;
              const isExpired = pool.expiresAt && new Date(pool.expiresAt).getTime() < Date.now();

              let displayStatus: string = pool.status;
              if (isExpired) displayStatus = 'EXPIRED';
              else if (isExhausted) displayStatus = 'EXHAUSTED';

              return (
                <tr key={pool.id} className="hover:bg-slate-900/40 transition">
                  <td className="py-3.5 px-4 font-mono font-medium text-indigo-400">
                    <Link to={`/billing/pools/${pool.id}`} className="hover:underline flex items-center gap-1">
                      {truncateId(pool.id, 8, 6)}
                    </Link>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={pool.poolType} />
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={displayStatus} />
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-200">
                    {formatNumber(pool.balance)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                    {formatNumber(pool.originalAmount || pool.balance)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>
                        {pool.expiresAt ? formatDateTime(pool.expiresAt) : 'Never Expires'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link to={`/billing/pools/${pool.id}`}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2.5">
                        Inspect <ChevronRight className="w-3 h-3 ml-1" />
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
