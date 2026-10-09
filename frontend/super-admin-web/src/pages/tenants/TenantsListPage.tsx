import React, { useEffect, useState } from 'react';
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
  Plus,
  ArrowRight,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { MOCK_TENANTS } from '@/mocks/mockData';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { MockBadge } from '@/components/common/MockBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tenants Directory</h1>
            <MockBadge />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Global tenant governance, status overrides, and dual-actor impersonation access
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchTenants}
            disabled={loading}
            icon={RefreshCw}
            className={loading ? '[&_svg]:animate-spin' : ''}
          >
            Refresh
          </Button>
          <Link to="/tenants/new">
            <Button variant="primary" size="sm" icon={Plus}>
              Onboard New Tenant
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-wrap gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by Org name, domain, slug..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Status:</span>
            <div className="flex bg-[#f1f5f9] p-1 rounded-xl border border-[#e2e8f0] text-xs">
              {(['ALL', 'ACTIVE', 'PROVISIONING', 'SUSPENDED', 'OFFBOARDED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => handleStatusChange(st)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Tier:</span>
            <div className="flex bg-[#f1f5f9] p-1 rounded-xl border border-[#e2e8f0] text-xs">
              {(['ALL', 'STARTER', 'GROWTH', 'ENTERPRISE'] as const).map((tier) => (
                <button
                  key={tier}
                  onClick={() => handleTierChange(tier)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                    tierFilter === tier
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
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
          <Loader2 className="w-8 h-8 text-[#2f68ff] animate-spin" />
          <p className="text-xs text-slate-500">Loading tenants directory...</p>
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
            <Link to="/tenants/new">
              <Button variant="primary" size="sm" icon={Plus}>
                Onboard First Tenant
              </Button>
            </Link>
          }
        />
      )}

      {!loading && !error && tenants.length > 0 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e8ecf4] text-slate-500 uppercase tracking-wider font-mono text-[10px]">
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
              <tbody className="divide-y divide-[#e8ecf4]">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-[#f8fafc]/70 transition">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[#eff6ff] border border-[#dbeafe] flex items-center justify-center font-bold text-[#2f68ff] text-xs">
                          {t.name ? t.name[0].toUpperCase() : 'O'}
                        </div>
                        <div>
                          <Link
                            to={`/tenants/${t.id}`}
                            className="font-bold text-slate-900 hover:text-[#2f68ff] transition"
                          >
                            {t.name}
                          </Link>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {t.domain || t.slug || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <StatusBadge status={t.status} dot />
                    </td>
                    <td className="py-4 px-4">
                      {t.funnelStage === 'UNKNOWN' ? (
                        <span
                          title="Billing not connected yet"
                          className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 cursor-help"
                        >
                          UNKNOWN ⓘ
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${
                            t.funnelStage === 'CONVERTED'
                              ? 'bg-[#ecfdf3] text-[#12b76a] border-[#a6f4c5]'
                              : t.funnelStage === 'FIRST_DRIVE_CREATED'
                              ? 'bg-[#eff6ff] text-[#2f68ff] border-[#b2ccff]'
                              : t.funnelStage === 'TRIAL_ACTIVE'
                              ? 'bg-[#fffbeb] text-[#d97706] border-[#fde68a]'
                              : t.funnelStage === 'SIGNED_UP'
                              ? 'bg-[#f0f9ff] text-[#0284c7] border-[#bae6fd]'
                              : 'bg-[#fef3f2] text-[#f04438] border-[#fecdca]'
                          }`}
                        >
                          {t.funnelStage || '—'}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-mono text-slate-700 text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {t.licenseTier}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono font-bold text-slate-900">
                      {t.creditsRemaining !== null ? (
                        <span>
                          {t.creditsRemaining}{' '}
                          <span className="text-[10px] text-slate-500 font-normal">credits</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-mono text-slate-700">{t.driveCount}</td>
                    <td className="py-4 px-4 font-mono text-[11px] text-slate-500">
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleImpersonate(t)}
                          title="30-Min Impersonation Session"
                          className="bg-[#fffbeb] hover:bg-[#fef0c7] text-[#b54708] border border-[#fedf89] px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 shadow-xs"
                        >
                          <UserCheck className="w-3 h-3" /> Impersonate
                        </button>
                        <Link
                          to={`/tenants/${t.id}`}
                          className="bg-white hover:bg-slate-50 text-slate-700 border border-[#e2e8f0] px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 shadow-xs"
                        >
                          <span>View 360</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
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
            <div className="flex items-center justify-between text-xs text-slate-500 px-2">
              <div>
                Showing <span className="font-semibold text-slate-900">{(page - 1) * pageSize + 1}</span> to{' '}
                <span className="font-semibold text-slate-900">
                  {Math.min(page * pageSize, total)}
                </span>{' '}
                of <span className="font-semibold text-slate-900">{total}</span> tenants
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="bg-white border border-[#e2e8f0] text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 shadow-xs font-semibold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <span className="px-2 font-mono text-slate-700">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="bg-white border border-[#e2e8f0] text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 shadow-xs font-semibold"
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
