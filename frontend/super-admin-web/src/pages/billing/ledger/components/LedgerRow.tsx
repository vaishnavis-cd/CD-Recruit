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
        className="hover:bg-slate-50/80 border-b border-[#e8ecf4] transition cursor-pointer select-none"
      >
        <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>#{entry.sequenceNumber ?? '—'}</span>
          </div>
        </td>

        <td className="py-3.5 px-4 font-mono text-xs text-slate-700 font-medium">
          {truncateId(entry.id, 8, 4)}
        </td>

        <td className="py-3.5 px-4 font-mono text-xs text-[#2f68ff]">
          <Link
            to={`/billing/accounts/${entry.billingAccountId}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:underline font-medium"
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
              isPositive ? 'text-emerald-600' : 'text-rose-600'
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

        <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-900 font-medium">
          {formatNumber(entry.balanceAfter ?? 0)}
        </td>

        <td className="py-3.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
          {formatDateTime(entry.createdAt)}
        </td>

        <td className="py-3.5 px-4 text-slate-600 text-xs truncate max-w-xs">
          {entry.description || entry.reason || '—'}
        </td>
      </tr>

      {/* Expandable Deep Audit Drawer */}
      {isExpanded && (
        <tr className="bg-slate-50/60 border-b border-[#e8ecf4]">
          <td colSpan={8} className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3.5 bg-white rounded-xl border border-[#e8ecf4] shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Idempotency Key</span>
                  {entry.idempotencyKey && (
                    <button
                      type="button"
                      onClick={handleCopyIdempotency}
                      className="text-slate-500 hover:text-slate-900 flex items-center gap-1 text-[11px] font-sans"
                    >
                      {copiedKey ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
                <p className="text-slate-800 break-all select-all text-xs font-mono bg-slate-50 p-2 rounded-lg border border-[#e8ecf4]">
                  {entry.idempotencyKey || 'None (Legacy / Direct)'}
                </p>
                <div className="pt-2 border-t border-[#e8ecf4] text-xs text-slate-500 flex justify-between font-sans">
                  <span>Credit Pool ID:</span>
                  <span className="font-mono">
                    {entry.creditPoolId ? (
                      <Link
                        to={`/billing/pools/${entry.creditPoolId}`}
                        className="text-[#2f68ff] hover:underline font-medium"
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

              <div className="p-3.5 bg-white rounded-xl border border-[#e8ecf4] shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-1.5 overflow-x-auto">
                <span className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider block font-sans">Audit Metadata JSON</span>
                <pre className="text-[11px] text-slate-800 font-mono leading-relaxed max-h-32 overflow-y-auto bg-slate-50 p-2.5 rounded-lg border border-[#e8ecf4]">
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

