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
    <Card className="bg-white border-[#e8ecf4]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900">
          <ShieldCheck className="w-4 h-4 text-[#2f68ff]" /> Commercial Proof & Evidence
        </CardTitle>
        <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-bold">
          SOX Invariant
        </span>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex justify-between py-1.5 border-b border-[#e8ecf4]">
          <span className="text-slate-500 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-slate-400" /> Grant Reason / Category
          </span>
          <span className="font-medium text-slate-900">
            {pool.reason || 'Contractual purchase or allocation'}
          </span>
        </div>

        <div className="flex justify-between py-1.5 border-b border-[#e8ecf4]">
          <span className="text-slate-500 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" /> Contract / Invoice Ref
          </span>
          <span className="font-mono text-[#2f68ff] font-semibold">
            {pool.ticketRef || pool.contractRef || 'N/A (Standard)'}
          </span>
        </div>

        <div className="flex justify-between py-1.5">
          <span className="text-slate-500 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-slate-400" /> Created By Staff
          </span>
          <span className="font-mono text-slate-700">
            {pool.createdBy ? truncateId(pool.createdBy, 8, 4) : 'System Engine'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
