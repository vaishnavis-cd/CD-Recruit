import React from 'react';
import { Layers, ArrowDownRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatNumber, formatDateTime, truncateId } from '@/lib/utils';
import type { CreditLedgerEntryItem } from '@/lib/api/billing/types';

interface PoolDrawdownTableProps {
  drawdowns?: CreditLedgerEntryItem[];
}

export const PoolDrawdownTable: React.FC<PoolDrawdownTableProps> = ({ drawdowns = [] }) => {
  if (drawdowns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" /> Drawdown Consumption Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-slate-500 text-xs">
            No drawdowns recorded against this credit pool yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" /> Drawdown Consumption Trail ({drawdowns.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-[11px] font-semibold text-slate-400">
                <th className="py-3 px-4">Entry ID</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Event Type</th>
                <th className="py-3 px-4 text-right">Deducted Credits</th>
                <th className="py-3 px-4">Purpose / Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {drawdowns.map((item) => (
                <tr key={item.id} className="hover:bg-slate-900/40 transition">
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {truncateId(item.id, 8, 4)}
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-[11px]">
                    {formatDateTime(item.createdAt)}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={item.entryType} />
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-red-400">
                    <span className="inline-flex items-center gap-1">
                      <ArrowDownRight className="w-3.5 h-3.5" />
                      {formatNumber(Math.abs(item.amount))}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 truncate max-w-xs">
                    {item.description || item.reason || 'Candidate session assessment'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
