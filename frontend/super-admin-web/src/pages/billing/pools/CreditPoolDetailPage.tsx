import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Layers, RefreshCw, CreditCard } from 'lucide-react';
import { useCreditPoolDetail } from '@/hooks/billing/useBilling';
import { useAuthStore } from '@/lib/auth-store';
import { PoolCommercialCard } from './components/PoolCommercialCard';
import { PoolValidityCard } from './components/PoolValidityCard';
import { PoolEvidenceCard } from './components/PoolEvidenceCard';
import { PoolDrawdownTable } from './components/PoolDrawdownTable';
import { ExtendExpiryModal } from './components/ExtendExpiryModal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';

export const CreditPoolDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { staff } = useAuthStore();
  const { data: pool, isLoading, error, refetch, isRefetching } = useCreditPoolDetail(id || '');

  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const canManage = staff?.role === 'OWNER' || staff?.role === 'FINANCE';

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-xs text-slate-400">Loading credit pool bucket details...</p>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="p-8 max-w-xl mx-auto bg-slate-900/60 border border-slate-800 rounded-2xl text-center space-y-4">
        <h2 className="text-base font-bold text-white">Credit Pool Not Found</h2>
        <p className="text-xs text-slate-400">
          The requested credit pool bucket could not be found in the authoritative ledger.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/billing/accounts">
            <Button variant="outline" size="sm" icon={ArrowLeft}>
              Back to Accounts
            </Button>
          </Link>
          <Button variant="primary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <div>
        <Link
          to={`/billing/accounts/${pool.billingAccountId}`}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Billing Account
        </Link>
      </div>

      {/* Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-white font-mono tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              Pool: {pool.id}
            </h1>
            <StatusBadge status={pool.status} />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Billing Account:</span>
            <Link
              to={`/billing/accounts/${pool.billingAccountId}`}
              className="font-mono text-indigo-400 hover:underline flex items-center gap-1"
            >
              <CreditCard className="w-3.5 h-3.5" /> {pool.billingAccountId}
            </Link>
          </div>
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

      {/* Commercial, Validity, and Evidence Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <PoolCommercialCard pool={pool} />
        <PoolValidityCard
          pool={pool}
          onOpenExtendModal={() => setIsExtendModalOpen(true)}
          canExtend={canManage}
        />
        <PoolEvidenceCard pool={pool} />
      </div>

      {/* Drawdown Consumption Trail */}
      <PoolDrawdownTable drawdowns={pool.drawdowns} />

      {/* Extend Expiry Modal */}
      <ExtendExpiryModal
        pool={pool}
        isOpen={isExtendModalOpen}
        onClose={() => setIsExtendModalOpen(false)}
      />
    </div>
  );
};

export default CreditPoolDetailPage;
