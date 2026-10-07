import React, { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useRequestOverdraftLimitMutation } from '@/hooks/billing/useBilling';
import { formatNumber } from '@/lib/utils';
import type { BillingAccountListItem } from '@/lib/api/billing/types';

interface OverdraftModalProps {
  account: BillingAccountListItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OverdraftModal: React.FC<OverdraftModalProps> = ({ account, isOpen, onClose }) => {
  const [newLimit, setNewLimit] = useState('');
  const [reason, setReason] = useState('');
  const [ticketRef, setTicketRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  const overdraftMutation = useRequestOverdraftLimitMutation();

  if (!account) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const limitNum = parseInt(newLimit, 10);
    if (isNaN(limitNum) || limitNum < 0) {
      setError('Please provide a valid overdraft limit >= 0');
      return;
    }
    if (reason.trim().length < 10) {
      setError('A formal business reason (minimum 10 characters) is required for governance audit');
      return;
    }

    try {
      setError(null);
      await overdraftMutation.mutateAsync({
        accountId: account.id,
        newLimit: limitNum,
        reason: reason.trim(),
        ticketRef: ticketRef.trim() || undefined,
      });
      onClose();
      setNewLimit('');
      setReason('');
      setTicketRef('');
    } catch (err: any) {
      setError(err?.message || 'Failed to submit overdraft limit adjustment');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Adjust Overdraft Buffer</DialogTitle>
          <DialogDescription>
            Submit an overdraft limit change for account <span className="font-mono text-indigo-400 font-semibold">{account.id.slice(0, 8)}...</span>.
            Under maker-checker governance, adjustments require dual authorization before applying.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800/80 flex justify-between text-xs">
            <span className="text-slate-400">Current Overdraft Limit:</span>
            <span className="font-mono font-bold text-slate-200">
              {formatNumber(account.overdraftLimit)} Credits
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              New Overdraft Limit (Credits) <span className="text-red-400">*</span>
            </label>
            <Input
              type="number"
              min="0"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder="e.g. 5000"
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
              placeholder="Provide reason for risk/credit expansion (min 10 characters)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Support Ticket / Jira Reference (Optional)
            </label>
            <Input
              value={ticketRef}
              onChange={(e) => setTicketRef(e.target.value)}
              placeholder="e.g. FIN-1049"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} type="button" disabled={overdraftMutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={overdraftMutation.isPending}>
            Submit For Approval
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
