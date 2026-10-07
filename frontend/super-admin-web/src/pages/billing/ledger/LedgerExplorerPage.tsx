import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { History, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCreditLedger } from '@/hooks/billing/useBilling';
import { LedgerFilterBar } from './components/LedgerFilterBar';
import { LedgerTable } from './components/LedgerTable';
import { Button } from '@/components/ui/Button';

export const LedgerExplorerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialAccountId = searchParams.get('accountId') || '';

  const [accountId, setAccountId] = useState(initialAccountId);
  const [entryType, setEntryType] = useState('');
  const [datePreset, setDatePreset] = useState('all');
  const [shadowMode, setShadowMode] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Calculate startDate based on preset
  let startDate: string | undefined = undefined;
  if (datePreset === '24h') {
    startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  } else if (datePreset === '7d') {
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (datePreset === '30d') {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  const queryParams = {
    page,
    pageSize,
    accountId: accountId.trim() || undefined,
    entryType: entryType || undefined,
    startDate,
    shadowMode,
  };

  const { data, isLoading, refetch, isRefetching } = useCreditLedger(queryParams);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" />
              Authoritative Ledger Explorer
            </h1>
            <span className="flex items-center gap-1 text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3 h-3" /> Append-Only Invariant
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Global double-entry audit stream. Every single credit grant, consumption, overdraft, and reversal event.
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
      <LedgerFilterBar
        accountId={accountId}
        onAccountIdChange={(val) => {
          setAccountId(val);
          setPage(1);
        }}
        entryType={entryType}
        onEntryTypeChange={(val) => {
          setEntryType(val);
          setPage(1);
        }}
        datePreset={datePreset}
        onDatePresetChange={(val) => {
          setDatePreset(val);
          setPage(1);
        }}
        shadowMode={shadowMode}
        onShadowModeToggle={(val) => {
          setShadowMode(val);
          setPage(1);
        }}
        exportParams={queryParams}
      />

      {/* Ledger Table */}
      <LedgerTable
        entries={data?.items || []}
        isLoading={isLoading}
        total={data?.total || 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
};

export default LedgerExplorerPage;
