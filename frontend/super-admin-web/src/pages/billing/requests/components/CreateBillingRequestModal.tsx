import React, { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreateManualBillingRequestMutation } from '@/hooks/billing/useBilling';

interface CreateBillingRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAccountId?: string;
}

export const CreateBillingRequestModal: React.FC<CreateBillingRequestModalProps> = ({
  isOpen,
  onClose,
  defaultAccountId = '',
}) => {
  const [billingAccountId, setBillingAccountId] = useState(defaultAccountId);
  const [requestType, setRequestType] = useState<'GRANT' | 'ADJUST' | 'REFUND' | 'EXPIRY_EXTEND' | 'ACCOUNT_STATUS'>('GRANT');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [ticketRef, setTicketRef] = useState('');
  const [targetStatus, setTargetStatus] = useState('ACTIVE');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateManualBillingRequestMutation();

  React.useEffect(() => {
    if (defaultAccountId) {
      setBillingAccountId(defaultAccountId);
    }
  }, [defaultAccountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingAccountId.trim()) {
      setError('Billing Account ID is required');
      return;
    }
    if (reason.trim().length < 10) {
      setError('A business justification (minimum 10 characters) is required for maker-checker tracking.');
      return;
    }

    const trimmedTicket = ticketRef.trim();
    if (!trimmedTicket) {
      setError('A formal Ticket Reference (e.g. JIRA-402, SEC-810) is mandatory for maker-checker tracking.');
      return;
    }
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(trimmedTicket)) {
      setError('Ticket Reference must be 3-64 alphanumeric characters, underscores, or dashes (e.g. JIRA-402).');
      return;
    }

    let payload: Record<string, any> = {};
    if (['GRANT', 'ADJUST', 'REFUND'].includes(requestType)) {
      const parsedAmount = parseInt(amount, 10);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setError('A positive credit amount is required for this action.');
        return;
      }
      payload = { amount: parsedAmount, credits: parsedAmount };
    } else if (requestType === 'ACCOUNT_STATUS') {
      payload = { status: targetStatus };
    }

    try {
      setError(null);
      await createMutation.mutateAsync({
        billingAccountId: billingAccountId.trim(),
        requestType,
        payload,
        reason: reason.trim(),
        ticketRef: trimmedTicket,
      });
      onClose();
      setAmount('');
      setReason('');
      setTicketRef('');
    } catch (err: any) {
      setError(err?.message || 'Failed to submit billing request');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>File Commercial Billing Request</DialogTitle>
          <DialogDescription>
            Submit a financial action into the Maker-Checker authorization queue for dual review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Billing Account ID <span className="text-rose-500">*</span>
            </label>
            <Input
              value={billingAccountId}
              onChange={(e) => setBillingAccountId(e.target.value)}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Action Type <span className="text-rose-500">*</span>
              </label>
              <Select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as any)}
                options={[
                  { value: 'GRANT', label: 'GRANT (Goodwill / Promo)' },
                  { value: 'ADJUST', label: 'ADJUST (Credit Correction)' },
                  { value: 'REFUND', label: 'REFUND (Credit Return)' },
                  { value: 'EXPIRY_EXTEND', label: 'EXPIRY_EXTEND (Validity)' },
                  { value: 'ACCOUNT_STATUS', label: 'ACCOUNT_STATUS (Standing)' },
                ]}
              />
            </div>

            {requestType === 'ACCOUNT_STATUS' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Target Status <span className="text-rose-500">*</span>
                </label>
                <Select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  options={[
                    { value: 'ACTIVE', label: 'ACTIVE' },
                    { value: 'RESTRICTED', label: 'RESTRICTED' },
                    { value: 'SUSPENDED', label: 'SUSPENDED' },
                  ]}
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Amount (Credits)
                </label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 1000"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Customer Support Ticket / Zendesk / Jira Ref <span className="text-rose-500">*</span>
            </label>
            <Input
              value={ticketRef}
              onChange={(e) => setTicketRef(e.target.value)}
              placeholder="e.g. JIRA-5421"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Must be alphanumeric with optional dashes/underscores (3-64 characters).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Business Justification <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="State clear operational reason and impact (min 10 characters)..."
              className="w-full bg-slate-50/50 border border-[#e8ecf4] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2f68ff]/20 focus:border-[#2f68ff] transition resize-none placeholder:text-slate-400"
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} type="button" disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={createMutation.isPending}>
            Submit For Review
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
