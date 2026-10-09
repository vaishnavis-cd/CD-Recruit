import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, RefreshCw } from 'lucide-react';
import { useReconciliationStatus } from '@/hooks/billing/useBilling';
import { useAuthStore } from '@/lib/auth-store';
import { ReconciliationStatusBanner } from './components/ReconciliationStatusBanner';
import { ReconciliationChecksGrid } from './components/ReconciliationChecksGrid';
import { ShadowModeProgressCard } from './components/ShadowModeProgressCard';
import { DeclareIncidentModal } from './components/DeclareIncidentModal';
import { Button } from '@/components/ui/Button';

export const IntegrityConsolePage: React.FC = () => {
  const { staff } = useAuthStore();
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useReconciliationStatus();

  const canManage = staff?.role === 'OWNER' || staff?.role === 'FINANCE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-[#2f68ff]" />
              Integrity, Reconciliation & Incident Console
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time invariant monitoring, shadow-mode comparison trackers, and proactive incident remediation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            isLoading={isRefetching}
            icon={RefreshCw}
          >
            Refresh
          </Button>

          {canManage && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsIncidentModalOpen(true)}
              icon={AlertTriangle}
            >
              Declare Incident Window
            </Button>
          )}
        </div>
      </div>

      {/* Main Health Status Banner */}
      <ReconciliationStatusBanner
        lastRun={data}
        isLoading={isLoading}
        canTrigger={canManage}
      />

      {/* Main Grid: 7 Invariants + Shadow Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ReconciliationChecksGrid lastRun={data} />
        </div>
        <div>
          <ShadowModeProgressCard
            completedAttempts={data?.shadowStats?.completedAttempts}
            discrepancies={data?.shadowStats?.discrepancies}
            targetAttempts={data?.shadowStats?.targetAttempts}
          />
        </div>
      </div>

      {/* Incident Modal */}
      <DeclareIncidentModal
        isOpen={isIncidentModalOpen}
        onClose={() => setIsIncidentModalOpen(false)}
      />
    </div>
  );
};

export default IntegrityConsolePage;
