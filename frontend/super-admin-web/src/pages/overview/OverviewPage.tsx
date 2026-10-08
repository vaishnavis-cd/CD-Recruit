import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Activity,
  Users,
  AlertTriangle,
  Cpu,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  Loader2,
  HelpCircle,
  Clock,
  CreditCard,
  Layers,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { MOCK_OVERVIEW_METRICS } from '@/mocks/mockData';
import { ErrorState } from '@/components/common/ErrorState';
import { MockBadge } from '@/components/common/MockBadge';

interface OverviewMetricsData {
  tenants: {
    total: number;
    byStatus: {
      PROVISIONING: number;
      ACTIVE: number;
      SUSPENDED: number;
      OFFBOARDED: number;
    };
    byFunnelStage: {
      SIGNED_UP: number;
      TRIAL_ACTIVE: number;
      FIRST_DRIVE_CREATED: number;
      CONVERTED: number;
      DORMANT: number;
      UNKNOWN: number;
    };
    createdLast7Days: number;
    createdLast30Days: number;
  };
  drives: {
    active: number;
    total: number;
  };
  sessions: {
    liveNow: number;
    startedLast24h: number;
    completedLast24h: number;
  };
  attention: Array<{
    kind: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    count: number;
    label: string;
    link: string | null;
  }>;
  billing: {
    connected: boolean;
    pendingApprovals?: number;
    trialsExpiringSoon?: number;
    reconciliationStatus?: 'PASSED' | 'FAILED' | 'UNKNOWN';
    lastReconciledAt?: string | null;
  };
  infrastructure: {
    connected: boolean;
  };
  generatedAt: string;
}

export const OverviewPage: React.FC = () => {
  const isMock = import.meta.env.VITE_USE_MOCKS === 'true';

  const [metrics, setMetrics] = useState<OverviewMetricsData | null>(
    isMock ? (MOCK_OVERVIEW_METRICS as unknown as OverviewMetricsData) : null
  );
  const [loading, setLoading] = useState(!isMock);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const fetchOverview = useCallback(async (silent = false) => {
    if (isMock) {
      setMetrics(MOCK_OVERVIEW_METRICS as unknown as OverviewMetricsData);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<OverviewMetricsData>('/metrics/overview');
      setMetrics(data);
    } catch (err: any) {
      setError({
        message: err.message || 'Failed to fetch platform overview telemetry from backend.',
        status: err instanceof ApiError ? err.status : undefined,
      });
      if (!silent) setMetrics(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isMock]);

  useEffect(() => {
    fetchOverview();

    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      fetchOverview(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchOverview]);

  const totalFunnel = metrics
    ? Object.values(metrics.tenants.byFunnelStage).reduce((acc, c) => acc + c, 0)
    : 0;

  return (
    <div className="space-y-8">
      {/* Header & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#0d1424]">Platform Health & Metrics Radar</h1>
            <MockBadge />
          </div>
          <p className="text-xs text-[#64748b] mt-1">
            Real-time aggregate platform operations telemetry • PII-Blind Candidate Streams
          </p>
        </div>
        <div className="flex items-center gap-3">
          {metrics?.generatedAt && (
            <span className="text-[11px] text-[#64748b] font-mono flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-[#e2e8f0] shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-[#94a3b8]" />
              Updated {new Date(metrics.generatedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchOverview(false)}
            disabled={loading}
            className="bg-white hover:bg-[#f8fafc] text-[#0d1424] px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-[#e2e8f0] flex items-center gap-2 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link
            to="/tenants/new"
            className="bg-[#2f68ff] hover:bg-[#1e50ff] text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            + Onboard New Tenant
          </Link>
        </div>
      </div>

      {loading && (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#2f68ff] animate-spin" />
          <p className="text-xs text-[#64748b]">Loading live platform metrics...</p>
        </div>
      )}

      {error && !loading && (
        <ErrorState
          title="Platform Overview Telemetry Unavailable"
          message={error.message}
          status={error.status}
          onRetry={() => fetchOverview(false)}
        />
      )}

      {metrics && !loading && !error && (
        <>
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Tenants KPI */}
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[12px] font-bold tracking-wider text-[#94a3b8] block">Total Tenants</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-[#0d1424]">{metrics.tenants.total}</span>
                    <span className="text-xs font-medium text-emerald-600">
                      +{metrics.tenants.createdLast7Days} in 7d
                    </span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-[#eff6ff] text-[#2f68ff] flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3.5 pt-2.5 border-t border-[#f1f5f9] flex items-center gap-2 text-[11px] text-[#64748b]">
                <span className="text-emerald-700 font-semibold">{metrics.tenants.byStatus.ACTIVE} Active</span>
                <span>•</span>
                <span className="text-amber-700 font-semibold">{metrics.tenants.byStatus.SUSPENDED} Suspended</span>
                <span>•</span>
                <span>{metrics.tenants.createdLast30Days} in 30d</span>
              </div>
            </div>

            {/* Campus Drives */}
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[12px] font-bold tracking-wider text-[#94a3b8] block">Active Drives</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-[#0d1424]">{metrics.drives.active}</span>
                    <span className="text-xs text-[#64748b]">of {metrics.drives.total} total</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3.5 pt-2.5 border-t border-[#f1f5f9]">
                <p className="text-[11px] text-[#64748b]">Recruitment drives across all active tenants</p>
              </div>
            </div>

            {/* Live Sessions */}
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[12px] font-bold tracking-wider text-[#94a3b8] block">Live Sessions</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-[#0d1424]">{metrics.sessions.liveNow}</span>
                    <span className="inline-flex items-center text-[10px] font-mono font-bold bg-[#eff6ff] text-[#2f68ff] px-2 py-0.5 rounded-full border border-[#bfdbfe]">
                      IN PROGRESS
                    </span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3.5 pt-2.5 border-t border-[#f1f5f9]">
                <p className="text-[11px] text-[#64748b]">PII-blind concurrent test takers</p>
              </div>
            </div>

            {/* 24h Session Throughput */}
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[12px] font-bold tracking-wider text-[#94a3b8] block">24h Sessions</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-[#0d1424]">{metrics.sessions.startedLast24h}</span>
                    <span className="text-xs text-emerald-600 font-semibold">started</span>
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                  <Cpu className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3.5 pt-2.5 border-t border-[#f1f5f9]">
                <p className="text-[11px] text-[#64748b]">
                  <span className="text-[#0d1424] font-semibold">{metrics.sessions.completedLast24h}</span> completed in last 24h
                </p>
              </div>
            </div>
          </div>

          {/* Funnel Stage Breakdown Bar */}
          <div className="bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] space-y-4">
            <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#2f68ff]" />
                <h2 className="text-sm font-bold text-[#0d1424] tracking-tight">Lifecycle Funnel Breakdown</h2>
              </div>
              <span className="text-[11px] font-mono text-[#64748b]">
                {metrics.tenants.total} Total Organizations
              </span>
            </div>

            {/* Visual multi-segment bar */}
            <div className="w-full h-3 rounded-full bg-[#eff0f3] overflow-hidden flex border border-[#e2e8f0]">
              {totalFunnel > 0 ? (
                <>
                  <div
                    style={{ width: `${(metrics.tenants.byFunnelStage.SIGNED_UP / totalFunnel) * 100}%` }}
                    className="bg-blue-500 h-full transition-all"
                    title={`Signed Up: ${metrics.tenants.byFunnelStage.SIGNED_UP}`}
                  />
                  <div
                    style={{ width: `${(metrics.tenants.byFunnelStage.TRIAL_ACTIVE / totalFunnel) * 100}%` }}
                    className="bg-amber-500 h-full transition-all"
                    title={`Trial Active: ${metrics.tenants.byFunnelStage.TRIAL_ACTIVE}`}
                  />
                  <div
                    style={{ width: `${(metrics.tenants.byFunnelStage.FIRST_DRIVE_CREATED / totalFunnel) * 100}%` }}
                    className="bg-purple-500 h-full transition-all"
                    title={`First Drive Created: ${metrics.tenants.byFunnelStage.FIRST_DRIVE_CREATED}`}
                  />
                  <div
                    style={{ width: `${(metrics.tenants.byFunnelStage.CONVERTED / totalFunnel) * 100}%` }}
                    className="bg-emerald-500 h-full transition-all"
                    title={`Converted: ${metrics.tenants.byFunnelStage.CONVERTED}`}
                  />
                  <div
                    style={{ width: `${(metrics.tenants.byFunnelStage.DORMANT / totalFunnel) * 100}%` }}
                    className="bg-slate-400 h-full transition-all"
                    title={`Dormant: ${metrics.tenants.byFunnelStage.DORMANT}`}
                  />
                  <div
                    style={{ width: `${(metrics.tenants.byFunnelStage.UNKNOWN / totalFunnel) * 100}%` }}
                    className="bg-slate-300 h-full transition-all"
                    title={`Unknown: ${metrics.tenants.byFunnelStage.UNKNOWN}`}
                  />
                </>
              ) : (
                <div className="w-full bg-[#e2e8f0] h-full" />
              )}
            </div>

            {/* Funnel Stage Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
              <div className="bg-[#f8fafc] p-2.5 rounded-xl border border-[#e8ecf4]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[11px] text-[#64748b] font-medium">Signed Up</span>
                </div>
                <div className="text-base font-bold text-[#0d1424] mt-1">
                  {metrics.tenants.byFunnelStage.SIGNED_UP}
                </div>
              </div>

              <div className="bg-[#f8fafc] p-2.5 rounded-xl border border-[#e8ecf4]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-[11px] text-[#64748b] font-medium">Trial Active</span>
                </div>
                <div className="text-base font-bold text-[#0d1424] mt-1">
                  {metrics.tenants.byFunnelStage.TRIAL_ACTIVE}
                </div>
              </div>

              <div className="bg-[#f8fafc] p-2.5 rounded-xl border border-[#e8ecf4]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-[11px] text-[#64748b] font-medium">1st Drive</span>
                </div>
                <div className="text-base font-bold text-[#0d1424] mt-1">
                  {metrics.tenants.byFunnelStage.FIRST_DRIVE_CREATED}
                </div>
              </div>

              <div className="bg-[#f8fafc] p-2.5 rounded-xl border border-[#e8ecf4]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[11px] text-[#64748b] font-medium">Converted</span>
                </div>
                <div className="text-base font-bold text-[#0d1424] mt-1">
                  {metrics.tenants.byFunnelStage.CONVERTED}
                </div>
              </div>

              <div className="bg-[#f8fafc] p-2.5 rounded-xl border border-[#e8ecf4]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-500" />
                  <span className="text-[11px] text-[#64748b] font-medium">Dormant</span>
                </div>
                <div className="text-base font-bold text-[#0d1424] mt-1">
                  {metrics.tenants.byFunnelStage.DORMANT}
                </div>
              </div>

              <div className="bg-[#f8fafc] p-2.5 rounded-xl border border-[#e8ecf4] relative group">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="text-[11px] text-[#64748b] font-medium">Unknown</span>
                  <HelpCircle className="w-3 h-3 text-[#94a3b8] cursor-help" />
                </div>
                <div className="text-base font-bold text-[#0d1424] mt-1">
                  {metrics.tenants.byFunnelStage.UNKNOWN}
                </div>
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 bg-slate-900 text-white text-[11px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                  Billing not connected yet
                </div>
              </div>
            </div>
          </div>

          {/* Attention Radar & Subsystem Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Needs Attention Radar */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] space-y-4">
              <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-[#0d1424] tracking-tight">Needs Attention Radar</h2>
                </div>
                <span className="text-[11px] font-mono text-[#64748b]">
                  {metrics.attention.length} Active Items
                </span>
              </div>

              <div className="space-y-3">
                {metrics.attention.length > 0 ? (
                  metrics.attention.map((item, idx) => (
                    <div
                      key={`${item.kind}-${idx}`}
                      className="bg-[#f8fafc] border border-[#e8ecf4] rounded-xl p-3.5 flex items-center justify-between hover:border-[#cbd5e1] transition"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 p-1.5 rounded-lg ${
                            item.severity === 'HIGH'
                              ? 'bg-rose-50 text-rose-600 border border-rose-200'
                              : item.severity === 'MEDIUM'
                              ? 'bg-amber-50 text-amber-600 border border-amber-200'
                              : 'bg-blue-50 text-blue-600 border border-blue-200'
                          }`}
                        >
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#0d1424]">{item.label}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white text-[#64748b] border border-[#e2e8f0]">
                              Count: {item.count}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#64748b] mt-0.5">
                            Severity: <span className="font-semibold text-[#0d1424]">{item.severity}</span>
                          </p>
                        </div>
                      </div>

                      {item.link ? (
                        <Link
                          to={item.link}
                          className="text-xs font-semibold text-[#2f68ff] hover:text-[#1e50ff] flex items-center gap-1 bg-[#eff6ff] hover:bg-blue-100 px-2.5 py-1.5 rounded-lg border border-[#bfdbfe] transition cursor-pointer"
                        >
                          Review <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span className="text-xs text-[#94a3b8] italic">No link</span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    <p className="text-xs text-[#64748b]">All tenant invariants healthy. No items require attention.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Subsystem Integration Cards */}
            <div className="space-y-6">
              {/* Billing Subsystem Card */}
              <div className="bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] space-y-4">
                <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                    <h2 className="text-sm font-bold text-[#0d1424] tracking-tight">Billing Subsystem</h2>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                      metrics.billing.connected
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-[#f1f5f9] text-[#64748b] border border-[#e2e8f0]'
                    }`}
                  >
                    {metrics.billing.connected ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>

                {!metrics.billing.connected ? (
                  <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e8ecf4] text-center space-y-1.5">
                    <p className="text-xs text-[#0d1424] font-medium">Billing not connected yet</p>
                    <p className="text-[11px] text-[#64748b]">Commercial ledger integration pending Half 2 merge.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {metrics.billing.pendingApprovals !== undefined && (
                      <div className="flex justify-between items-center bg-[#f8fafc] p-2.5 rounded-lg border border-[#e8ecf4]">
                        <span className="text-[#64748b]">Pending Approvals</span>
                        <span className="font-semibold text-[#0d1424]">{metrics.billing.pendingApprovals}</span>
                      </div>
                    )}
                    {metrics.billing.trialsExpiringSoon !== undefined && (
                      <div className="flex justify-between items-center bg-[#f8fafc] p-2.5 rounded-lg border border-[#e8ecf4]">
                        <span className="text-[#64748b]">Trials Expiring (7d)</span>
                        <span className="font-semibold text-[#0d1424]">{metrics.billing.trialsExpiringSoon}</span>
                      </div>
                    )}
                    {metrics.billing.reconciliationStatus && (
                      <div className="flex justify-between items-center bg-[#f8fafc] p-2.5 rounded-lg border border-[#e8ecf4]">
                        <span className="text-[#64748b]">Reconciliation Status</span>
                        <span className="font-mono font-semibold text-emerald-700">{metrics.billing.reconciliationStatus}</span>
                      </div>
                    )}
                    {metrics.billing.lastReconciledAt && (
                      <div className="flex justify-between items-center bg-[#f8fafc] p-2.5 rounded-lg border border-[#e8ecf4]">
                        <span className="text-[#64748b]">Last Reconciled</span>
                        <span className="font-mono text-[11px] text-[#0d1424]">
                          {new Date(metrics.billing.lastReconciledAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Infrastructure Telemetry Card */}
              <div className="bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] space-y-4">
                <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-600" />
                    <h2 className="text-sm font-bold text-[#0d1424] tracking-tight">Infrastructure Telemetry</h2>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-[#f1f5f9] text-[#64748b] border border-[#e2e8f0]">
                    NOT CONNECTED
                  </span>
                </div>
                <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e8ecf4] text-center space-y-1.5">
                  <p className="text-xs text-[#0d1424] font-medium">Telemetry not connected</p>
                  <p className="text-[11px] text-[#64748b]">Judge0 / MinIO / LLM live cluster telemetry not available.</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
