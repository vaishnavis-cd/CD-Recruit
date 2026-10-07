import React from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, ExternalLink } from 'lucide-react';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrencyMinor, formatDateTime, truncateId } from '@/lib/utils';
import type { PaymentItem } from '@/lib/api/billing/types';

interface PaymentsTableProps {
  payments: PaymentItem[];
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
}

const HEADERS = [
  'Transaction / Ref ID',
  'Billing Account',
  'Processor',
  'Amount Settled',
  'Status',
  'Timestamp',
  'Receipt / Proof',
];

export const PaymentsTable: React.FC<PaymentsTableProps> = ({
  payments,
  isLoading,
  total,
  page,
  pageSize,
  onPageChange,
}) => {
  return (
    <DataTable
      headers={HEADERS}
      isLoading={isLoading}
      isEmpty={!isLoading && payments.length === 0}
      emptyTitle="No Payment Transactions Logged"
      emptyDescription="No automated gateway charges or manual wire invoices recorded yet."
      emptyIcon={DollarSign}
      pagination={{
        page,
        pageSize,
        total,
        onPageChange,
      }}
    >
      {payments.map((p) => (
        <tr key={p.id} className="hover:bg-slate-900/40 transition">
          <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
            {truncateId(p.id, 10, 6)}
          </td>

          <td className="py-3.5 px-4 font-mono text-xs text-indigo-400">
            <Link to={`/billing/accounts/${p.billingAccountId}`} className="hover:underline">
              {truncateId(p.billingAccountId, 8, 4)}
            </Link>
          </td>

          <td className="py-3.5 px-4 text-xs font-semibold text-slate-300">
            {p.provider || 'STRIPE'}
          </td>

          <td className="py-3.5 px-4 font-mono text-xs font-bold text-emerald-400">
            {formatCurrencyMinor(p.amountMinor, p.currency)}
          </td>

          <td className="py-3.5 px-4">
            <StatusBadge status={p.status} />
          </td>

          <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap">
            {formatDateTime(p.createdAt)}
          </td>

          <td className="py-3.5 px-4 text-xs text-slate-300">
            {p.invoiceUrl ? (
              <a
                href={p.invoiceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono text-[11px]"
              >
                <span>Invoice PDF</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-slate-500 font-mono text-[11px]">Direct Settlement</span>
            )}
          </td>
        </tr>
      ))}
    </DataTable>
  );
};
