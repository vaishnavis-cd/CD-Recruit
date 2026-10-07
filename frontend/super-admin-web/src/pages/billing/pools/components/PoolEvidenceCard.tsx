import React from 'react';
import { ShieldCheck, FileText, UserCheck, Tag } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { truncateId } from '@/lib/utils';
import type { CreditPoolDetail } from '@/lib/api/billing/types';

interface PoolEvidenceCardProps {
  pool: CreditPoolDetail;
}

export const PoolEvidenceCard: React.FC<PoolEvidenceCardProps> = ({ pool }) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-400" /> Commercial Proof & Evidence
        </CardTitle>
        <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
          SOX Invariant
        </span>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex justify-between py-1.5 border-b border-slate-800/80">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-slate-500" /> Grant Reason / Category
          </span>
          <span className="font-medium text-slate-200">
            {pool.reason || 'Contractual purchase or allocation'}
          </span>
        </div>

        <div className="flex justify-between py-1.5 border-b border-slate-800/80">
          <span className="text-slate-400 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-500" /> Contract / Invoice Ref
          </span>
          <span className="font-mono text-indigo-400">
            {pool.ticketRef || pool.contractRef || 'N/A (Standard)'}
          </span>
        </div>

        <div className="flex justify-between py-1.5">
          <span className="text-slate-400 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-slate-500" /> Created By Staff
          </span>
          <span className="font-mono text-slate-300">
            {pool.createdBy ? truncateId(pool.createdBy, 8, 4) : 'System Engine'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
