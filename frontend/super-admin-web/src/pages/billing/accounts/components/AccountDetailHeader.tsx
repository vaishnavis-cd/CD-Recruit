import React from 'react';
import { ArrowLeft, Coins, ShieldAlert, Sliders } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { formatNumber, truncateId } from '@/lib/utils';
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
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition font-medium"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Accounts Directory
      </Link>

      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-white font-mono tracking-tight">
              {account.id}
            </h1>
            <StatusBadge status={account.status} />
            <span className="font-mono text-xs px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg border border-slate-700 font-bold">
              {account.currency}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Created on {new Date(account.createdAt).toLocaleDateString()} • {account.organizations?.length || 0} Connected Organizations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-6 px-4 py-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80">
            <div>
              <span className="text-[10px] uppercase font-mono text-slate-500 block">Available Balance</span>
              <span className={`text-base font-bold font-mono ${isOverdrawn ? 'text-red-400' : 'text-emerald-400'}`}>
                {formatNumber(account.balance)} Credits
              </span>
            </div>

            <div className="w-px h-8 bg-slate-800" />

            <div>
              <span className="text-[10px] uppercase font-mono text-slate-500 block">Overdraft Buffer</span>
              <span className="text-base font-bold font-mono text-slate-300">
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
