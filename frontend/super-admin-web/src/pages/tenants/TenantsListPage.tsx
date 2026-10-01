import React, { useEffect, useState, useTransition } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Search,
  Filter,
  UserCheck,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { MOCK_TENANTS } from '@/mocks/mockData';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { MockBadge } from '@/components/common/MockBadge';

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
  licenseTier: string;
  createdAt: string;
  driveCount: number;
  creditsRemaining: number | null;
  funnelStage?: string | null;
  funnelReason?: string | null;
}

interface ListTenantsResponse {
  items: TenantItem[];
  page: number;
  pageSize: number;
  total: number;
}

export const TenantsListPage: React.FC = () => {
  const isMock = import.meta.env.VITE_USE_MOCKS === 'true';
  const { startImpersonation } = useAuthStore();

  const [tenants, setTenants] = useState<TenantItem[]>(isMock ? (MOCK_TENANTS as any) : []);
  const [loading, setLoading] = useState(!isMock);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PROVISIONING' | 'SUSPENDED' | 'OFFBOARDED'>('ALL');
  const [tierFilter, setTierFilter] = useState<'ALL' | 'STARTER' | 'GROWTH' | 'ENTERPRISE'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(isMock ? MOCK_TENANTS.length : 0);

  // Debounce search input (300 ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset to page 1 when status or tier changes
  const handleStatusChange = (status: typeof statusFilter) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleTierChange = (tier: typeof tierFilter) => {
    setTierFilter(tier);
    setPage(1);
  };

  const fetchTenants = async () => {
    if (isMock) {
      let filtered = [...MOCK_TENANTS] as any[];
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        filtered = filtered.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.domain && t.domain.toLowerCase().includes(q)) ||
            (t.slug && t.slug.toLowerCase().includes(q)) ||
            t.id.toLowerCase().includes(q)
        );
      }
      if (statusFilter !== 'ALL') {
        filtered = filtered.filter((t) => (t.status || t.lifecycleStatus) === statusFilter);
      }
      setTenants(filtered);
      setTotal(filtered.length);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());
      if (debouncedSearch) {
        params.set('search', debouncedSearch);
      }
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (tierFilter !== 'ALL') {
        params.set('tier', tierFilter);
      }
      params.set('sort', 'createdAt');
      params.set('order', 'desc');

      const data = await apiFetch<ListTenantsResponse>(`/tenants?${params.toString()}`);
      if (data && Array.isArray(data.items)) {
        setTenants(data.items);
        setTotal(data.total);
      } else {
        setTenants([]);
        setTotal(0);
      }
    } catch (err: any) {
      setError({
        message: err.message || 'Failed to fetch tenants list from platform service.',
        status: err instanceof ApiError ? err.status : undefined,
      });
      setTenants([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [debouncedSearch, statusFilter, tierFilter, page, isMock]);

  const handleImpersonate = (tenant: TenantItem) => {
    if (window.confirm(`Initiate 30-minute dual-audited impersonation session for "${tenant.name}"?`)) {
      startImpersonation({
        tenantId: tenant.id,
        tenantName: tenant.name,
        token: `impersonate_jwt_${tenant.id}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* Top Title & Onboarding CTA */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Tenants Directory</h1>
            <MockBadge />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Global tenant governance, status overrides, and dual-actor impersonation access
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchTenants}
            disabled={loading}
            className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-800 flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link
            to="/tenants/new"
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/20 transition flex items-center gap-1.5"
          >
            + Onboard New Tenant
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel rounded-xl p-4 border border-slate-800/80 flex flex-wrap gap-4 items-center justify-between">
        <div className="relative w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by Org name, domain, slug..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Status:</span>
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              {(['ALL', 'ACTIVE', 'PROVISIONING', 'SUSPENDED', 'OFFBOARDED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => handleStatusChange(st)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    statusFilter === st
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Tier:</span>
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              {(['ALL', 'STARTER', 'GROWTH', 'ENTERPRISE'] as const).map((tier) => (
                <button
                  key={tier}
                  onClick={() => handleTierChange(tier)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    tierFilter === tier
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading && (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs text-slate-400">Loading tenants directory...</p>
        </div>
      )}

      {error && !loading && (
        <ErrorState
          title="Failed to Load Tenants Directory"
          message={error.message}
          status={error.status}
          onRetry={fetchTenants}
        />
      )}

      {!loading && !error && tenants.length === 0 && (
        <EmptyState
          title={debouncedSearch || statusFilter !== 'ALL' || tierFilter !== 'ALL' ? 'No matching tenants' : 'No Tenants Registered'}
          description={
            debouncedSearch || statusFilter !== 'ALL' || tierFilter !== 'ALL'
              ? 'Try adjusting your search query or filters.'
              : 'There are currently no tenant organizations provisioned in the platform.'
          }
          icon={Building2}
          action={
            <Link
              to="/tenants/new"
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition inline-block"
            >
              + Onboard First Tenant
            </Link>
          }
        />
      )}

      {!loading && !error && tenants.length > 0 && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono text-[10px]">
                  <th className="py-3.5 px-4 font-semibold">Organization / Domain</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold">Funnel Stage</th>
                  <th className="py-3.5 px-4 font-semibold">License Tier</th>
                  <th className="py-3.5 px-4 font-semibold">Credits Balance</th>
                  <th className="py-3.5 px-4 font-semibold">Active Drives</th>
                  <th className="py-3.5 px-4 font-semibold">Provisioned</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-900/50 transition">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-xs">
                          {t.name ? t.name[0].toUpperCase() : 'O'}
                        </div>
                        <div>
                          <Link
                            to={`/tenants/${t.id}`}
                            className="font-bold text-slate-200 hover:text-indigo-400 transition"
                          >
                            {t.name}
                          </Link>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {t.domain || t.slug || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          t.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : t.status === 'PROVISIONING'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : t.status === 'SUSPENDED'
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            t.status === 'ACTIVE'
                              ? 'bg-emerald-400'
                              : t.status === 'PROVISIONING'
                              ? 'bg-amber-400'
                              : t.status === 'SUSPENDED'
                              ? 'bg-red-400'
                              : 'bg-slate-400'
                          }`}
                        />
                        {t.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {t.funnelStage === 'UNKNOWN' ? (
                        <span
                          title="Billing not connected yet"
                          className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/80 cursor-help"
                        >
                          UNKNOWN ⓘ
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${
                            t.funnelStage === 'CONVERTED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : t.funnelStage === 'FIRST_DRIVE_CREATED'
                              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                              : t.funnelStage === 'TRIAL_ACTIVE'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : t.funnelStage === 'SIGNED_UP'
                              ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}
                        >
                          {t.funnelStage || '—'}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-mono text-slate-300 text-[11px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {t.licenseTier}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono font-bold text-slate-200">
                      {t.creditsRemaining !== null ? (
                        <span>
                          {t.creditsRemaining}{' '}
                          <span className="text-[10px] text-slate-400 font-normal">credits</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 font-normal">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-mono text-slate-300">{t.driveCount}</td>
                    <td className="py-4 px-4 font-mono text-[11px] text-slate-400">
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleImpersonate(t)}
                          title="30-Min Impersonation Session"
                          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1"
                        >
                          <UserCheck className="w-3 h-3" /> Impersonate
                        </button>
                        <Link
                          to={`/tenants/${t.id}`}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1"
                        >
                          View 360 &rarr;
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {total > pageSize && (
            <div className="flex items-center justify-between text-xs text-slate-400 px-2">
              <div>
                Showing <span className="font-semibold text-slate-200">{(page - 1) * pageSize + 1}</span> to{' '}
                <span className="font-semibold text-slate-200">
                  {Math.min(page * pageSize, total)}
                </span>{' '}
                of <span className="font-semibold text-slate-200">{total}</span> tenants
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="bg-slate-900 border border-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <span className="px-2 font-mono text-slate-300">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="bg-slate-900 border border-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
