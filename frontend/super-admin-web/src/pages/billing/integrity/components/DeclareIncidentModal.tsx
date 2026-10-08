import React, { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDeclareIncidentMutation } from '@/hooks/billing/useBilling';

interface DeclareIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeclareIncidentModal: React.FC<DeclareIncidentModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [scope, setScope] = useState('ALL');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [ticketRef, setTicketRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  const incidentMutation = useDeclareIncidentMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startTime || !endTime) {
      setError('Both incident window start and end timestamps are required');
      return;
    }
    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
      setError('End time must be strictly after start time');
      return;
    }
    if (description.trim().length < 10) {
      setError('Detailed description of proctor outage (minimum 10 characters) is required');
      return;
    }

    try {
      setError(null);
      await incidentMutation.mutateAsync({
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        description: description.trim(),
        ticketRef: ticketRef.trim() || undefined,
        billingAccountId: scope === 'SPECIFIC' ? targetAccountId.trim() : undefined,
      });
      onClose();
      setStartTime('');
      setEndTime('');
      setDescription('');
      setTicketRef('');
    } catch (err: any) {
      setError(err?.message || 'Failed to declare retroactive incident window');
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Declare Proctoring Incident Window</DialogTitle>
          <DialogDescription>
            Flag a retroactive system disruption. Sessions within this window become eligible for automated credit waivers and appeals.
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
                Window Start (UTC) <span className="text-rose-500">*</span>
              </label>
              <Input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Window End (UTC) <span className="text-rose-500">*</span>
              </label>
              <Input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Incident Description & Root Cause <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. AWS us-east-1 WebRTC proctoring disconnect incident (min 10 characters)..."
              className="w-full bg-slate-50/50 border border-[#e8ecf4] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition resize-none placeholder:text-slate-400"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Incident Post-Mortem / Ticket Ref
            </label>
            <Input
              value={ticketRef}
              onChange={(e) => setTicketRef(e.target.value)}
              placeholder="e.g. SEV-1-20261006"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} type="button" disabled={incidentMutation.isPending}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" isLoading={incidentMutation.isPending}>
            Declare Incident Window
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
