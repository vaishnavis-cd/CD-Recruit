import React from 'react';
import { Tag } from 'lucide-react';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrencyMinor, formatDateTime } from '@/lib/utils';
import type { PriceBookItem } from '@/lib/api/billing/types';

interface PriceBookTableProps {
  items: PriceBookItem[];
  isLoading: boolean;
}

const HEADERS = [
  'Tier / SKU Name',
  'Currency',
  'Unit Rate',
  'Effective From',
  'Effective Until',
  'Standing',
];

export const PriceBookTable: React.FC<PriceBookTableProps> = ({ items, isLoading }) => {
  return (
    <DataTable
      headers={HEADERS}
      isLoading={isLoading}
      isEmpty={!isLoading && items.length === 0}
      emptyTitle="No Price Book Entries Defined"
      emptyDescription="No pricing tiers are registered for this currency zone yet."
      emptyIcon={Tag}
    >
      {items.map((item) => (
        <tr key={item.id} className="hover:bg-slate-50/80 border-b border-[#e8ecf4] transition">
          <td className="py-3.5 px-4 font-semibold text-xs text-slate-900">
            {item.tierName}
          </td>

          <td className="py-3.5 px-4 font-mono text-xs text-slate-700 font-bold">
            {item.currency}
          </td>

          <td className="py-3.5 px-4 font-mono text-xs font-bold text-emerald-600">
            {formatCurrencyMinor(item.unitRateMinor, item.currency)}
          </td>

          <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
            {formatDateTime(item.effectiveFrom)}
          </td>

          <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
            {item.effectiveTo ? formatDateTime(item.effectiveTo) : 'Current Standard (Indefinite)'}
          </td>

          <td className="py-3.5 px-4">
            <StatusBadge status={item.status || (item.isActive ? 'ACTIVE' : 'SUPERSEDED')} />
          </td>
        </tr>
      ))}
    </DataTable>
  );
};
