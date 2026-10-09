import React, { useEffect, useState } from 'react';
import {
  Sliders,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileEdit,
  Plus,
  ShieldAlert,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { MOCK_OVERRIDES } from '@/mocks/mockData';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { MockBadge } from '@/components/common/MockBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';

interface OverrideRecord {
  id: string;
  tenantName: string;
  driveId: string;
  overrideType: 'PROCTORING_RELAXATION' | 'SCHEDULE_EXTENSION' | 'QUESTION_CORRECTION' | 'INVITE_RATIO';
  reason: string;
  ticketRef: string;
  operatorEmail: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}

export const OverridesPage: React.FC = () => {
  const isMock = import.meta.env.VITE_USE_MOCKS === 'true';

  const [overrides, setOverrides] = useState<OverrideRecord[]>(isMock ? MOCK_OVERRIDES : []);
  const [loading, setLoading] = useState(!isMock);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    tenantId: '',
    driveId: '',
    overrideType: 'PROCTORING_RELAXATION',
    durationHours: 24,
    reason: '',
    ticketRef: '',
  });

  const fetchOverrides = async () => {
    if (isMock) {
      setOverrides(MOCK_OVERRIDES);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<any>('/overrides');
      if (Array.isArray(data)) {
        setOverrides(data);
      } else if (data?.items && Array.isArray(data.items)) {
        setOverrides(data.items);
      } else {
        setOverrides([]);
      }
    } catch (err: any) {
      setError({
        message: err.message || 'Failed to fetch operational overrides.',
        status: err instanceof ApiError ? err.status : undefined,
      });
      setOverrides([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverrides();
  }, []);

  const handleCreateOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/overrides/proctoring', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      setShowModal(false);
      fetchOverrides();
      setForm({
        tenantId: '',
        driveId: '',
        overrideType: 'PROCTORING_RELAXATION',
        durationHours: 24,
        reason: '',
        ticketRef: '',
      });
    } catch (err: any) {
      alert(err.message || 'Failed to apply override');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              
              Operational Overrides Control Center
            </h1>
            <MockBadge />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Time-boxed operational emergency interventions with required Jira/ticket reference & audit trail
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchOverrides}
            disabled={loading}
            icon={RefreshCw}
            className={loading ? '[&_svg]:animate-spin' : ''}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowModal(true)}
            icon={Plus}
          >
            Declare Operational Override
          </Button>
        </div>
      </div>

      {loading && (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#2f68ff] animate-spin" />
          <p className="text-xs text-slate-500">Loading active overrides...</p>
        </div>
      )}

      {error && !loading && (
        <ErrorState
          title="Failed to Load Operational Overrides"
          message={error.message}
          status={error.status}
          onRetry={fetchOverrides}
        />
      )}

      {!loading && !error && overrides.length === 0 && (
        <EmptyState
          title="No Active Overrides"
          description="There are currently no active or historical operational overrides declared."
          icon={Sliders}
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowModal(true)}
              icon={Plus}
            >
              Declare First Override
            </Button>
          }
        />
      )}

      {!loading && !error && overrides.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e8ecf4] text-slate-500 uppercase tracking-wider font-mono text-[10px]">
                <th className="py-3.5 px-4 font-semibold">Tenant / Drive Target</th>
                <th className="py-3.5 px-4 font-semibold">Override Type</th>
                <th className="py-3.5 px-4 font-semibold">Reason & Ticket Ref</th>
                <th className="py-3.5 px-4 font-semibold">Authorized By</th>
                <th className="py-3.5 px-4 font-semibold">Expires At</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8ecf4]">
              {overrides.map((ovr) => (
                <tr key={ovr.id} className="hover:bg-[#f8fafc]/70 transition">
                  <td className="py-4 px-4">
                    <p className="font-bold text-slate-900">{ovr.tenantName}</p>
                    <p className="text-[11px] font-mono text-slate-500">{ovr.driveId}</p>
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-mono text-[#2f68ff] text-[11px] bg-[#eff6ff] px-2 py-0.5 rounded border border-[#bfdbfe]">
                      {ovr.overrideType}
                    </span>
                  </td>
                  <td className="py-4 px-4 max-w-xs">
                    <p className="text-slate-800 truncate">{ovr.reason}</p>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">Ref: {ovr.ticketRef}</p>
                  </td>
                  <td className="py-4 px-4 font-mono text-slate-500 text-[11px]">{ovr.operatorEmail}</td>
                  <td className="py-4 px-4 font-mono text-slate-500 text-[11px]">{new Date(ovr.expiresAt).toLocaleString()}</td>
                  <td className="py-4 px-4">
                    <StatusBadge status={ovr.status} dot />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-[#e8ecf4] rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-900 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#e8ecf4]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#fffbeb] border border-[#fde68a] flex items-center justify-center text-[#d97706]">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Declare Operational Override</h3>
                  <p className="text-xs text-slate-500">
                    All overrides are time-boxed and require an append-only audit trail.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOverride} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Tenant ID / Org</label>
                <input
                  type="text"
                  required
                  value={form.tenantId}
                  onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                  placeholder="e.g. org_acme_01"
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Drive ID (Optional)</label>
                <input
                  type="text"
                  value={form.driveId}
                  onChange={(e) => setForm({ ...form, driveId: e.target.value })}
                  placeholder="e.g. drv_campus_2026_09"
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Override Type</label>
                  <select
                    value={form.overrideType}
                    onChange={(e) => setForm({ ...form, overrideType: e.target.value as any })}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                  >
                    <option value="PROCTORING_RELAXATION">PROCTORING_RELAXATION</option>
                    <option value="SCHEDULE_EXTENSION">SCHEDULE_EXTENSION</option>
                    <option value="QUESTION_CORRECTION">QUESTION_CORRECTION</option>
                    <option value="INVITE_RATIO">INVITE_RATIO</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (Hours)</label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    required
                    value={form.durationHours}
                    onChange={(e) => setForm({ ...form, durationHours: parseInt(e.target.value) || 24 })}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ticket Reference (Jira / Linear / Incident)</label>
                <input
                  type="text"
                  required
                  value={form.ticketRef}
                  onChange={(e) => setForm({ ...form, ticketRef: e.target.value })}
                  placeholder="e.g. INC-88902 or SUP-1204"
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Operational Justification / Reason</label>
                <textarea
                  required
                  rows={3}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Explain why this emergency override is being applied..."
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#e8ecf4]">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                >
                  Submit & Authorize
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
