import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useReplayWebhookMutation } from '@/hooks/billing/useBilling';

interface ReplayWebhookDialogProps {
  webhookId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReplayWebhookDialog: React.FC<ReplayWebhookDialogProps> = ({
  webhookId: initialWebhookId = '',
  isOpen,
  onClose,
}) => {
  const [eventId, setEventId] = useState(initialWebhookId || '');
  const [error, setError] = useState<string | null>(null);
  const replayMutation = useReplayWebhookMutation();

  React.useEffect(() => {
    if (initialWebhookId) {
      setEventId(initialWebhookId);
    }
  }, [initialWebhookId]);

  const handleReplay = async () => {
    const trimmed = eventId.trim();
    if (!trimmed) {
      setError('A valid Gateway Event ID or Inbox Event ID is required');
      return;
    }

    try {
      setError(null);
      await replayMutation.mutateAsync(trimmed);
      onClose();
      setEventId('');
    } catch (err: any) {
      setError(err?.message || 'Failed to trigger webhook replay');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Replay Gateway Payment Webhook</DialogTitle>
        <DialogDescription>
          Re-deliver an inbound payment gateway event (API-H2-19) into the idempotent payment processing queue.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Gateway Event / Delivery ID <span className="text-rose-500">*</span>
          </label>
          <Input
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="e.g. evt_3Nk1X2... or pay_29aBc1..."
            required
          />
        </div>

        <p className="text-xs text-slate-500">
          Replaying will re-execute cryptographic signature validation, idempotency key verification, and ledger credit allocation. Duplicate events are safely skipped.
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={replayMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleReplay}
          isLoading={replayMutation.isPending}
          icon={RotateCw}
        >
          Confirm Replay
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
