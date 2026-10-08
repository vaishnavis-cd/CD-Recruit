import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, ExternalLink, Plus, Layers, ShieldCheck } from 'lucide-react';
import { useBillingAccountSummary } from '@/hooks/billing/useBilling';
import { useAuthStore } from '@/lib/auth-store';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { CreateBillingRequestModal } from '@/pages/billing/requests/components/CreateBillingRequestModal';
import { formatNumber, formatDateTime, truncateId } from '@/lib/utils';
import type { BillingAccountListItem } from '@/lib/api/billing/types';

interface TenantBillingTabProps {
  tenantId: string;
  billingAccountId?: string | null;
}

export const TenantBillingTab: React.FC<TenantBillingTabProps> = ({
  tenantId,
  billingAccountId,
}) => {
  const { staff } = useAuthStore();
  const { data: summary, isLoading } = useBillingAccountSummary(billingAccountId || '');

  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);

  const canManage = staff?.role === 'OWNER' || staff?.role === 'FINANCE';

  if (isLoading && billingAccountId) {
    return (
      <div className="p-12 text-center text-xs text-slate-500">
        Loading commercial ledger summary for tenant...
      </div>
    );
  }

  const accountId = billingAccountId || summary?.account?.id || summary?.billingAccountId;

  if (!billingAccountId || !summary || !accountId) {
    return (
      <div className="p-12 text-center bg-white border border-[#e8ecf4] rounded-2xl space-y-4 shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
        <CreditCard className="w-10 h-10 text-slate-300 mx-auto" />
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-1">Commercial Billing Engine Not Linked</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            This tenant organization does not have an active double-entry billing account allocated yet.
          </p>
        </div>

        {canManage && (
          <Link to="/billing/accounts">
            <Button size="sm" variant="primary" icon={Plus}>
              View Commercial Accounts
            </Button>
          </Link>
        )}
      </div>
    );
  }

  const accountData: BillingAccountListItem = summary.account || {
    id: accountId,
    currency: summary.currency || 'INR',
    status: summary.status || 'ACTIVE',
    balance: summary.totalAvailableCredits ?? 0,
    overdraftLimit: 0,
    createdAt: new Date().toISOString(),
  };

  const pools = summary.account?.pools || summary.activePools?.map((p) => ({
    id: p.id,
    billingAccountId: accountId,
    currency: summary.currency || 'INR',
    status: 'ACTIVE' as const,
    poolType: p.poolType,
    balance: p.cachedRemaining ?? p.balance ?? 0,
    expiresAt: p.expiresAt,
    createdAt: new Date().toISOString(),
  })) || [];

  return (
    <div className="space-y-6 pt-2">
      {/* Account Overview Bar */}
      <div className="bg-white border border-[#e8ecf4] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">Authoritative Account:</span>
            <Link
              to={`/billing/accounts/${accountId}`}
              className="font-mono text-sm font-bold text-[#2f68ff] hover:underline flex items-center gap-1.5"
            >
              {accountId}
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <StatusBadge status={accountData.status} dot />
          </div>
          <p className="text-[11px] text-slate-500">
            Currency: <span className="font-mono font-semibold text-slate-700">{accountData.currency}</span> • Dual-audited double-entry ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsGrantModalOpen(true)}
              icon={Plus}
            >
              Submit Billing Request
            </Button>
          )}

          <Link to={`/billing/accounts/${accountId}`}>
            <Button size="sm" variant="ghost">
              Open 360 Account
            </Button>
          </Link>
        </div>
      </div>

      {/* Commercial Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
          <span className="text-[10px] uppercase font-mono text-slate-500 block">Available Balance</span>
          <span className={`text-xl font-bold font-mono ${accountData.balance < 0 ? 'text-[#f04438]' : 'text-[#12b76a]'}`}>
            {formatNumber(accountData.balance)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">Authoritative Credits</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
          <span className="text-[10px] uppercase font-mono text-slate-500 block">Overdraft Policy</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-bold font-mono text-slate-900">
              Strictly Zero (Disabled)
            </span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Deficit Incurrence Prohibited</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
          <span className="text-[10px] uppercase font-mono text-slate-500 block">Active Credit Pools</span>
          <span className="text-xl font-bold font-mono text-[#2f68ff]">
            {pools.length}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">Isolated Buckets</span>
        </div>
      </div>

      {/* Credit Pools Strip */}
      {pools.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#2f68ff]" /> Active Credit Pools
            </h4>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#e8ecf4] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#e8ecf4] bg-[#f8fafc] text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-3">Pool ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Balance</th>
                  <th className="py-2.5 px-3">Expires At</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8ecf4]">
                {pools.map((p) => (
                  <tr key={p.id} className="hover:bg-[#f8fafc]/60 transition">
                    <td className="py-2.5 px-3 font-mono text-[#2f68ff]">
                      {truncateId(p.id, 8, 4)}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={p.poolType} />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatNumber(p.balance)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {p.expiresAt ? formatDateTime(p.expiresAt) : 'Indefinite'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Link to={`/billing/pools/${p.id}`}>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-[#2f68ff]">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateBillingRequestModal
        isOpen={isGrantModalOpen}
        onClose={() => setIsGrantModalOpen(false)}
        defaultAccountId={accountId}
      />
    </div>
  );
};
