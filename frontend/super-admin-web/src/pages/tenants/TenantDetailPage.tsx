import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Building2,
  Activity,
  CreditCard,
  History,
  ArrowLeft,
  UserCheck,
  Loader2,
  RefreshCw,
  Award,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { MOCK_TENANT_DETAIL } from '@/mocks/mockData';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { MockBadge } from '@/components/common/MockBadge';

interface TenantDetail {
  overview: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
    licenseTier: string;
    createdAt: string;
    suspendedAt: string | null;
    suspendedReason: string | null;
    internalOwnerId: string | null;
    domainVerifiedAt: string | null;
    walkthroughCompletedAt: string | null;
    walkthroughChecklist: Record<string, any> | null;
  };
  drives: {
    driveCount: number;
    items: Array<{
      id: string;
      name: string;
      status: string;
      invitesSent: number;
      sessionsStarted: number;
      sessionsCompleted: number;
    }>;
  };
  billing: {
    connected: boolean;
    summary?: any;
  };
  licensing: {
    licenseTier: string;
  };
  retention: {
    appealWindowDaysOverride: number | null;
  };
  funnelStage: string | null;
}

interface AuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actorRole: string;
  subjectType: string;
  subjectId: string;
  action: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  reason?: string | null;
  ticketRef?: string | null;
  executionResult: string;
}

interface AuditResponse {
  items: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export const TenantDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isMock = import.meta.env.VITE_USE_MOCKS === 'true';
  const { startImpersonation } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'DRIVES' | 'BILLING' | 'LICENSING' | 'AUDIT'>('OVERVIEW');
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(!isMock);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  // Audit tab state
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);

  const fetchTenant = async () => {
    if (isMock) {
      setTenant(MOCK_TENANT_DETAIL as any);
      return;
    }

    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<TenantDetail>(`/tenants/${id}`);
      setTenant(data);
    } catch (err: any) {
      setError({
        message: err.message || `Failed to fetch details for tenant "${id}".`,
        status: err instanceof ApiError ? err.status : undefined,
      });
      setTenant(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditEvents = async (pageToFetch: number) => {
    if (isMock || !id) return;
    setAuditLoading(true);
    try {
      const data = await apiFetch<AuditResponse>(`/tenants/${id}/audit?page=${pageToFetch}&pageSize=10`);
      if (data && Array.isArray(data.items)) {
        setAuditEvents(data.items);
        setAuditTotal(data.total);
      } else {
        setAuditEvents([]);
        setAuditTotal(0);
      }
    } catch (err) {
      setAuditEvents([]);
      setAuditTotal(0);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchTenant();
  }, [id, isMock]);

  useEffect(() => {
    if (activeTab === 'AUDIT' && tenant) {
      fetchAuditEvents(auditPage);
    }
  }, [activeTab, auditPage, tenant]);

  const [modalAction, setModalAction] = useState<'SUSPEND' | 'RESTORE' | null>(null);
  const [modalReason, setModalReason] = useState('');
  const [modalTicketRef, setModalTicketRef] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // License Tier update state
  const [selectedTier, setSelectedTier] = useState<string>('STARTER');
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [tierReason, setTierReason] = useState('');
  const [tierTicketRef, setTierTicketRef] = useState('');
  const [tierSubmitting, setTierSubmitting] = useState(false);
  const [tierError, setTierError] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setSelectedTier(tenant.licensing.licenseTier || 'STARTER');
    }
  }, [tenant]);

  const handleTierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (tierReason.trim().length < 10) {
      setTierError('Reason must be at least 10 characters long.');
      return;
    }

    setTierSubmitting(true);
    setTierError(null);

    try {
      await apiFetch(`/tenants/${id}/licensing`, {
        method: 'PATCH',
        body: JSON.stringify({
          licenseTier: selectedTier,
          reason: tierReason.trim(),
          ticketRef: tierTicketRef.trim() || undefined,
        }),
      });

      setIsTierModalOpen(false);
      setTierReason('');
      setTierTicketRef('');
      await fetchTenant();
      if (activeTab === 'AUDIT') {
        await fetchAuditEvents(1);
      }
    } catch (err: any) {
      setTierError(err.message || 'Failed to update license tier.');
    } finally {
      setTierSubmitting(false);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !modalAction) return;

    if (modalReason.trim().length < 10) {
      setModalError('Reason must be at least 10 characters long.');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    try {
      const endpoint = modalAction === 'SUSPEND' ? `/tenants/${id}/suspend` : `/tenants/${id}/restore`;
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          reason: modalReason.trim(),
          ticketRef: modalTicketRef.trim() || undefined,
        }),
      });

      setModalAction(null);
      setModalReason('');
      setModalTicketRef('');
      await fetchTenant();
      if (activeTab === 'AUDIT') {
        await fetchAuditEvents(1);
      }
    } catch (err: any) {
      setModalError(err.message || `Failed to ${modalAction.toLowerCase()} tenant.`);
    } finally {
      setModalSubmitting(false);
    }
  };


  const handleImpersonate = () => {
    if (!tenant) return;
    if (window.confirm(`Launch 30-min dual-audited impersonation session for ${tenant.overview.name}?`)) {
      startImpersonation({
        tenantId: tenant.overview.id,
        tenantName: tenant.overview.name,
        token: `impersonate_jwt_${tenant.overview.id}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    }
  };

  const tabs = [
    { id: 'OVERVIEW', label: 'Overview & Governance', icon: Building2 },
    { id: 'DRIVES', label: 'Campus Drives', icon: Activity },
    { id: 'BILLING', label: 'Commercials & Ledger', icon: CreditCard },
    { id: 'LICENSING', label: 'Licensing Tier', icon: Award },
    { id: 'AUDIT', label: 'Audit Trail', icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Top Back Link & Header */}
      <div>
        <Link
          to="/tenants"
          className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 mb-3 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Tenants Directory
        </Link>

        {loading && (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-400">Loading tenant details...</p>
          </div>
        )}

        {error && !loading && (
          <ErrorState
            title="Tenant Details Unavailable"
            message={error.message}
            status={error.status}
            onRetry={fetchTenant}
          />
        )}

        {tenant && !loading && !error && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-indigo-500/20">
                  {tenant.overview.name?.[0] || 'T'}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-white">{tenant.overview.name}</h1>
                    <MockBadge />
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        tenant.overview.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : tenant.overview.status === 'PROVISIONING'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : tenant.overview.status === 'SUSPENDED'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          tenant.overview.status === 'ACTIVE'
                            ? 'bg-emerald-400'
                            : tenant.overview.status === 'PROVISIONING'
                            ? 'bg-amber-400'
                            : tenant.overview.status === 'SUSPENDED'
                            ? 'bg-red-400'
                            : 'bg-slate-400'
                        }`}
                      />
                      {tenant.overview.status}
                    </span>
                    <span className="font-mono text-slate-400 text-xs bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      Tier: {tenant.licensing.licenseTier}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    Domain: <span className="text-indigo-400">{tenant.overview.domain || tenant.overview.slug || '—'}</span> • Tenant ID: {tenant.overview.id}
                  </p>
                </div>
              </div>

              {/* Header Action Buttons */}
              <div className="flex items-center gap-3">
                {tenant.overview.status === 'ACTIVE' && (
                  <button
                    onClick={() => {
                      setModalAction('SUSPEND');
                      setModalReason('');
                      setModalTicketRef('');
                      setModalError(null);
                    }}
                    className="bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-red-500/10"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Suspend Tenant
                  </button>
                )}

                {tenant.overview.status === 'SUSPENDED' && (
                  <button
                    onClick={() => {
                      setModalAction('RESTORE');
                      setModalReason('');
                      setModalTicketRef('');
                      setModalError(null);
                    }}
                    className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/10"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Restore Tenant
                  </button>
                )}

                <button
                  onClick={fetchTenant}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-800 flex items-center gap-2 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
                <button
                  onClick={handleImpersonate}
                  className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-amber-500/10"
                >
                  <UserCheck className="w-3.5 h-3.5" /> Launch 30-Min Impersonation
                </button>
              </div>
            </div>

            {/* Suspended Red Banner */}
            {tenant.overview.status === 'SUSPENDED' && (
              <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3.5 shadow-lg shadow-red-500/5">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-red-300">
                    Suspended: new test attempts are blocked. Admins can still log in and view reports.
                  </h4>
                  <div className="text-xs text-red-400/90 flex flex-wrap gap-x-4 gap-y-1">
                    {tenant.overview.suspendedReason && (
                      <span>
                        <strong>Reason:</strong> {tenant.overview.suspendedReason}
                      </span>
                    )}
                    {tenant.overview.suspendedAt && (
                      <span>
                        <strong>Suspended At:</strong>{' '}
                        {new Date(tenant.overview.suspendedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Sub-Navigation Tabs */}
            <div className="flex border-b border-slate-800/80 space-x-1 pt-4">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                      isActive
                        ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab 1: Overview */}
            {activeTab === 'OVERVIEW' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                <div className="lg:col-span-2 space-y-6">
                  <div className="glass-panel rounded-2xl p-6 border border-slate-800/90 space-y-4">
                    <h3 className="text-sm font-bold text-white tracking-tight">Governance & Retention Settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-slate-400">Appeal Window Days Override</span>
                        <p className="text-base font-bold text-slate-200">
                          {tenant.retention.appealWindowDaysOverride !== null
                            ? `${tenant.retention.appealWindowDaysOverride} Days`
                            : 'Standard Policy (7 Days)'}
                        </p>
                        <p className="text-[11px] text-slate-500">Configured dispute and evidence appeal window</p>
                      </div>

                      <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-slate-400">Domain Verification Status</span>
                        <p className="text-base font-bold text-slate-200">
                          {tenant.overview.domainVerifiedAt ? 'Verified' : 'Pending Verification'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {tenant.overview.domainVerifiedAt
                            ? new Date(tenant.overview.domainVerifiedAt).toLocaleString()
                            : 'Not yet verified'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel rounded-2xl p-6 border border-slate-800/90 space-y-4">
                    <h3 className="text-sm font-bold text-white tracking-tight">Onboarding & Walkthrough Progress</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-slate-400">Walkthrough Completed</span>
                        <p className="text-base font-bold text-slate-200">
                          {tenant.overview.walkthroughCompletedAt ? 'Completed' : 'In Progress'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {tenant.overview.walkthroughCompletedAt
                            ? new Date(tenant.overview.walkthroughCompletedAt).toLocaleString()
                            : 'Pending operator walkthrough checklist'}
                        </p>
                      </div>

                      <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-slate-400">Internal Account Owner</span>
                        <p className="text-base font-bold text-slate-200">
                          {tenant.overview.internalOwnerId || 'Unassigned'}
                        </p>
                        <p className="text-[11px] text-slate-500">Designated platform operations lead</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-6 border border-slate-800/90 space-y-4">
                  <h3 className="text-sm font-bold text-white tracking-tight">Organization Metadata</h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Organization Name</span>
                      <span className="text-slate-200 font-semibold">{tenant.overview.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Slug Identifier</span>
                      <span className="text-slate-200 font-mono">{tenant.overview.slug}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Corporate Domain</span>
                      <span className="text-indigo-400 font-mono">{tenant.overview.domain || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Provisioned Date</span>
                      <span className="text-slate-200 font-mono">
                        {new Date(tenant.overview.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Campus Drives (Aggregate counts only) */}
            {activeTab === 'DRIVES' && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    Campus Drives ({tenant.drives.driveCount})
                  </h3>
                  <span className="text-xs text-slate-400">
                    Aggregated telemetry data only (PII-blind)
                  </span>
                </div>

                {tenant.drives.items.length === 0 ? (
                  <EmptyState
                    title="No Drives Created"
                    description="This tenant organization has not published or scheduled any assessment drives."
                    icon={Activity}
                  />
                ) : (
                  <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden shadow-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono text-[10px]">
                          <th className="py-3.5 px-4 font-semibold">Drive Name</th>
                          <th className="py-3.5 px-4 font-semibold">Status</th>
                          <th className="py-3.5 px-4 font-semibold text-right">Invites Sent</th>
                          <th className="py-3.5 px-4 font-semibold text-right">Sessions Started</th>
                          <th className="py-3.5 px-4 font-semibold text-right">Sessions Completed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {tenant.drives.items.map((drive) => (
                          <tr key={drive.id} className="hover:bg-slate-900/50 transition">
                            <td className="py-4 px-4 font-semibold text-slate-200">{drive.name}</td>
                            <td className="py-4 px-4">
                              <span className="font-mono text-slate-300 text-[11px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                {drive.status}
                              </span>
                            </td>
                            <td className="py-4 px-4 font-mono text-right text-slate-300">
                              {drive.invitesSent}
                            </td>
                            <td className="py-4 px-4 font-mono text-right text-indigo-400">
                              {drive.sessionsStarted}
                            </td>
                            <td className="py-4 px-4 font-mono text-right text-emerald-400 font-semibold">
                              {drive.sessionsCompleted}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Billing & Ledger */}
            {activeTab === 'BILLING' && (
              <div className="pt-2">
                {!tenant.billing.connected ? (
                  <EmptyState
                    title="Billing Engine Not Connected Yet"
                    description="Half 2 commercial billing ledger and credit pool synchronization will populate this view once the billing engine service is integrated."
                    icon={CreditCard}
                  />
                ) : (
                  <div className="glass-panel rounded-2xl p-6 border border-slate-800/90 space-y-4">
                    <h3 className="text-sm font-bold text-white tracking-tight">Commercial Balance & Credit Pools</h3>
                    <p className="text-xs text-slate-300 font-mono">
                      Credits Remaining: {tenant.billing.summary?.creditsRemaining ?? '—'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Licensing Tier */}
            {activeTab === 'LICENSING' && (
              <div className="pt-2 max-w-xl space-y-6">
                <div className="glass-panel rounded-2xl p-6 border border-slate-800/90 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight">License Edition Tier</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Manage the contractual edition label for this tenant.</p>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                      Tier Label
                    </span>
                  </div>

                  <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 text-xs block">Current Edition Tier</span>
                        <span className="text-lg font-bold text-indigo-400 font-mono">
                          {tenant.licensing.licenseTier}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 space-y-3">
                      <label className="block text-xs font-semibold text-slate-300">
                        Change Edition Tier
                      </label>
                      <div className="flex items-center gap-3">
                        <select
                          value={selectedTier}
                          onChange={(e) => setSelectedTier(e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 flex-1"
                        >
                          <option value="STARTER">STARTER</option>
                          <option value="GROWTH">GROWTH</option>
                          <option value="ENTERPRISE">ENTERPRISE</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setTierReason('');
                            setTierTicketRef('');
                            setTierError(null);
                            setIsTierModalOpen(true);
                          }}
                          disabled={selectedTier === tenant.licensing.licenseTier}
                          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-md shadow-indigo-600/20"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Scope note */}
                  <div className="p-3.5 bg-slate-900/50 border border-slate-800 rounded-xl flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      <strong>Note:</strong> The tier is a label. Feature access rules and entitlement flags are not defined yet.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 5: Tenant Audit Trail */}
            {activeTab === 'AUDIT' && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    Tenant Audit Log ({auditTotal})
                  </h3>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/audit?targetTenantId=${tenant.overview.id}`}
                      className="bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <History className="w-3.5 h-3.5" /> Open in Audit Explorer
                    </Link>
                    <button
                      onClick={() => fetchAuditEvents(auditPage)}
                      disabled={auditLoading}
                      className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-800 flex items-center gap-1.5 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                  </div>
                </div>

                {auditLoading && (
                  <div className="py-12 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                    <p className="text-xs text-slate-400">Loading audit trail...</p>
                  </div>
                )}

                {!auditLoading && auditEvents.length === 0 && (
                  <EmptyState
                    title="No Audit Records Found"
                    description="No platform governance or mutation events recorded for this tenant."
                    icon={History}
                  />
                )}

                {!auditLoading && auditEvents.length > 0 && (
                  <div className="space-y-4">
                    <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden shadow-xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono text-[10px]">
                            <th className="py-3.5 px-4 font-semibold">Timestamp</th>
                            <th className="py-3.5 px-4 font-semibold">Actor</th>
                            <th className="py-3.5 px-4 font-semibold">Action</th>
                            <th className="py-3.5 px-4 font-semibold">Result</th>
                            <th className="py-3.5 px-4 font-semibold">Reason / Ticket</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {auditEvents.map((evt) => (
                            <tr key={evt.id} className="hover:bg-slate-900/50 transition">
                              <td className="py-3.5 px-4 text-slate-400">
                                {new Date(evt.timestamp).toLocaleString()}
                              </td>
                              <td className="py-3.5 px-4 text-slate-300">
                                <span className="font-semibold text-indigo-400">{evt.actorRole}</span>
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-slate-200">
                                {evt.action}
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    evt.executionResult === 'SUCCESS'
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}
                                >
                                  {evt.executionResult}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-400">
                                {evt.reason || evt.ticketRef || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {auditTotal > 10 && (
                      <div className="flex items-center justify-between text-xs text-slate-400 px-2">
                        <div>
                          Page <span className="font-semibold text-slate-200">{auditPage}</span> of{' '}
                          <span className="font-semibold text-slate-200">
                            {Math.ceil(auditTotal / 10)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                            disabled={auditPage <= 1}
                            className="bg-slate-900 border border-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Previous
                          </button>
                          <button
                            onClick={() => setAuditPage((p) => p + 1)}
                            disabled={auditPage >= Math.ceil(auditTotal / 10)}
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
            )}

            {/* Suspend / Restore Confirmation Modal */}
            {modalAction && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="glass-panel w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      {modalAction === 'SUSPEND' ? (
                        <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-base font-bold text-white">
                          {modalAction === 'SUSPEND' ? 'Suspend Tenant Account' : 'Restore Tenant Account'}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {modalAction === 'SUSPEND'
                            ? 'Blocks new candidate attempts. Existing admins can still log in and view reports.'
                            : 'Re-enables new candidate test attempts and credit consumption.'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setModalAction(null)}
                      className="text-slate-400 hover:text-white text-xs p-1 rounded-lg hover:bg-slate-800 transition"
                    >
                      ✕
                    </button>
                  </div>

                  {modalError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300">
                      {modalError}
                    </div>
                  )}

                  <form onSubmit={handleModalSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Mandatory Reason <span className="text-red-400">*</span>
                        <span className="text-slate-500 font-normal ml-2">
                          ({modalReason.trim().length}/500 chars, min 10)
                        </span>
                      </label>
                      <textarea
                        required
                        minLength={10}
                        maxLength={500}
                        value={modalReason}
                        onChange={(e) => setModalReason(e.target.value)}
                        placeholder={
                          modalAction === 'SUSPEND'
                            ? 'Provide the compliance, billing, or security reason for suspension...'
                            : 'Provide the justification for restoring account access...'
                        }
                        rows={3}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Ticket / Reference ID <span className="text-slate-500 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={modalTicketRef}
                        onChange={(e) => setModalTicketRef(e.target.value)}
                        placeholder="e.g. SEC-4092, JIRA-102"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => setModalAction(null)}
                        className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-800 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={modalSubmitting || modalReason.trim().length < 10}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
                          modalAction === 'SUSPEND'
                            ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                        }`}
                      >
                        {modalSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {modalAction === 'SUSPEND' ? 'Confirm Suspension' : 'Confirm Restoration'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* License Tier Confirmation Modal */}
            {isTierModalOpen && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Award className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Update License Tier</h3>
                        <p className="text-[11px] text-slate-400">
                          Change tier label for <strong>{tenant?.overview.name}</strong> to{' '}
                          <span className="font-mono text-indigo-400 font-bold">{selectedTier}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsTierModalOpen(false)}
                      className="text-slate-400 hover:text-white text-xs p-1 rounded-lg hover:bg-slate-800 transition"
                    >
                      ✕
                    </button>
                  </div>

                  {tierError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300">
                      {tierError}
                    </div>
                  )}

                  <form onSubmit={handleTierSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Mandatory Justification Reason <span className="text-red-400">*</span>
                        <span className="text-slate-500 font-normal ml-2">
                          ({tierReason.trim().length}/500 chars, min 10)
                        </span>
                      </label>
                      <textarea
                        required
                        minLength={10}
                        maxLength={500}
                        value={tierReason}
                        onChange={(e) => setTierReason(e.target.value)}
                        placeholder="Provide the commercial, contract, or operational reason for tier change..."
                        rows={3}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Contract / Ticket Ref <span className="text-slate-500 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={tierTicketRef}
                        onChange={(e) => setTierTicketRef(e.target.value)}
                        placeholder="e.g. DEAL-884, CTR-2026-09"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => setIsTierModalOpen(false)}
                        className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-800 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={tierSubmitting || tierReason.trim().length < 10}
                        className="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
                      >
                        {tierSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Confirm Tier Change
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
