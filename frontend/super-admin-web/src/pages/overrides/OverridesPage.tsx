import React, { useEffect, useState } from 'react';
import {
  Sliders,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileEdit,
  Plus,
  ShieldAlert,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { MOCK_OVERRIDES } from '@/mocks/mockData';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { MockBadge } from '@/components/common/MockBadge';

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
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Sliders className="w-6 h-6 text-indigo-400" />
              Operational Overrides Control Center
            </h1>
            <MockBadge />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Time-boxed operational emergency interventions with required Jira/ticket reference & audit trail
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchOverrides}
            disabled={loading}
            className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-800 flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/20 transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Declare Operational Override
          </button>
        </div>
      </div>

      {loading && (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs text-slate-400">Loading active overrides...</p>
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
            <button
              onClick={() => setShowModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Declare First Override
            </button>
          }
        />
      )}

      {!loading && !error && overrides.length > 0 && (
        <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono text-[10px]">
                <th className="py-3.5 px-4 font-semibold">Tenant / Drive Target</th>
                <th className="py-3.5 px-4 font-semibold">Override Type</th>
                <th className="py-3.5 px-4 font-semibold">Reason & Ticket Ref</th>
                <th className="py-3.5 px-4 font-semibold">Authorized By</th>
                <th className="py-3.5 px-4 font-semibold">Expires At</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {overrides.map((ovr) => (
                <tr key={ovr.id} className="hover:bg-slate-900/50 transition">
                  <td className="py-4 px-4">
                    <p className="font-bold text-slate-200">{ovr.tenantName}</p>
                    <p className="text-[11px] font-mono text-slate-400">{ovr.driveId}</p>
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-mono text-indigo-300 text-[11px] bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      {ovr.overrideType}
                    </span>
                  </td>
                  <td className="py-4 px-4 max-w-xs">
                    <p className="text-slate-300 truncate">{ovr.reason}</p>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">Ref: {ovr.ticketRef}</p>
                  </td>
                  <td className="py-4 px-4 font-mono text-slate-400 text-[11px]">{ovr.operatorEmail}</td>
                  <td className="py-4 px-4 font-mono text-slate-400 text-[11px]">{new Date(ovr.expiresAt).toLocaleString()}</td>
                  <td className="py-4 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        ovr.status === 'ACTIVE'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {ovr.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              Declare Operational Override
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              All overrides are time-boxed, logged in append-only audit, and require a valid incident ticket ref.
            </p>

            <form onSubmit={handleCreateOverride} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Target Tenant ID / Org</label>
                <input
                  type="text"
                  required
                  value={form.tenantId}
                  onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                  placeholder="e.g. org_acme_01"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Target Drive ID (Optional)</label>
                <input
                  type="text"
                  value={form.driveId}
                  onChange={(e) => setForm({ ...form, driveId: e.target.value })}
                  placeholder="e.g. drv_campus_2026_09"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Override Type</label>
                  <select
                    value={form.overrideType}
                    onChange={(e) => setForm({ ...form, overrideType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="PROCTORING_RELAXATION">PROCTORING_RELAXATION</option>
                    <option value="SCHEDULE_EXTENSION">SCHEDULE_EXTENSION</option>
                    <option value="QUESTION_CORRECTION">QUESTION_CORRECTION</option>
                    <option value="INVITE_RATIO">INVITE_RATIO</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Duration (Hours)</label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    required
                    value={form.durationHours}
                    onChange={(e) => setForm({ ...form, durationHours: parseInt(e.target.value) || 24 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Ticket Reference (Jira / Linear / Incident)</label>
                <input
                  type="text"
                  required
                  value={form.ticketRef}
                  onChange={(e) => setForm({ ...form, ticketRef: e.target.value })}
                  placeholder="e.g. INC-88902 or SUP-1204"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Operational Justification / Reason</label>
                <textarea
                  required
                  rows={3}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Explain why this emergency override is being applied..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-lg shadow-indigo-500/20"
                >
                  Submit & Authorize
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
