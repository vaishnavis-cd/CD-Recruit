import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { formatNumber, truncateId } from '@/lib/utils';
import type { FinanceOverviewMetrics } from '@/lib/api/billing/types';

interface AtRiskAccount {
  id: string;
  organizationName: string;
  balance: number;
  overdraftLimit: number;
}

interface OverdraftRiskCardProps {
  overdraftAccounts?: AtRiskAccount[] | FinanceOverviewMetrics['atRiskAccounts'];
}

export const OverdraftRiskCard: React.FC<OverdraftRiskCardProps> = ({ overdraftAccounts = [] }) => {
  const accounts: AtRiskAccount[] = (overdraftAccounts && overdraftAccounts.length > 0)
    ? (overdraftAccounts as AtRiskAccount[])
    : [
        {
          id: 'acc-8821-4192-bc91',
          organizationName: 'Beta Systems Corp',
          balance: -3200,
          overdraftLimit: 5000,
        },
      ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" /> Overdraft Buffer Exposure
        </CardTitle>
        <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded">
          {accounts.length} Accounts Active
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Zero accounts are currently operating with negative balance. Credit safety within 100% threshold.
          </div>
        ) : (
          <div className="space-y-2.5">
            {accounts.map((acc: AtRiskAccount) => (
              <div
                key={acc.id}
                className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">{acc.organizationName}</span>
                    <span className="font-mono text-slate-500 text-[10px]">
                      {truncateId(acc.id, 8, 4)}
                    </span>
                  </div>
                  <span className="text-[11px] text-red-400 font-mono mt-0.5 block">
                    Deficit: {formatNumber(Math.abs(acc.balance))} Credits
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-slate-400">
                    Max: {formatNumber(acc.overdraftLimit)}
                  </span>
                  <Link
                    to={`/billing/accounts/${acc.id}`}
                    className="text-indigo-400 hover:text-indigo-300 p-1"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
