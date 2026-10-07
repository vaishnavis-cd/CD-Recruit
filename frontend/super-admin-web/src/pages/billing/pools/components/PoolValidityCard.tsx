import React from 'react';
import { Calendar, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/utils';
import type { CreditPoolDetail } from '@/lib/api/billing/types';

interface PoolValidityCardProps {
  pool: CreditPoolDetail;
  onOpenExtendModal: () => void;
  canExtend: boolean;
}

export const PoolValidityCard: React.FC<PoolValidityCardProps> = ({
  pool,
  onOpenExtendModal,
  canExtend,
}) => {
  const now = Date.now();
  const expiresAtMs = pool.expiresAt ? new Date(pool.expiresAt).getTime() : null;
  const isExpired = expiresAtMs !== null && expiresAtMs < now;
  const daysRemaining = expiresAtMs !== null ? Math.ceil((expiresAtMs - now) / (1000 * 60 * 60 * 24)) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-400" /> Validity & Horizon
        </CardTitle>
        {pool.expiresAt ? (
          isExpired ? (
            <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> Expired
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> {daysRemaining} Days Left
            </span>
          )
        ) : (
          <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
            Indefinite
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-xs">
          <div className="flex justify-between py-1.5 border-b border-slate-800/80">
            <span className="text-slate-400">Granted On</span>
            <span className="font-mono text-slate-200">{formatDateTime(pool.createdAt)}</span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-slate-800/80">
            <span className="text-slate-400">Expiration Cutoff</span>
            <span className="font-mono text-slate-200">
              {pool.expiresAt ? formatDateTime(pool.expiresAt) : 'No Expiry Set'}
            </span>
          </div>

          <div className="flex justify-between py-1.5">
            <span className="text-slate-400">Drawdown Priority</span>
            <span className="font-mono text-indigo-400 font-semibold">
              {pool.priorityTier ?? 'Expiring First'}
            </span>
          </div>
        </div>

        {canExtend && (
          <div className="pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenExtendModal}
              className="w-full text-xs"
              icon={Clock}
            >
              Extend Expiry Date
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
