import React, { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreateBillingAccountMutation } from '@/hooks/billing/useBilling';

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateAccountModal: React.FC<CreateAccountModalProps> = ({ isOpen, onClose }) => {
  const [tenantId, setTenantId] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [overdraftLimit, setOverdraftLimit] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateBillingAccountMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId.trim()) {
      setError('Tenant ID or Organization ID is required');
      return;
    }

    try {
      setError(null);
      await createMutation.mutateAsync({
        tenantId: tenantId.trim(),
        currency,
        overdraftLimit: parseInt(overdraftLimit, 10) || 0,
      });
      onClose();
      setTenantId('');
      setCurrency('INR');
      setOverdraftLimit('0');
    } catch (err: any) {
      setError(err?.message || 'Failed to create billing account');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Create New Billing Account</DialogTitle>
          <DialogDescription>
            Provision an authoritative commercial account and ledger for an organization.
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
              Tenant / Organization UUID <span className="text-red-400">*</span>
            </label>
            <Input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Currency <span className="text-red-400">*</span>
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
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Initial Overdraft Limit
              </label>
              <Input
                type="number"
                min="0"
                value={overdraftLimit}
                onChange={(e) => setOverdraftLimit(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} type="button" disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={createMutation.isPending}>
            Create Account
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
