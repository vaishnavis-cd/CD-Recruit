import React, { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useExtendPoolExpiryMutation } from '@/hooks/billing/useBilling';
import type { CreditPoolDetail } from '@/lib/api/billing/types';

interface ExtendExpiryModalProps {
  pool: CreditPoolDetail | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExtendExpiryModal: React.FC<ExtendExpiryModalProps> = ({ pool, isOpen, onClose }) => {
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [reason, setReason] = useState('');
  const [ticketRef, setTicketRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  const extendMutation = useExtendPoolExpiryMutation();

  if (!pool) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpiryDate) {
      setError('A valid future expiry cutoff date is required');
      return;
    }
    const expiryTimestamp = new Date(newExpiryDate).getTime();
    if (isNaN(expiryTimestamp) || expiryTimestamp <= Date.now()) {
      setError('New expiry date must be in the future');
      return;
    }
    if (reason.trim().length < 10) {
      setError('A business reason (minimum 10 characters) is required for audit trail tracking');
      return;
    }

    const trimmedTicket = ticketRef.trim();
    if (!trimmedTicket) {
      setError('Ticket or contract reference (e.g. DEAL-402, AMEND-2026) is mandatory for maker-checker tracking.');
      return;
    }
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(trimmedTicket)) {
      setError('Ticket Reference must be 3-64 alphanumeric characters, underscores, or dashes (e.g. DEAL-402).');
      return;
    }

    try {
      setError(null);
      await extendMutation.mutateAsync({
        poolId: pool.id,
        billingAccountId: pool.billingAccountId,
        newExpiryDate: new Date(newExpiryDate).toISOString(),
        reason: reason.trim(),
        ticketRef: trimmedTicket,
      });
      onClose();
      setNewExpiryDate('');
      setReason('');
      setTicketRef('');
    } catch (err: any) {
      setError(err?.message || 'Failed to extend pool expiration');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Extend Pool Expiration Window</DialogTitle>
          <DialogDescription>
            Submit an expiration extension request for bucket <span className="font-mono text-[#2f68ff] font-semibold">{pool.id.slice(0, 8)}...</span> into the Maker-Checker queue.
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
              New Expiration Cutoff (UTC) <span className="text-[#f04438]">*</span>
            </label>
            <Input
              type="datetime-local"
              value={newExpiryDate}
              onChange={(e) => setNewExpiryDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Ticket or Contract Reference <span className="text-[#f04438]">*</span>
            </label>
            <Input
              value={ticketRef}
              onChange={(e) => setTicketRef(e.target.value)}
              placeholder="e.g. DEAL-402 or AMEND-2026"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Must be 3-64 alphanumeric characters, underscores, or dashes.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Business Justification <span className="text-[#f04438]">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="State reason for customer grace extension or contractual amendment (min 10 characters)..."
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white transition resize-none"
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} type="button" disabled={extendMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={extendMutation.isPending}
          >
            Submit for Approval
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
