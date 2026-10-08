import React from 'react';
import { ArrowLeft, Coins, Sliders } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { formatNumber } from '@/lib/utils';
import type { BillingAccountDetail } from '@/lib/api/billing/types';

interface AccountDetailHeaderProps {
  account: BillingAccountDetail;
  onOpenOverdraft: () => void;
  onOpenStatusModal: () => void;
  canManage: boolean;
}

export const AccountDetailHeader: React.FC<AccountDetailHeaderProps> = ({
  account,
  onOpenOverdraft,
  onOpenStatusModal,
  canManage,
}) => {
  const isOverdrawn = account.balance < 0;

  return (
    <div className="space-y-4">
      <Link
        to="/billing/accounts"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition font-medium"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Accounts Directory
      </Link>

      <div className="bg-white border border-[#e8ecf4] rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 font-mono tracking-tight">
              {account.id}
            </h1>
            <StatusBadge status={account.status} dot />
            <span className="font-mono text-xs px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200 font-bold">
              {account.currency}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Created on {new Date(account.createdAt).toLocaleDateString()} • {account.organizations?.length || 0} Connected Organizations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-6 px-4 py-2.5 bg-[#f8fafc] rounded-xl border border-[#e8ecf4]">
            <div>
              <span className="text-[10px] uppercase font-mono text-slate-500 block">Available Balance</span>
              <span className={`text-base font-bold font-mono ${isOverdrawn ? 'text-[#f04438]' : 'text-[#12b76a]'}`}>
                {formatNumber(account.balance)} Credits
              </span>
            </div>

            <div className="w-px h-8 bg-[#e2e8f0]" />

            <div>
              <span className="text-[10px] uppercase font-mono text-slate-500 block">Overdraft Buffer</span>
              <span className="text-base font-bold font-mono text-slate-900">
                {formatNumber(account.overdraftLimit)} Credits
              </span>
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onOpenOverdraft} icon={Coins}>
                Adjust Buffer
              </Button>
              <Button size="sm" variant="secondary" onClick={onOpenStatusModal} icon={Sliders}>
                Change Status
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
