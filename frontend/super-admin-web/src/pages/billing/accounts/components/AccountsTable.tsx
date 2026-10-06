import React from 'react';
import { CreditCard } from 'lucide-react';
import { DataTable } from '@/components/ui/DataTable';
import { AccountRow } from './AccountRow';
import type { BillingAccountListItem } from '@/lib/api/billing/types';

interface AccountsTableProps {
  accounts: BillingAccountListItem[];
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onAdjustOverdraft?: (account: BillingAccountListItem) => void;
}

const HEADERS = [
  'Account ID',
  'Primary Organization',
  'Status',
  'Currency',
  'Balance (Credits)',
  'Overdraft Limit',
  'Actions',
];

export const AccountsTable: React.FC<AccountsTableProps> = ({
  accounts,
  isLoading,
  total,
  page,
  pageSize,
  onPageChange,
  onAdjustOverdraft,
}) => {
  return (
    <DataTable
      headers={HEADERS}
      isLoading={isLoading}
      isEmpty={!isLoading && accounts.length === 0}
      emptyTitle="No Billing Accounts Found"
      emptyDescription="Try adjusting your filters or create a new billing account to get started."
      emptyIcon={CreditCard}
      pagination={{
        page,
        pageSize,
        total,
        onPageChange,
      }}
    >
      {accounts.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          onAdjustOverdraft={onAdjustOverdraft}
        />
      ))}
    </DataTable>
  );
};
