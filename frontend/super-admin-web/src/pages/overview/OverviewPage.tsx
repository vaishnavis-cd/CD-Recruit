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
            <h1 className="text-2xl font-bold tracking-tight text-white">Platform Health & Metrics Radar</h1>
            <MockBadge />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time aggregate platform operations telemetry • PII-Blind Candidate Streams
          </p>
        </div>
        <div className="flex items-center gap-3">
          {metrics?.generatedAt && (
            <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Updated {new Date(metrics.generatedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchOverview(false)}
            disabled={loading}
            className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-800 flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link
            to="/onboarding"
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-lg shadow-indigo-500/20 transition flex items-center gap-1.5"
          >
            + Onboard New Tenant
          </Link>
        </div>
      </div>

      {loading && (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs text-slate-400">Loading live platform metrics...</p>
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
            <div className="glass-panel rounded-2xl p-5 border border-slate-800/90 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Total Tenants</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">{metrics.tenants.total}</span>
                <span className="text-xs font-medium text-emerald-400">
                  +{metrics.tenants.createdLast7Days} in 7d
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="text-emerald-400 font-medium">{metrics.tenants.byStatus.ACTIVE} Active</span>
                <span>•</span>
                <span className="text-amber-400 font-medium">{metrics.tenants.byStatus.SUSPENDED} Suspended</span>
                <span>•</span>
                <span>{metrics.tenants.createdLast30Days} in 30d</span>
              </div>
            </div>

            {/* Campus Drives */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-800/90 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Active Drives</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">{metrics.drives.active}</span>
                <span className="text-xs text-slate-400">of {metrics.drives.total} total</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2.5">Recruitment drives across all active tenants</p>
            </div>

            {/* Live Sessions */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-800/90 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Live Sessions</span>
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">{metrics.sessions.liveNow}</span>
                <span className="text-[10px] font-mono bg-violet-500/10 text-violet-300 px-1.5 py-0.5 rounded border border-violet-500/20">
                  IN PROGRESS
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2.5">PII-blind concurrent test takers</p>
            </div>

            {/* 24h Session Throughput */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-800/90 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">24h Sessions</span>
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                  <Cpu className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">{metrics.sessions.startedLast24h}</span>
                <span className="text-xs text-emerald-400">started</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2.5">
                <span className="text-slate-200 font-semibold">{metrics.sessions.completedLast24h}</span> completed in last 24h
              </p>
            </div>
          </div>

          {/* Funnel Stage Breakdown Bar */}
          <div className="glass-panel rounded-2xl p-6 border border-slate-800/90 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-bold text-white tracking-tight">Lifecycle Funnel Breakdown</h2>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {metrics.tenants.total} Total Organizations
              </span>
            </div>

            {/* Visual multi-segment bar */}
            <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden flex border border-slate-800">
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
                    className="bg-slate-600 h-full transition-all"
                    title={`Dormant: ${metrics.tenants.byFunnelStage.DORMANT}`}
                  />
                  <div
                    style={{ width: `${(metrics.tenants.byFunnelStage.UNKNOWN / totalFunnel) * 100}%` }}
                    className="bg-slate-800 h-full transition-all"
                    title={`Unknown: ${metrics.tenants.byFunnelStage.UNKNOWN}`}
                  />
                </>
              ) : (
                <div className="w-full bg-slate-800 h-full" />
              )}
            </div>

            {/* Funnel Stage Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[11px] text-slate-400 font-medium">Signed Up</span>
                </div>
                <div className="text-base font-bold text-white mt-1">
                  {metrics.tenants.byFunnelStage.SIGNED_UP}
                </div>
              </div>

              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-[11px] text-slate-400 font-medium">Trial Active</span>
                </div>
                <div className="text-base font-bold text-white mt-1">
                  {metrics.tenants.byFunnelStage.TRIAL_ACTIVE}
                </div>
              </div>

              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-[11px] text-slate-400 font-medium">1st Drive</span>
                </div>
                <div className="text-base font-bold text-white mt-1">
                  {metrics.tenants.byFunnelStage.FIRST_DRIVE_CREATED}
                </div>
              </div>

              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[11px] text-slate-400 font-medium">Converted</span>
                </div>
                <div className="text-base font-bold text-white mt-1">
                  {metrics.tenants.byFunnelStage.CONVERTED}
                </div>
              </div>

              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-600" />
                  <span className="text-[11px] text-slate-400 font-medium">Dormant</span>
                </div>
                <div className="text-base font-bold text-white mt-1">
                  {metrics.tenants.byFunnelStage.DORMANT}
                </div>
              </div>

              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 relative group">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-500" />
                  <span className="text-[11px] text-slate-400 font-medium">Unknown</span>
                  <HelpCircle className="w-3 h-3 text-slate-500 cursor-help" />
                </div>
                <div className="text-base font-bold text-white mt-1">
                  {metrics.tenants.byFunnelStage.UNKNOWN}
                </div>
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 bg-slate-950 text-slate-300 text-[11px] px-2 py-1 rounded shadow-lg border border-slate-800 whitespace-nowrap">
                  Billing not connected yet
                </div>
              </div>
            </div>
          </div>

          {/* Attention Radar & Subsystem Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Needs Attention Radar */}
            <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-slate-800/90 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-white tracking-tight">Needs Attention Radar</h2>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {metrics.attention.length} Active Items
                </span>
              </div>

              <div className="space-y-3">
                {metrics.attention.length > 0 ? (
                  metrics.attention.map((item, idx) => (
                    <div
                      key={`${item.kind}-${idx}`}
                      className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-700 transition"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 p-1.5 rounded-lg ${
                            item.severity === 'HIGH'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : item.severity === 'MEDIUM'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-200">{item.label}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              Count: {item.count}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Severity: <span className="font-semibold">{item.severity}</span>
                          </p>
                        </div>
                      </div>

                      {item.link ? (
                        <Link
                          to={item.link}
                          className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1.5 rounded-lg border border-indigo-500/20 transition"
                        >
                          Review <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-500 italic">No link</span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    <p className="text-xs text-slate-400">All tenant invariants healthy. No items require attention.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Subsystem Integration Cards */}
            <div className="space-y-6">
              {/* Billing Subsystem Card */}
              <div className="glass-panel rounded-2xl p-6 border border-slate-800/90 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-bold text-white tracking-tight">Billing Subsystem</h2>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                      metrics.billing.connected
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {metrics.billing.connected ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>

                {!metrics.billing.connected ? (
                  <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-center space-y-1.5">
                    <p className="text-xs text-slate-300 font-medium">Billing not connected yet</p>
                    <p className="text-[11px] text-slate-500">Commercial ledger integration pending Half 2 merge.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {metrics.billing.pendingApprovals !== undefined && (
                      <div className="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                        <span className="text-slate-400">Pending Approvals</span>
                        <span className="font-semibold text-slate-200">{metrics.billing.pendingApprovals}</span>
                      </div>
                    )}
                    {metrics.billing.trialsExpiringSoon !== undefined && (
                      <div className="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                        <span className="text-slate-400">Trials Expiring (7d)</span>
                        <span className="font-semibold text-slate-200">{metrics.billing.trialsExpiringSoon}</span>
                      </div>
                    )}
                    {metrics.billing.reconciliationStatus && (
                      <div className="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                        <span className="text-slate-400">Reconciliation Status</span>
                        <span className="font-mono font-semibold text-emerald-400">{metrics.billing.reconciliationStatus}</span>
                      </div>
                    )}
                    {metrics.billing.lastReconciledAt && (
                      <div className="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                        <span className="text-slate-400">Last Reconciled</span>
                        <span className="font-mono text-[11px] text-slate-300">
                          {new Date(metrics.billing.lastReconciledAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Infrastructure Telemetry Card */}
              <div className="glass-panel rounded-2xl p-6 border border-slate-800/90 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-sm font-bold text-white tracking-tight">Infrastructure Telemetry</h2>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                    NOT CONNECTED
                  </span>
                </div>
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-center space-y-1.5">
                  <p className="text-xs text-slate-300 font-medium">Telemetry not connected</p>
                  <p className="text-[11px] text-slate-500">Judge0 / MinIO / LLM live cluster telemetry not available.</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
