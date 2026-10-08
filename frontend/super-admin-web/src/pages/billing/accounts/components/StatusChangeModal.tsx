import React, { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { useUpdateAccountStatusMutation } from '@/hooks/billing/useBilling';
import type { BillingAccountDetail } from '@/lib/api/billing/types';

interface StatusChangeModalProps {
  account: BillingAccountDetail | null;
  isOpen: boolean;
  onClose: () => void;
}

export const StatusChangeModal: React.FC<StatusChangeModalProps> = ({ account, isOpen, onClose }) => {
  const [status, setStatus] = useState<string>('ACTIVE');
  const [reason, setReason] = useState('');
  const [ticketRef, setTicketRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  const statusMutation = useUpdateAccountStatusMutation();

  React.useEffect(() => {
    if (account) {
      setStatus(account.status);
    }
  }, [account]);

  if (!account) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setError('A formal justification of at least 10 characters is required for regulatory and audit tracking.');
      return;
    }

    const trimmedTicket = ticketRef.trim();
    if (!trimmedTicket) {
      setError('Incident or Ticket reference (e.g. SEC-4410, COMP-102) is mandatory for maker-checker tracking.');
      return;
    }
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(trimmedTicket)) {
      setError('Ticket Reference must be 3-64 alphanumeric characters, underscores, or dashes (e.g. SEC-4410).');
      return;
    }

    try {
      setError(null);
      await statusMutation.mutateAsync({
        accountId: account.id,
        status: status as any,
        reason: reason.trim(),
        ticketRef: trimmedTicket,
      });
      onClose();
      setReason('');
      setTicketRef('');
    } catch (err: any) {
      setError(err?.message || 'Failed to submit status change request');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Request Account Operating Status Change</DialogTitle>
          <DialogDescription>
            Submit an operational status change for account <span className="font-mono text-[#2f68ff] font-semibold">{account.id.slice(0, 8)}...</span> into the Maker-Checker authorization queue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="p-3 bg-[#fef3f2] border border-[#fecdca] rounded-xl text-xs text-[#f04438]">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Target Status <span className="text-[#f04438]">*</span>
            </label>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: 'ACTIVE', label: 'ACTIVE (Fully operational, draws credits)' },
                { value: 'RESTRICTED', label: 'RESTRICTED (Slow-path hold, reads allowed)' },
                { value: 'SUSPENDED', label: 'SUSPENDED (All assessments & candidate tests blocked)' },
              ]}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Incident or Ticket Reference <span className="text-[#f04438]">*</span>
            </label>
            <Input
              value={ticketRef}
              onChange={(e) => setTicketRef(e.target.value)}
              placeholder="e.g. SEC-4410"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Must be 3-64 alphanumeric characters, underscores, or dashes.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Operational Justification <span className="text-[#f04438]">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="State the regulatory or operational cause for this status change (min 10 characters)..."
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white transition resize-none"
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} type="button" disabled={statusMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={statusMutation.isPending}
          >
            Submit For Review
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
