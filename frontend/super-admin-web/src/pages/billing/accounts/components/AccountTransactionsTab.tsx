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
      <div className="p-12 text-center bg-slate-900/40 border border-slate-800/80 rounded-2xl">
        <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-white mb-1">No Ledger History</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          No credit grants or drawdown events recorded on the append-only ledger yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Recent Transactions ({transactions.length})</h3>
          <p className="text-xs text-slate-400">
            Immutable, sequence-locked double-entry audit records.
          </p>
        </div>

        <Link to={`/billing/ledger?accountId=${accountId}`}>
          <Button size="sm" variant="outline" icon={ExternalLink}>
            Open In Ledger Explorer
          </Button>
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/50 text-[11px] font-semibold text-slate-400">
              <th className="py-3 px-4">Entry / Seq</th>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4 text-right">Delta (Credits)</th>
              <th className="py-3 px-4 text-right">Balance After</th>
              <th className="py-3 px-4">Description / Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {transactions.map((tx) => {
              const isPositive = tx.amount > 0;
              return (
                <tr key={tx.id} className="hover:bg-slate-900/40 transition">
                  <td className="py-3.5 px-4 font-mono font-medium text-slate-300">
                    <span className="text-slate-500 mr-1.5 font-normal">#{tx.sequenceNumber ?? '—'}</span>
                    {truncateId(tx.id, 8, 4)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                    {formatDateTime(tx.createdAt)}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={tx.entryType} />
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold">
                    <span
                      className={`inline-flex items-center gap-1 ${
                        isPositive ? 'text-emerald-400' : 'text-red-400'
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
                  <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                    {formatNumber(tx.balanceAfter ?? 0)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-300 truncate max-w-xs">
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
