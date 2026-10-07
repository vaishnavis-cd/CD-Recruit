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

    try {
      setError(null);
      await extendMutation.mutateAsync({
        poolId: pool.id,
        newExpiryDate: new Date(newExpiryDate).toISOString(),
        reason: reason.trim(),
        ticketRef: ticketRef.trim() || undefined,
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
            Submit an expiration extension for bucket <span className="font-mono text-indigo-400 font-semibold">{pool.id.slice(0, 8)}...</span>.
            Under maker-checker governance, adjustments require dual authorization before applying.
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
              New Expiration Cutoff (UTC) <span className="text-red-400">*</span>
            </label>
            <Input
              type="datetime-local"
              value={newExpiryDate}
              onChange={(e) => setNewExpiryDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Business Justification <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="State reason for customer grace extension or contractual amendment (min 10 characters)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Support Incident / Contract Amendment Ref
            </label>
            <Input
              value={ticketRef}
              onChange={(e) => setTicketRef(e.target.value)}
              placeholder="e.g. CR-9012"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} type="button" disabled={extendMutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={extendMutation.isPending}>
            Submit Extension
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
