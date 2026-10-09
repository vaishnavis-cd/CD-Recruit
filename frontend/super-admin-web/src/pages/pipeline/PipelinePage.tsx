import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  Search,
  Filter,
  Loader2,
  RefreshCw,
  User,
  CheckCircle,
  Plus,
  X,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/Button';

interface PipelineCard {
  id: string;
  name: string;
  domain: string | null;
  domainVerified: boolean;
  internalOwnerId: string | null;
  createdAt: string;
  driveCount: number;
  walkthroughDone: boolean;
}

interface PipelineColumn {
  count: number;
  items: PipelineCard[];
}

interface PipelineBoard {
  SIGNED_UP: PipelineColumn;
  TRIAL_ACTIVE: PipelineColumn;
  FIRST_DRIVE_CREATED: PipelineColumn;
  CONVERTED: PipelineColumn;
  DORMANT: PipelineColumn;
  UNKNOWN: PipelineColumn;
}

const COLUMN_CONFIG: Record<
  keyof PipelineBoard,
  { title: string; color: string; bg: string; border: string; description: string }
> = {
  SIGNED_UP: {
    title: 'Signed Up',
    color: 'text-[#0284c7]',
    bg: 'bg-[#f0f9ff]',
    border: 'border-[#bae6fd]',
    description: 'Tenant created, domain verification pending',
  },
  TRIAL_ACTIVE: {
    title: 'Trial Active',
    color: 'text-[#d97706]',
    bg: 'bg-[#fffbeb]',
    border: 'border-[#fde68a]',
    description: 'Trial active, no recruitment drives yet',
  },
  FIRST_DRIVE_CREATED: {
    title: 'First Drive Created',
    color: 'text-[#2f68ff]',
    bg: 'bg-[#eff6ff]',
    border: 'border-[#b2ccff]',
    description: 'Active trial and drives created',
  },
  CONVERTED: {
    title: 'Converted',
    color: 'text-[#12b76a]',
    bg: 'bg-[#ecfdf3]',
    border: 'border-[#a6f4c5]',
    description: 'Paid credit purchase recorded',
  },
  DORMANT: {
    title: 'Dormant',
    color: 'text-[#f04438]',
    bg: 'bg-[#fef3f2]',
    border: 'border-[#fecdca]',
    description: 'Trial expired or exhausted without purchase',
  },
  UNKNOWN: {
    title: 'Unknown',
    color: 'text-slate-500',
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    description: 'Billing facts unavailable / not connected',
  },
};

export const PipelinePage: React.FC = () => {
  const navigate = useNavigate();
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; fullName: string; role: string }>>([]);

  // Assign Owner Modal
  const [selectedTenant, setSelectedTenant] = useState<PipelineCard | null>(null);
  const [assignOwnerId, setAssignOwnerId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStaffOptions = async () => {
      try {
        const opts = await apiFetch<Array<{ id: string; fullName: string; role: string }>>('/staff/options');
        setStaffOptions(opts || []);
      } catch {
        setStaffOptions([]);
      }
    };
    fetchStaffOptions();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchPipeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (ownerFilter) params.set('owner', ownerFilter);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await apiFetch<PipelineBoard>(`/onboarding/pipeline${qs}`);
      setBoard(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, status: err.status });
      } else {
        setError({ message: 'Failed to load pipeline board' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPipeline();
  }, [debouncedSearch, ownerFilter]);

  const handleAssignOwner = async () => {
    if (!selectedTenant) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await apiFetch(`/tenants/${selectedTenant.id}/owner`, {
        method: 'PATCH',
        body: JSON.stringify({ internalOwnerId: assignOwnerId.trim() || null }),
      });
      setSelectedTenant(null);
      fetchPipeline();
    } catch (err: any) {
      setAssignError(err?.message || 'Failed to assign owner');
    } finally {
      setAssigning(false);
    }
  };

  const columns = ['SIGNED_UP', 'TRIAL_ACTIVE', 'FIRST_DRIVE_CREATED', 'CONVERTED', 'DORMANT', 'UNKNOWN'] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Tenant Pipeline Board
            <span className="text-xs font-mono bg-[#eff6ff] text-[#2f68ff] px-2 py-0.5 rounded-lg border border-[#bfdbfe]">
              Commercial Lifecycle
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time computed commercial funnel stages (zero stale state). Excludes offboarded tenants.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchPipeline}
            disabled={loading}
            icon={RefreshCw}
            className={loading ? '[&_svg]:animate-spin' : ''}
          >
            Refresh
          </Button>
          <Link to="/tenants/new">
            <Button variant="primary" size="sm" icon={Plus}>
              Onboard Tenant
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by company name, slug, or corporate domain..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white transition"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Owner:</span>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white transition"
            >
              <option value="">All Owners</option>
              {staffOptions.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.fullName} ({staff.role})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && !board && (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#2f68ff] animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Computing funnel stages across tenants...</p>
        </div>
      )}

      {error && !loading && (
        <ErrorState
          title="Failed to Load Pipeline"
          message={error.message}
          status={error.status}
          onRetry={fetchPipeline}
        />
      )}

      {/* Kanban Columns */}
      {!loading && !error && board && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4">
          {columns.map((colKey) => {
            const col = board[colKey] || { count: 0, items: [] };
            const cfg = COLUMN_CONFIG[colKey];

            return (
              <div
                key={colKey}
                className="bg-[#f8fafc] rounded-2xl border border-[#e8ecf4] p-3.5 flex flex-col min-w-[260px] h-[calc(100vh-280px)] min-h-[600px] shadow-[0_4px_16px_rgba(0,0,0,0.02)]"
              >
                {/* Column Header */}
                <div className="pb-3 border-b border-[#e8ecf4] mb-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${cfg.color}`}>{cfg.title}</span>
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color} border ${cfg.border}`}
                      >
                        {col.count}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{cfg.description}</p>
                  </div>
                </div>

                {/* Cards List */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {col.items.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-center p-4 border border-dashed border-[#e2e8f0] rounded-xl bg-white/50">
                      <p className="text-[11px] text-slate-400">No tenants in this stage</p>
                    </div>
                  ) : (
                    col.items.map((card) => (
                      <div
                        key={card.id}
                        className="bg-white hover:border-[#2f68ff]/40 border border-[#e8ecf4] rounded-xl p-3 space-y-2.5 transition shadow-[0_2px_8px_rgba(0,0,0,0.03)] group cursor-pointer hover:shadow-md"
                        onClick={() => navigate(`/tenants/${card.id}`)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#2f68ff] transition truncate">
                              {card.name}
                            </h4>
                            <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                              {card.domain || 'No domain'}
                            </p>
                          </div>
                          {card.domainVerified && (
                            <span title="Domain Verified" className="shrink-0 text-[#12b76a]">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>

                        {/* Metadata badges */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                            {card.driveCount} {card.driveCount === 1 ? 'drive' : 'drives'}
                          </span>
                          {card.walkthroughDone ? (
                            <span className="bg-[#ecfdf3] text-[#12b76a] px-1.5 py-0.5 rounded border border-[#a6f4c5]">
                              Walkthrough ✓
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                              Walkthrough pending
                            </span>
                          )}
                        </div>

                        {/* Owner & Action */}
                        <div className="pt-2 border-t border-[#e8ecf4] flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-1 text-slate-500 truncate">
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">
                              {card.internalOwnerId ? `Owner: ${card.internalOwnerId.slice(0, 8)}...` : 'Unassigned'}
                            </span>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTenant(card);
                              setAssignOwnerId(card.internalOwnerId || '');
                            }}
                            className="text-[#2f68ff] hover:text-[#2557db] font-semibold underline text-[10px]"
                          >
                            Assign
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Owner Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-[#e8ecf4] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8ecf4]">
              <div>
                <h3 className="text-base font-bold text-slate-900">Assign Account Owner</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Assign an active platform staff member as internal owner for{' '}
                  <strong className="text-slate-900">{selectedTenant.name}</strong>.
                </p>
              </div>
              <button
                onClick={() => setSelectedTenant(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {assignError && (
              <div className="bg-[#fef3f2] border border-[#fecdca] text-[#f04438] text-xs p-3 rounded-xl">
                {assignError}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
                Assign Internal Owner
              </label>
              <select
                value={assignOwnerId}
                onChange={(e) => setAssignOwnerId(e.target.value)}
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
              >
                <option value="">-- No Owner Assigned (Unassigned) --</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.fullName} ({staff.role})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Active platform staff members loaded from directory.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#e8ecf4]">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSelectedTenant(null)}
                disabled={assigning}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleAssignOwner}
                loading={assigning}
              >
                Save Owner
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PipelinePage;
