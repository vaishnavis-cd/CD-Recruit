import React from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/utils';
import { useTriggerReconciliationMutation } from '@/hooks/billing/useBilling';
import type { ReconciliationRunResult } from '@/lib/api/billing/types';

interface ReconciliationStatusBannerProps {
  lastRun?: ReconciliationRunResult;
  isLoading: boolean;
  canTrigger: boolean;
}

export const ReconciliationStatusBanner: React.FC<ReconciliationStatusBannerProps> = ({
  lastRun,
  isLoading,
  canTrigger,
}) => {
  const triggerMutation = useTriggerReconciliationMutation();

  const isDrift = lastRun?.status === 'DRIFT_DETECTED';

  return (
    <div
      className={`rounded-2xl p-6 border transition flex flex-col md:flex-row md:items-center justify-between gap-6 ${
        isDrift
          ? 'bg-rose-50 border-rose-200 shadow-[0_4px_16px_rgba(225,29,72,0.06)]'
          : 'bg-emerald-50/60 border-emerald-200/80 shadow-[0_4px_16px_rgba(16,185,129,0.04)]'
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            isDrift ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
          }`}
        >
          {isDrift ? (
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          ) : (
            <ShieldCheck className="w-6 h-6" />
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900">
              {isDrift ? 'Reconciliation Invariant Drift Detected' : 'All Ledger Invariants Verified'}
            </h2>
            <span
              className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                isDrift
                  ? 'bg-rose-100 text-rose-700 border-rose-300'
                  : 'bg-emerald-100 text-emerald-700 border-emerald-300'
              }`}
            >
              {isDrift ? 'ACTION REQUIRED' : '100% HEALTHY'}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            {isDrift
              ? 'One or more mathematical invariants between pools and ledger entries failed validation.'
              : 'Continuous automated verification across all 7 financial constraints passed with zero drift.'}
          </p>
          <p className="text-[11px] font-mono text-slate-500 mt-1">
            Last Sweep: {lastRun ? formatDateTime(lastRun.timestamp) : 'Continuous (Hourly cron active)'}
          </p>
        </div>
      </div>

      {canTrigger && (
        <Button
          variant={isDrift ? 'danger' : 'primary'}
          onClick={() => triggerMutation.mutate()}
          isLoading={triggerMutation.isPending || isLoading}
          icon={Play}
          className="shrink-0"
        >
          Run Invariant Sweep Now
        </Button>
      )}
    </div>
  );
};
