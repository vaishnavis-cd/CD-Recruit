import React from 'react';
import { Link } from 'react-router-dom';
import { History, ExternalLink, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { formatNumber, formatDateTime, truncateId } from '@/lib/utils';
import type { CreditLedgerEntryItem } from '@/lib/api/billing/types';

interface AccountTransactionsTabProps {
  accountId: string;
  transactions: CreditLedgerEntryItem[];
}

export const AccountTransactionsTab: React.FC<AccountTransactionsTabProps> = ({
  accountId,
  transactions = [],
}) => {
  if (transactions.length === 0) {
    return (
      <div className="p-12 text-center bg-white border border-[#e8ecf4] rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
        <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-slate-900 mb-1">No Ledger History</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          No credit grants or drawdown events recorded on the append-only ledger yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Recent Transactions ({transactions.length})</h3>
          <p className="text-xs text-slate-500">
            Immutable, sequence-locked double-entry audit records.
          </p>
        </div>

        <Link to={`/billing/ledger?accountId=${accountId}`}>
          <Button size="sm" variant="outline" icon={ExternalLink}>
            Open In Ledger Explorer
          </Button>
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#e8ecf4] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#e8ecf4] bg-[#f8fafc] text-[11px] font-semibold text-slate-500 uppercase font-mono text-[10px]">
              <th className="py-3 px-4">Entry / Seq</th>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4 text-right">Delta (Credits)</th>
              <th className="py-3 px-4 text-right">Balance After</th>
              <th className="py-3 px-4">Description / Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8ecf4] text-xs">
            {transactions.map((tx) => {
              const isPositive = tx.amount > 0;
              return (
                <tr key={tx.id} className="hover:bg-[#f8fafc]/70 transition">
                  <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                    <span className="text-slate-400 mr-1.5 font-normal">#{tx.sequenceNumber ?? '—'}</span>
                    {truncateId(tx.id, 8, 4)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                    {formatDateTime(tx.createdAt)}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={tx.entryType} />
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold">
                    <span
                      className={`inline-flex items-center gap-1 ${
                        isPositive ? 'text-[#12b76a]' : 'text-[#f04438]'
                      }`}
                    >
                      {isPositive ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {isPositive ? `+${formatNumber(tx.amount)}` : formatNumber(tx.amount)}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-700 font-semibold">
                    {formatNumber(tx.balanceAfter ?? 0)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 truncate max-w-xs">
                    {tx.description || tx.reason || '—'}
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
