import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, ArrowDownRight, ArrowUpRight, Copy, Check } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatNumber, formatDateTime, truncateId } from '@/lib/utils';
import type { CreditLedgerEntryItem } from '@/lib/api/billing/types';

interface LedgerRowProps {
  entry: CreditLedgerEntryItem;
}

export const LedgerRow: React.FC<LedgerRowProps> = ({ entry }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const isPositive = entry.amount > 0;

  const handleCopyIdempotency = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.idempotencyKey) {
      navigator.clipboard.writeText(entry.idempotencyKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <>
      <tr
        onClick={() => setIsExpanded(!isExpanded)}
        className="hover:bg-slate-900/40 transition cursor-pointer select-none"
      >
        <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>#{entry.sequenceNumber ?? '—'}</span>
          </div>
        </td>

        <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
          {truncateId(entry.id, 8, 4)}
        </td>

        <td className="py-3.5 px-4 font-mono text-xs text-indigo-400">
          <Link
            to={`/billing/accounts/${entry.billingAccountId}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:underline"
          >
            {truncateId(entry.billingAccountId, 8, 4)}
          </Link>
        </td>

        <td className="py-3.5 px-4">
          <StatusBadge status={entry.entryType} />
        </td>

        <td className="py-3.5 px-4 text-right font-mono text-xs font-bold">
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
            {isPositive ? `+${formatNumber(entry.amount)}` : formatNumber(entry.amount)}
          </span>
        </td>

        <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-300">
          {formatNumber(entry.balanceAfter ?? 0)}
        </td>

        <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
          {formatDateTime(entry.createdAt)}
        </td>

        <td className="py-3.5 px-4 text-slate-300 text-xs truncate max-w-xs">
          {entry.description || entry.reason || '—'}
        </td>
      </tr>

      {/* Expandable Deep Audit Drawer */}
      {isExpanded && (
        <tr className="bg-slate-950/80 border-b border-slate-800/80">
          <td colSpan={8} className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Idempotency Key</span>
                  {entry.idempotencyKey && (
                    <button
                      type="button"
                      onClick={handleCopyIdempotency}
                      className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px]"
                    >
                      {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
                <p className="text-slate-200 break-all select-all text-[11px]">
                  {entry.idempotencyKey || 'None (Legacy / Direct)'}
                </p>
                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between">
                  <span>Credit Pool ID:</span>
                  <span className="text-slate-300">
                    {entry.creditPoolId ? (
                      <Link
                        to={`/billing/pools/${entry.creditPoolId}`}
                        className="text-indigo-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {truncateId(entry.creditPoolId, 8, 6)}
                      </Link>
                    ) : (
                      'N/A'
                    )}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800 space-y-1 overflow-x-auto">
                <span className="text-slate-400 text-[11px] block">Audit Metadata JSON</span>
                <pre className="text-[10px] text-slate-300 font-mono leading-tight max-h-32 overflow-y-auto">
                  {entry.metadata ? JSON.stringify(entry.metadata, null, 2) : '{}'}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};
