import React, { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useRecordManualInvoiceMutation } from '@/hooks/billing/useBilling';

interface RecordManualInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecordManualInvoiceModal: React.FC<RecordManualInvoiceModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [billingAccountId, setBillingAccountId] = useState('');
  const [amountMajor, setAmountMajor] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invoiceMutation = useRecordManualInvoiceMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amountMajor);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please provide a positive settlement amount');
      return;
    }
    if (!billingAccountId.trim()) {
      setError('Billing Account ID is required');
      return;
    }
    if (!invoiceNumber.trim()) {
      setError('Invoice number or bank transaction reference is required for audit reconciliation');
      return;
    }

    try {
      setError(null);
      await invoiceMutation.mutateAsync({
        billingAccountId: billingAccountId.trim(),
        amountMinor: Math.round(amountNum * 100),
        currency,
        invoiceNumber: invoiceNumber.trim(),
        paymentMethod,
        notes: notes.trim() || undefined,
      });
      onClose();
      setBillingAccountId('');
      setAmountMajor('');
      setInvoiceNumber('');
      setNotes('');
    } catch (err: any) {
      setError(err?.message || 'Failed to record manual invoice');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Record Enterprise Manual Invoice</DialogTitle>
          <DialogDescription>
            Register offline wire transfers, custom procurement POs, or bank draft receipts.
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
                Amount Received <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={amountMajor}
                onChange={(e) => setAmountMajor(e.target.value)}
                placeholder="e.g. 50000"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Invoice / UTR Reference <span className="text-rose-500">*</span>
              </label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-0042 / UTR998822"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Channel
              </label>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                options={[
                  { value: 'BANK_TRANSFER', label: 'Bank Transfer (NEFT/RTGS)' },
                  { value: 'WIRE', label: 'International Wire (SWIFT)' },
                  { value: 'CHEQUE', label: 'Corporate Cheque' },
                  { value: 'PO_NET30', label: 'Enterprise Net-30 PO' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Settlement Notes / Bank Details
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Received via HDFC corporate account from Acme Corp treasury"
              className="w-full bg-slate-50/50 border border-[#e8ecf4] rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2f68ff]/20 focus:border-[#2f68ff] transition resize-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} type="button" disabled={invoiceMutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={invoiceMutation.isPending}>
            Record Payment & Post Credits
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
