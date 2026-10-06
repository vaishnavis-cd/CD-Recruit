import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ShieldAlert, Coins } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { formatNumber, truncateId } from '@/lib/utils';
import type { BillingAccountListItem } from '@/lib/api/billing/types';

interface AccountRowProps {
  account: BillingAccountListItem;
  onAdjustOverdraft?: (account: BillingAccountListItem) => void;
}

export const AccountRow: React.FC<AccountRowProps> = ({ account, onAdjustOverdraft }) => {
  const isOverdrawn = account.balance < 0;

  return (
    <tr className="hover:bg-slate-900/50 transition-colors group">
      <td className="py-4 px-4">
        <Link
          to={`/billing/accounts/${account.id}`}
          className="font-mono text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1.5"
        >
          {truncateId(account.id, 10, 6)}
          <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </td>

      <td className="py-4 px-4">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-slate-200">
            {account.organizations?.[0]?.name || 'Primary Org'}
          </span>
          {account.organizations && account.organizations.length > 1 && (
            <span className="text-[10px] text-slate-500 font-medium">
              +{account.organizations.length - 1} linked orgs
            </span>
          )}
        </div>
      </td>

      <td className="py-4 px-4">
        <StatusBadge status={account.status} />
      </td>

      <td className="py-4 px-4 font-mono text-xs font-semibold text-slate-300">
        {account.currency}
      </td>

      <td className="py-4 px-4 text-right">
        <div className="flex items-center justify-end gap-1 font-mono text-xs font-bold">
          <span className={isOverdrawn ? 'text-red-400' : 'text-emerald-400'}>
            {formatNumber(account.balance)}
          </span>
          <Coins className="w-3.5 h-3.5 text-slate-500" />
        </div>
      </td>

      <td className="py-4 px-4 text-right font-mono text-xs text-slate-400">
        {formatNumber(account.overdraftLimit)}
      </td>

      <td className="py-4 px-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {onAdjustOverdraft && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAdjustOverdraft(account)}
              className="text-[11px] h-7 px-2"
            >
              Overdraft
            </Button>
          )}
          <Link to={`/billing/accounts/${account.id}`}>
            <Button size="sm" variant="ghost" className="text-[11px] h-7 px-2">
              View
            </Button>
          </Link>
        </div>
      </td>
    </tr>
  );
};
