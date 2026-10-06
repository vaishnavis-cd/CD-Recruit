import React, { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useRejectBillingRequestMutation } from '@/hooks/billing/useBilling';
import type { ManualBillingRequestItem } from '@/lib/api/billing/types';

interface RejectRequestDialogProps {
  request: ManualBillingRequestItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RejectRequestDialog: React.FC<RejectRequestDialogProps> = ({
  request,
  isOpen,
  onClose,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rejectMutation = useRejectBillingRequestMutation();

  if (!request) return null;

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setError('A formal rejection reason (minimum 10 characters) is required for audit trail tracking.');
      return;
    }

    try {
      setError(null);
      await rejectMutation.mutateAsync({
        requestId: request.id,
        reason: reason.trim(),
      });
      onClose();
      setReason('');
    } catch (err: any) {
      setError(err?.message || 'Failed to reject billing request');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleReject}>
        <DialogHeader>
          <DialogTitle>Reject Ledger Request</DialogTitle>
          <DialogDescription>
            Decline request <span className="font-mono text-indigo-400 font-semibold">{request.id.slice(0, 8)}...</span>.
            The audit record will mark this as rejected and prevent execution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Rejection Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="State governance or commercial grounds for declining (min 10 characters)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-red-500 transition resize-none"
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} type="button" disabled={rejectMutation.isPending}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" isLoading={rejectMutation.isPending}>
            Confirm Rejection
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
