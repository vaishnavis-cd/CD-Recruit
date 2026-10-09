import React, { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { usePublishPriceBookMutation } from '@/hooks/billing/useBilling';

interface PublishPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCurrency?: string;
}

export const PublishPriceModal: React.FC<PublishPriceModalProps> = ({
  isOpen,
  onClose,
  defaultCurrency = 'INR',
}) => {
  const [currency, setCurrency] = useState(defaultCurrency);
  const [tierName, setTierName] = useState('STARTER');
  const [unitRateMajor, setUnitRateMajor] = useState('100');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const publishMutation = usePublishPriceBookMutation();

  React.useEffect(() => {
    if (defaultCurrency) {
      setCurrency(defaultCurrency);
    }
  }, [defaultCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = parseFloat(unitRateMajor);
    if (isNaN(rateNum) || rateNum <= 0) {
      setError('Unit rate must be a positive number');
      return;
    }
    if (!effectiveFrom) {
      setError('Effective commencement date is required');
      return;
    }

    try {
      setError(null);
      await publishMutation.mutateAsync({
        currency,
        tierName,
        unitRateMinor: Math.round(rateNum * 100),
        effectiveFrom: new Date(effectiveFrom).toISOString(),
        reason: reason.trim() || undefined,
      });
      onClose();
      setUnitRateMajor('100');
      setEffectiveFrom('');
      setReason('');
    } catch (err: any) {
      setError(err?.message || 'Failed to publish price schedule');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Publish Commercial Pricing Revision</DialogTitle>
          <DialogDescription>
            Publish a forward-looking price book schedule. Historical contracts will retain their pegged rates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Currency <span className="text-rose-500">*</span>
              </label>
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={[
                  { value: 'INR', label: 'INR (₹)' },
                  { value: 'USD', label: 'USD ($)' },
                  { value: 'MYR', label: 'MYR (RM)' },
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tier / SKU <span className="text-rose-500">*</span>
              </label>
              <Select
                value={tierName}
                onChange={(e) => setTierName(e.target.value)}
                options={[
                  { value: 'STARTER', label: 'STARTER' },
                  { value: 'GROWTH', label: 'GROWTH' },
                  { value: 'ENTERPRISE', label: 'ENTERPRISE' },
                  { value: 'PROCTOR_AI', label: 'PROCTOR_AI (Add-on)' },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Rate Per Unit ({currency}) <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={unitRateMajor}
                onChange={(e) => setUnitRateMajor(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Effective Date <span className="text-rose-500">*</span>
              </label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Revision Notes / Indexation Justification
            </label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Q4 2026 inflation and cloud infrastructure rebalancing"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} type="button" disabled={publishMutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={publishMutation.isPending}>
            Publish Revision
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
