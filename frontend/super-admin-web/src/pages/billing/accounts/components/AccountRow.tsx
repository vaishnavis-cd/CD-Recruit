import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Coins } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { formatNumber, truncateId } from '@/lib/utils';
import type { BillingAccountListItem } from '@/lib/api/billing/types';

interface AccountRowProps {
  account: BillingAccountListItem;
}

export const AccountRow: React.FC<AccountRowProps> = ({ account }) => {
  const isOverdrawn = account.balance < 0;

  return (
    <tr className="hover:bg-[#f8fafc]/70 transition-colors group">
      <td className="py-4 px-4">
        <Link
          to={`/billing/accounts/${account.id}`}
          className="font-mono text-xs font-semibold text-[#2f68ff] hover:text-[#2557db] transition flex items-center gap-1.5"
        >
          {truncateId(account.id, 10, 6)}
          <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </td>

      <td className="py-4 px-4">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-slate-900">
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
        <StatusBadge status={account.status} dot />
      </td>

      <td className="py-4 px-4 font-mono text-xs font-semibold text-slate-700">
        {account.currency}
      </td>

      <td className="py-4 px-4 text-right">
        <div className="flex items-center justify-end gap-1 font-mono text-xs font-bold">
          <span className={isOverdrawn ? 'text-[#f04438]' : 'text-[#12b76a]'}>
            {formatNumber(account.balance)}
          </span>
          <Coins className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </td>

      <td className="py-4 px-4 text-right font-mono text-xs text-slate-500">
        0 (Disabled)
      </td>

      <td className="py-4 px-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <Link to={`/billing/accounts/${account.id}`}>
            <Button size="sm" variant="ghost" className="text-[11px] h-7 px-2.5 text-[#2f68ff]">
              View
            </Button>
          </Link>
        </div>
      </td>
    </tr>
  );
};
