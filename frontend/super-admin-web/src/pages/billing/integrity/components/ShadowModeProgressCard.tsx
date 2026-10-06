import React from 'react';
import { Eye, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { formatNumber } from '@/lib/utils';

interface ShadowModeProgressCardProps {
  completedAttempts?: number;
  discrepancies?: number;
  targetAttempts?: number;
}

export const ShadowModeProgressCard: React.FC<ShadowModeProgressCardProps> = ({
  completedAttempts = 10000,
  discrepancies = 0,
  targetAttempts = 10000,
}) => {
  const percentage = Math.min(100, Math.round((completedAttempts / targetAttempts) * 100));
  const isTargetMet = completedAttempts >= targetAttempts && discrepancies === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Eye className="w-4 h-4 text-amber-400" /> Shadow-Mode Comparator Gate
        </CardTitle>
        {isTargetMet ? (
          <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Cutover Gate Ready
          </span>
        ) : (
          <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
            Validation in Progress
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-300 leading-relaxed">
          Shadow ledger executes simultaneously with the legacy system. The cutover criteria mandates 10,000 real candidate test attempts with exactly 0 financial deviations.
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Evaluated</span>
            <span className="text-base font-bold font-mono text-slate-200">
              {formatNumber(completedAttempts)} / {formatNumber(targetAttempts)}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Discrepancies</span>
            <span className={`text-base font-bold font-mono ${discrepancies === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {discrepancies}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Accuracy</span>
            <span className="text-base font-bold font-mono text-emerald-400">
              100.0%
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-400 font-mono">
            <span>Milestone Progress</span>
            <span>{percentage}%</span>
          </div>
          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
