import React, { useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { useBillingAccounts } from '@/hooks/billing/useBilling';
import { useAuthStore } from '@/lib/auth-store';
import { AccountsFilterBar } from './components/AccountsFilterBar';
import { AccountsTable } from './components/AccountsTable';
import { CreateAccountModal } from './components/CreateAccountModal';
import { OverdraftModal } from './components/OverdraftModal';
import { Button } from '@/components/ui/Button';
import type { BillingAccountListItem } from '@/lib/api/billing/types';

export const AccountsListPage: React.FC = () => {
  const { staff } = useAuthStore();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [currency, setCurrency] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<BillingAccountListItem | null>(null);

  const { data, isLoading, refetch, isRefetching } = useBillingAccounts({
    page,
    pageSize,
    search: search.trim() || undefined,
    status: status || undefined,
    currency: currency || undefined,
  });

  const canManageAccounts = staff?.role === 'OWNER' || staff?.role === 'FINANCE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-400" />
              Commercial Billing Accounts
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative financial ledgers, currency-bound credit balances, and dual-authorized overdraft buffers.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          isLoading={isRefetching}
          icon={RefreshCw}
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
        onCreateClick={() => setIsCreateOpen(true)}
        canCreate={canManageAccounts}
      />

      {/* Accounts Data Table */}
      <AccountsTable
        accounts={data?.items || []}
        isLoading={isLoading}
        total={data?.total || 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onAdjustOverdraft={canManageAccounts ? (acc) => setSelectedAccount(acc) : undefined}
      />

      {/* Modals */}
      <CreateAccountModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <OverdraftModal
        account={selectedAccount}
        isOpen={!!selectedAccount}
        onClose={() => setSelectedAccount(null)}
      />
    </div>
  );
};

export default AccountsListPage;
