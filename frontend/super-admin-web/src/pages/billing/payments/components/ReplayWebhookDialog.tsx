import React from 'react';
import { RotateCw } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useReplayWebhookMutation } from '@/hooks/billing/useBilling';

interface ReplayWebhookDialogProps {
  webhookId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReplayWebhookDialog: React.FC<ReplayWebhookDialogProps> = ({
  webhookId,
  isOpen,
  onClose,
}) => {
  const replayMutation = useReplayWebhookMutation();

  if (!webhookId) return null;

  const handleReplay = async () => {
    try {
      await replayMutation.mutateAsync(webhookId);
      onClose();
    } catch {
      // Handled by toast in hook
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Replay Payment Webhook</DialogTitle>
        <DialogDescription>
          Re-deliver inbound webhook delivery <span className="font-mono text-[#2f68ff] font-semibold">{webhookId}</span> into the idempotent payment processing queue.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 text-xs text-slate-600 space-y-2">
        <p>
          Replaying will re-execute signature validation, idempotency key checks, and ledger credit allocation.
          Duplicate entries will be cleanly skipped by the database unique constraints.
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
