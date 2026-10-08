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
}

const HEADERS = [
  'Account ID',
  'Primary Organization',
  'Status',
  'Currency',
  'Balance (Credits)',
  'Overdraft',
  'Actions',
];

export const AccountsTable: React.FC<AccountsTableProps> = ({
  accounts,
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
      isEmpty={!isLoading && accounts.length === 0}
      emptyTitle="No Billing Accounts Found"
      emptyDescription="Try adjusting your filters to find commercial billing accounts."
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
        />
      ))}
    </DataTable>
  );
};
