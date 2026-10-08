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
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { MOCK_TENANT_DETAIL } from '@/mocks/mockData';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { MockBadge } from '@/components/common/MockBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { TenantBillingTab } from './components/TenantBillingTab';

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
    billingAccountId?: string | null;
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
          className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 mb-3 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Tenants Directory
        </Link>

        {loading && (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-[#2f68ff] animate-spin" />
            <p className="text-xs text-slate-500">Loading tenant details...</p>
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
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#2f68ff] to-[#4379ff] flex items-center justify-center font-bold text-xl text-white shadow-sm">
                  {tenant.overview.name?.[0] || 'T'}
                </div>
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">{tenant.overview.name}</h1>
                    <MockBadge />
                    <StatusBadge status={tenant.overview.status} dot />
                    <span className="font-mono text-slate-700 text-xs bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                      Tier: {tenant.licensing.licenseTier}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    Domain: <span className="text-[#2f68ff]">{tenant.overview.domain || tenant.overview.slug || '—'}</span> • Tenant ID: {tenant.overview.id}
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
                    className="bg-[#fef3f2] hover:bg-[#fee4e2] text-[#f04438] border border-[#fecdca] px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
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
                    className="bg-[#ecfdf3] hover:bg-[#d1fadf] text-[#12b76a] border border-[#a6f4c5] px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Restore Tenant
                  </button>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchTenant}
                  icon={RefreshCw}
                >
                  Refresh
                </Button>

                <button
                  onClick={handleImpersonate}
                  className="bg-[#fffbeb] hover:bg-[#fef0c7] text-[#b54708] border border-[#fedf89] px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  <UserCheck className="w-3.5 h-3.5" /> Launch 30-Min Impersonation
                </button>
              </div>
            </div>

            {/* Suspended Red Banner */}
            {tenant.overview.status === 'SUSPENDED' && (
              <div className="mt-4 bg-[#fef3f2] border border-[#fecdca] rounded-2xl p-4 flex items-start gap-3.5 shadow-xs">
                <AlertTriangle className="w-5 h-5 text-[#f04438] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-[#f04438]">
                    Suspended: new test attempts are blocked. Admins can still log in and view reports.
                  </h4>
                  <div className="text-xs text-[#d92d20] flex flex-wrap gap-x-4 gap-y-1">
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
            <div className="flex border-b border-[#e8ecf4] space-x-1 pt-4">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                      isActive
                        ? 'border-[#2f68ff] text-[#2f68ff] bg-[#eff6ff]/60'
                        : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
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
                  <div className="bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">Governance & Retention Settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e8ecf4] space-y-1">
                        <span className="text-slate-500">Appeal Window Days Override</span>
                        <p className="text-base font-bold text-slate-900">
                          {tenant.retention.appealWindowDaysOverride !== null
                            ? `${tenant.retention.appealWindowDaysOverride} Days`
                            : 'Standard Policy (7 Days)'}
                        </p>
                        <p className="text-[11px] text-slate-500">Configured dispute and evidence appeal window</p>
                      </div>

                      <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e8ecf4] space-y-1">
                        <span className="text-slate-500">Domain Verification Status</span>
                        <p className="text-base font-bold text-slate-900">
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

                  <div className="bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">Onboarding & Walkthrough Progress</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e8ecf4] space-y-1">
                        <span className="text-slate-500">Walkthrough Completed</span>
                        <p className="text-base font-bold text-slate-900">
                          {tenant.overview.walkthroughCompletedAt ? 'Completed' : 'In Progress'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {tenant.overview.walkthroughCompletedAt
                            ? new Date(tenant.overview.walkthroughCompletedAt).toLocaleString()
                            : 'Pending operator walkthrough checklist'}
                        </p>
                      </div>

                      <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e8ecf4] space-y-1">
                        <span className="text-slate-500">Internal Account Owner</span>
                        <p className="text-base font-bold text-slate-900">
                          {tenant.overview.internalOwnerId || 'Unassigned'}
                        </p>
                        <p className="text-[11px] text-slate-500">Designated platform operations lead</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">Organization Metadata</h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Organization Name</span>
                      <span className="text-slate-900 font-semibold">{tenant.overview.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Slug Identifier</span>
                      <span className="text-slate-900 font-mono">{tenant.overview.slug}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Corporate Domain</span>
                      <span className="text-[#2f68ff] font-mono">{tenant.overview.domain || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Provisioned Date</span>
                      <span className="text-slate-700 font-mono">
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
                  <h3 className="text-sm font-bold text-slate-900">
                    Campus Drives ({tenant.drives.driveCount})
                  </h3>
                  <span className="text-xs text-slate-500">
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
                  <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#f8fafc] border-b border-[#e8ecf4] text-slate-500 uppercase tracking-wider font-mono text-[10px]">
                          <th className="py-3.5 px-4 font-semibold">Drive Name</th>
                          <th className="py-3.5 px-4 font-semibold">Status</th>
                          <th className="py-3.5 px-4 font-semibold text-right">Invites Sent</th>
                          <th className="py-3.5 px-4 font-semibold text-right">Sessions Started</th>
                          <th className="py-3.5 px-4 font-semibold text-right">Sessions Completed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8ecf4]">
                        {tenant.drives.items.map((drive) => (
                          <tr key={drive.id} className="hover:bg-[#f8fafc]/70 transition">
                            <td className="py-4 px-4 font-semibold text-slate-900">{drive.name}</td>
                            <td className="py-4 px-4">
                              <span className="font-mono text-slate-700 text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {drive.status}
                              </span>
                            </td>
                            <td className="py-4 px-4 font-mono text-right text-slate-700">
                              {drive.invitesSent}
                            </td>
                            <td className="py-4 px-4 font-mono text-right text-[#2f68ff]">
                              {drive.sessionsStarted}
                            </td>
                            <td className="py-4 px-4 font-mono text-right text-[#12b76a] font-semibold">
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
              <TenantBillingTab
                tenantId={id || ''}
                billingAccountId={tenant?.billing?.billingAccountId}
              />
            )}

            {/* Tab 4: Licensing Tier */}
            {activeTab === 'LICENSING' && (
              <div className="pt-2 max-w-xl space-y-6">
                <div className="bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">License Edition Tier</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Manage the contractual edition label for this tenant.</p>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                      Tier Label
                    </span>
                  </div>

                  <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e8ecf4] space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-slate-500 text-xs block">Current Edition Tier</span>
                        <span className="text-lg font-bold text-[#2f68ff] font-mono">
                          {tenant.licensing.licenseTier}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#e8ecf4] space-y-3">
                      <label className="block text-xs font-semibold text-slate-700">
                        Change Edition Tier
                      </label>
                      <div className="flex items-center gap-3">
                        <select
                          value={selectedTier}
                          onChange={(e) => setSelectedTier(e.target.value)}
                          className="bg-white border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#2f68ff] flex-1"
                        >
                          <option value="STARTER">STARTER</option>
                          <option value="GROWTH">GROWTH</option>
                          <option value="ENTERPRISE">ENTERPRISE</option>
                        </select>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setTierReason('');
                            setTierTicketRef('');
                            setTierError(null);
                            setIsTierModalOpen(true);
                          }}
                          disabled={selectedTier === tenant.licensing.licenseTier}
                        >
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Scope note */}
                  <div className="p-3.5 bg-[#fffbeb] border border-[#fedf89] rounded-xl flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-[#d97706] shrink-0 mt-0.5" />
                    <p className="text-[11px] text-[#b54708] leading-relaxed">
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
                  <h3 className="text-sm font-bold text-slate-900">
                    Tenant Audit Log ({auditTotal})
                  </h3>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/audit?targetTenantId=${tenant.overview.id}`}
                      className="bg-[#eff6ff] hover:bg-[#dbeafe] text-[#2f68ff] border border-[#bfdbfe] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                    >
                      <History className="w-3.5 h-3.5" /> Open in Audit Explorer
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => fetchAuditEvents(auditPage)}
                      disabled={auditLoading}
                      icon={RefreshCw}
                      className={auditLoading ? '[&_svg]:animate-spin' : ''}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>

                {auditLoading && (
                  <div className="py-12 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 text-[#2f68ff] animate-spin" />
                    <p className="text-xs text-slate-500">Loading audit trail...</p>
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
                    <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#f8fafc] border-b border-[#e8ecf4] text-slate-500 uppercase tracking-wider font-mono text-[10px]">
                            <th className="py-3.5 px-4 font-semibold">Timestamp</th>
                            <th className="py-3.5 px-4 font-semibold">Actor</th>
                            <th className="py-3.5 px-4 font-semibold">Action</th>
                            <th className="py-3.5 px-4 font-semibold">Result</th>
                            <th className="py-3.5 px-4 font-semibold">Reason / Ticket</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e8ecf4] font-mono text-[11px]">
                          {auditEvents.map((evt) => (
                            <tr key={evt.id} className="hover:bg-[#f8fafc]/70 transition">
                              <td className="py-3.5 px-4 text-slate-500">
                                {new Date(evt.timestamp).toLocaleString()}
                              </td>
                              <td className="py-3.5 px-4 text-slate-700">
                                <span className="font-semibold text-[#2f68ff]">{evt.actorRole}</span>
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-slate-900">
                                {evt.action}
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    evt.executionResult === 'SUCCESS'
                                      ? 'bg-[#ecfdf3] text-[#12b76a] border-[#a6f4c5]'
                                      : 'bg-[#fef3f2] text-[#f04438] border-[#fecdca]'
                                  }`}
                                >
                                  {evt.executionResult}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-500">
                                {evt.reason || evt.ticketRef || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {auditTotal > 10 && (
                      <div className="flex items-center justify-between text-xs text-slate-500 px-2">
                        <div>
                          Page <span className="font-semibold text-slate-900">{auditPage}</span> of{' '}
                          <span className="font-semibold text-slate-900">
                            {Math.ceil(auditTotal / 10)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                            disabled={auditPage <= 1}
                            className="bg-white border border-[#e2e8f0] text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 shadow-xs font-semibold"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Previous
                          </button>
                          <button
                            onClick={() => setAuditPage((p) => p + 1)}
                            disabled={auditPage >= Math.ceil(auditTotal / 10)}
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
            )}

            {/* Suspend / Restore Confirmation Modal */}
            {modalAction && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                <div className="w-full max-w-lg rounded-2xl border border-[#e8ecf4] bg-white p-6 shadow-2xl space-y-5">
                  <div className="flex items-center justify-between border-b border-[#e8ecf4] pb-3">
                    <div className="flex items-center gap-2.5">
                      {modalAction === 'SUSPEND' ? (
                        <div className="w-8 h-8 rounded-xl bg-[#fef3f2] border border-[#fecdca] flex items-center justify-center text-[#f04438]">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-xl bg-[#ecfdf3] border border-[#a6f4c5] flex items-center justify-center text-[#12b76a]">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          {modalAction === 'SUSPEND' ? 'Suspend Tenant Account' : 'Restore Tenant Account'}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {modalAction === 'SUSPEND'
                            ? 'Blocks new candidate attempts. Existing admins can still log in and view reports.'
                            : 'Re-enables new candidate test attempts and credit consumption.'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setModalAction(null)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {modalError && (
                    <div className="p-3 bg-[#fef3f2] border border-[#fecdca] rounded-xl text-xs text-[#f04438]">
                      {modalError}
                    </div>
                  )}

                  <form onSubmit={handleModalSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Mandatory Reason <span className="text-[#f04438]">*</span>
                        <span className="text-slate-400 font-normal ml-2">
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
                        className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white resize-none font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Ticket / Reference ID <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={modalTicketRef}
                        onChange={(e) => setModalTicketRef(e.target.value)}
                        placeholder="e.g. SEC-4092, JIRA-102"
                        className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white font-mono"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#e8ecf4]">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setModalAction(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant={modalAction === 'SUSPEND' ? 'danger' : 'primary'}
                        disabled={modalSubmitting || modalReason.trim().length < 10}
                        loading={modalSubmitting}
                      >
                        {modalAction === 'SUSPEND' ? 'Confirm Suspension' : 'Confirm Restoration'}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* License Tier Confirmation Modal */}
            {isTierModalOpen && (
              <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white border border-[#e8ecf4] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-3 border-b border-[#e8ecf4]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-[#eff6ff] border border-[#dbeafe] flex items-center justify-center text-[#2f68ff]">
                        <Award className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Update License Tier</h3>
                        <p className="text-[11px] text-slate-500">
                          Change tier label for <strong>{tenant?.overview.name}</strong> to{' '}
                          <span className="font-mono text-[#2f68ff] font-bold">{selectedTier}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsTierModalOpen(false)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {tierError && (
                    <div className="p-3 bg-[#fef3f2] border border-[#fecdca] rounded-xl text-xs text-[#f04438]">
                      {tierError}
                    </div>
                  )}

                  <form onSubmit={handleTierSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Mandatory Justification Reason <span className="text-[#f04438]">*</span>
                        <span className="text-slate-400 font-normal ml-2">
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
                        className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white resize-none font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Contract / Ticket Ref <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={tierTicketRef}
                        onChange={(e) => setTierTicketRef(e.target.value)}
                        placeholder="e.g. DEAL-884, CTR-2026-09"
                        className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white font-mono"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#e8ecf4]">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setIsTierModalOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={tierSubmitting || tierReason.trim().length < 10}
                        loading={tierSubmitting}
                      >
                        Confirm Tier Change
                      </Button>
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
