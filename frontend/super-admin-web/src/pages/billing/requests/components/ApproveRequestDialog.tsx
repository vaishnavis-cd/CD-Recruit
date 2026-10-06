import React from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApproveBillingRequestMutation } from '@/hooks/billing/useBilling';
import { formatNumber, formatDateTime, truncateId } from '@/lib/utils';
import type { ManualBillingRequestItem } from '@/lib/api/billing/types';

interface ApproveRequestDialogProps {
  request: ManualBillingRequestItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ApproveRequestDialog: React.FC<ApproveRequestDialogProps> = ({
  request,
  isOpen,
  onClose,
}) => {
  const approveMutation = useApproveBillingRequestMutation();

  if (!request) return null;

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync(request.id);
      onClose();
    } catch {
      // Handled by toast in hook
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Dual Authorization Approval</DialogTitle>
        <DialogDescription>
          Verify the commercial impact before executing this ledger adjustment.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4 text-xs">
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Request Type</span>
            <StatusBadge status={request.requestType} />
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-400">Target Billing Account</span>
            <span className="font-mono text-indigo-400 font-semibold">
              {truncateId(request.billingAccountId, 10, 6)}
            </span>
          </div>

          {request.amount !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Credit Delta</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                +{formatNumber(request.amount)} Credits
              </span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-slate-400">Requester</span>
            <span className="font-mono text-slate-300">
              {truncateId(request.requestedBy, 8, 4)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-400">Submitted At</span>
            <span className="text-slate-300">
              {formatDateTime(request.createdAt)}
            </span>
          </div>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
          <span className="text-slate-400 block font-semibold">Business Justification</span>
          <p className="text-slate-200 italic">{request.reason}</p>
          {request.ticketRef && (
            <p className="text-[11px] text-indigo-300 font-mono mt-1">Ticket: {request.ticketRef}</p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={approveMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="success"
          onClick={handleApprove}
          isLoading={approveMutation.isPending}
        >
          Approve & Execute Ledger
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
