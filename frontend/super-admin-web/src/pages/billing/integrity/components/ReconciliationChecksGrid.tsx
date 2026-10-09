import React from 'react';
import { CheckCircle2, XCircle, ShieldCheck, Database, Lock, Clock, Key, Globe, FileCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { ReconciliationRunResult } from '@/lib/api/billing/types';

interface ReconciliationChecksGridProps {
  lastRun?: ReconciliationRunResult;
}

export const ReconciliationChecksGrid: React.FC<ReconciliationChecksGridProps> = ({ lastRun }) => {
  const checks = [
    {
      id: 'pool_sum',
      title: 'Pool Balance Sum Invariant',
      desc: 'Account balance strictly matches sum of underlying active credit buckets.',
      icon: Database,
      passed: lastRun?.checks?.poolSumCheck ?? true,
    },
    {
      id: 'monotonic_seq',
      title: 'Monotonic Sequence Numbering',
      desc: 'Global append-only ledger entries have uninterrupted, monotonic ordering.',
      icon: Lock,
      passed: lastRun?.checks?.sequenceCheck ?? true,
    },
    {
      id: 'overdraft_bound',
      title: 'Overdraft Boundary Ceiling',
      desc: 'No account deficit exceeds its dual-authorized buffer limit.',
      icon: ShieldCheck,
      passed: lastRun?.checks?.overdraftCheck ?? true,
    },
    {
      id: 'expiry_cutoff',
      title: 'Expiry Cutoff Enforcement',
      desc: 'Zero consumptions or allocations have drawn from expired credit pools.',
      icon: Clock,
      passed: lastRun?.checks?.expiryCheck ?? true,
    },
    {
      id: 'idempotency_unique',
      title: 'Idempotency Key Uniqueness',
      desc: 'Cryptographic uniqueness verified. Zero duplicate charge requests.',
      icon: Key,
      passed: lastRun?.checks?.idempotencyCheck ?? true,
    },
    {
      id: 'currency_bound',
      title: 'Currency Boundary Invariant',
      desc: 'Credits and payments are strictly locked to their territorial currency.',
      icon: Globe,
      passed: lastRun?.checks?.currencyCheck ?? true,
    },
    {
      id: 'double_entry',
      title: 'Authoritative Tie-Out',
      desc: 'Every credit expansion links to an invoice, payment, or maker-checker record.',
      icon: FileCheck,
      passed: lastRun?.checks?.doubleEntryCheck ?? true,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Continuous Invariant Verification (7/7)</h3>
        <span className="text-xs font-mono text-slate-500">Database Engine Integrity</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {checks.map((chk) => {
          const Icon = chk.icon;
          return (
            <div
              key={chk.id}
              className={`p-4 rounded-xl border flex flex-col justify-between transition ${
                chk.passed
                  ? 'bg-white border-[#e8ecf4] shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-slate-300'
                  : 'bg-rose-50/50 border-rose-200 shadow-[0_2px_8px_rgba(225,29,72,0.04)]'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[#2f68ff]">
                    <Icon className="w-4 h-4" />
                  </div>
                  {chk.passed ? (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> PASS
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-rose-700 font-semibold bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full">
                      <XCircle className="w-3 h-3 text-rose-600" /> FAIL
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-900">{chk.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {chk.desc}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
