import React, { useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { useBillingAccounts } from '@/hooks/billing/useBilling';
import { AccountsFilterBar } from './components/AccountsFilterBar';
import { AccountsTable } from './components/AccountsTable';
import { Button } from '@/components/ui/Button';

export const AccountsListPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [currency, setCurrency] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const { data, isLoading, refetch, isRefetching } = useBillingAccounts({
    page,
    pageSize,
    search: search.trim() || undefined,
    status: status || undefined,
    currency: currency || undefined,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-[#2f68ff]" />
              Commercial Billing Accounts
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative financial ledgers, currency-bound credit balances, and double-entry transaction journals.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          loading={isRefetching}
          icon={RefreshCw}
          className={isRefetching ? '[&_svg]:animate-spin' : ''}
        >
          Refresh
        </Button>
      </div>

      {/* Filter Bar */}
      <AccountsFilterBar
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        status={status}
        onStatusChange={(val) => {
          setStatus(val);
          setPage(1);
        }}
        currency={currency}
        onCurrencyChange={(val) => {
          setCurrency(val);
          setPage(1);
        }}
      />

      {/* Accounts Data Table */}
      <AccountsTable
        accounts={data?.items || []}
        isLoading={isLoading}
        total={data?.total || 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
};

export default AccountsListPage;
