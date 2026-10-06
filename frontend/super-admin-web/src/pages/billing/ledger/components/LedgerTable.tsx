import React from 'react';
import { History } from 'lucide-react';
import { DataTable } from '@/components/ui/DataTable';
import { LedgerRow } from './LedgerRow';
import type { CreditLedgerEntryItem } from '@/lib/api/billing/types';

interface LedgerTableProps {
  entries: CreditLedgerEntryItem[];
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
}

const HEADERS = [
  'Seq',
  'Entry ID',
  'Account ID',
  'Type',
  'Delta',
  'Balance After',
  'Timestamp',
  'Description / Reference',
];

export const LedgerTable: React.FC<LedgerTableProps> = ({
  entries,
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
      isEmpty={!isLoading && entries.length === 0}
      emptyTitle="No Ledger Entries Found"
      emptyDescription="No transactions match your search filters or the ledger is currently pristine."
      emptyIcon={History}
      pagination={{
        page,
        pageSize,
        total,
        onPageChange,
      }}
    >
      {entries.map((entry) => (
        <LedgerRow key={entry.id} entry={entry} />
      ))}
    </DataTable>
  );
};
