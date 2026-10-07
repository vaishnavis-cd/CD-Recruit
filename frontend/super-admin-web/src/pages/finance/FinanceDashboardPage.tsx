import React from 'react';
import { DollarSign, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useFinanceOverview } from '@/hooks/billing/useBilling';
import { ThroughputCards } from './components/ThroughputCards';
import { CurrencyRevenueBreakdown } from './components/CurrencyRevenueBreakdown';
import { OverdraftRiskCard } from './components/OverdraftRiskCard';
import { MarginAlarmCard } from './components/MarginAlarmCard';
import { Button } from '@/components/ui/Button';

export const FinanceDashboardPage: React.FC = () => {
  const { data, isLoading, refetch, isRefetching } = useFinanceOverview();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-indigo-400" />
              Executive Finance & Revenue Telemetry
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time gross settlement volume, credit velocity, overdraft exposures, and AI proctoring unit margins.
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

      {/* Throughput KPIs */}
      <ThroughputCards metrics={data} isLoading={isLoading} />

      {/* Middle Grid: Margin Alarm & Overdraft Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MarginAlarmCard
          aiCostPercentage={data?.aiCostPercentage}
          totalAiCostMinor={data?.totalAiCostMinor}
          totalRevenueMinor={data?.totalRevenueMinor}
        />
        <OverdraftRiskCard overdraftAccounts={data?.atRiskAccounts} />
      </div>

      {/* Territorial Currency Breakdown */}
      <CurrencyRevenueBreakdown breakdown={data?.revenueByCurrency} />
    </div>
  );
};

export default FinanceDashboardPage;
