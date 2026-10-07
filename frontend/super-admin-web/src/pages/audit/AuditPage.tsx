import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  History,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Download,
  ExternalLink,
  ChevronRight,
  X,
  Clock,
  Layers,
  FileCode,
  Tag,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { MOCK_AUDIT_LOGS } from '@/mocks/mockData';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { MockBadge } from '@/components/common/MockBadge';

interface CommonAuditEvent {
  id: string;
  source: 'PLATFORM' | 'BILLING';
  occurredAt: string;
  actorId: string;
  actorRole: string;
  subjectType: string;
  subjectId: string;
  action: string;
  targetTenantId: string | null;
  tenantName: string | null;
  reason: string | null;
  ticketRef: string | null;
  executionResult: string;
  requestId: string | null;
  hasDiff: boolean;
}

interface AuditEventDetail extends CommonAuditEvent {
  impersonationContext: any;
  before: any;
  after: any;
  changes: Array<{ path: string; before: any; after: any }>;
}

interface FilterOptions {
  actions: string[];
  actors: Array<{ id: string; role: string }>;
  subjectTypes: string[];
}

export const AuditPage: React.FC = () => {
  const isMock = import.meta.env.VITE_USE_MOCKS === 'true';
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters State
  const initialTenantId = searchParams.get('targetTenantId') || '';
  const [source, setSource] = useState<'ALL' | 'PLATFORM' | 'BILLING'>('ALL');
  const [search, setSearch] = useState('');
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [targetTenantId, setTargetTenantId] = useState(initialTenantId);
  const [ticketRef, setTicketRef] = useState('');
  const [result, setResult] = useState<'ALL' | 'SUCCESS' | 'FAILED'>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Data State
  const [events, setEvents] = useState<CommonAuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  // Filters metadata
  const [filtersMetadata, setFiltersMetadata] = useState<FilterOptions>({
    actions: [],
    actors: [],
    subjectTypes: [],
  });

  // Drawer Detail State
  const [selectedEventId, setSelectedEventId] = useState<{ source: string; id: string } | null>(null);
  const [eventDetail, setEventDetail] = useState<AuditEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Fetch filter options
  const fetchFiltersMetadata = useCallback(async () => {
    if (isMock) return;
    try {
      const res = await apiFetch<{ ok: boolean; filters: FilterOptions }>('/audit/filters');
      if (res.ok && res.filters) {
        setFiltersMetadata(res.filters);
      }
    } catch (err) {
      console.warn('Failed to load filter metadata', err);
    }
  }, [isMock]);

  // Query events
  const fetchEvents = useCallback(
    async (cursor?: string | null, append = false) => {
      if (isMock) {
        const mockMapped = MOCK_AUDIT_LOGS.map((m: any) => ({
          id: m.id,
          source: 'PLATFORM' as const,
          occurredAt: m.createdAt,
          actorId: m.actorId,
          actorRole: 'OWNER',
          subjectType: 'SYSTEM',
          subjectId: m.tenantId || m.actorId,
          action: m.eventType,
          targetTenantId: m.tenantId || null,
          tenantName: null,
          reason: null,
          ticketRef: null,
          executionResult: 'SUCCESS',
          requestId: null,
          hasDiff: Boolean(m.payload),
        }));
        setEvents(mockMapped);
        setNextCursor(null);
        setLoading(false);
        return;
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        if (source !== 'ALL') queryParams.set('source', source);
        if (search.trim()) queryParams.set('search', search.trim());
        if (actorId) queryParams.set('actorId', actorId);
        if (action) queryParams.set('action', action);
        if (subjectType) queryParams.set('subjectType', subjectType);
        if (targetTenantId.trim()) queryParams.set('targetTenantId', targetTenantId.trim());
        if (ticketRef.trim()) queryParams.set('ticketRef', ticketRef.trim());
        if (result !== 'ALL') queryParams.set('result', result);
        if (fromDate) queryParams.set('from', new Date(fromDate).toISOString());
        if (toDate) {
          const endOfDay = new Date(toDate);
          endOfDay.setHours(23, 59, 59, 999);
          queryParams.set('to', endOfDay.toISOString());
        }
        if (cursor) queryParams.set('cursor', cursor);
        queryParams.set('limit', '50');

        const res = await apiFetch<{
          ok: boolean;
          items: CommonAuditEvent[];
          nextCursor: string | null;
        }>(`/audit/events?${queryParams.toString()}`);

        if (append) {
          setEvents((prev) => [...prev, ...(res.items || [])]);
        } else {
          setEvents(res.items || []);
        }
        setNextCursor(res.nextCursor || null);
      } catch (err: any) {
        setError({
          message: err.message || 'Failed to fetch platform audit log stream.',
          status: err instanceof ApiError ? err.status : undefined,
        });
        if (!append) setEvents([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [isMock, source, search, actorId, action, subjectType, targetTenantId, ticketRef, result, fromDate, toDate]
  );

  // Initial load
  useEffect(() => {
    fetchFiltersMetadata();
  }, [fetchFiltersMetadata]);

  useEffect(() => {
    fetchEvents(null, false);
  }, [fetchEvents]);

  // Fetch Event Detail for Drawer
  const fetchEventDetail = async (evtSource: string, evtId: string) => {
    setSelectedEventId({ source: evtSource, id: evtId });
    setEventDetail(null);
    setDetailLoading(true);
    setDetailError(null);

    if (isMock) {
      const found = MOCK_AUDIT_LOGS.find((m) => m.id === evtId);
      setEventDetail(
        found
          ? {
              id: found.id,
              source: 'PLATFORM',
              occurredAt: found.createdAt,
              actorId: found.actorId,
              actorRole: 'OWNER',
              subjectType: 'SYSTEM',
              subjectId: found.tenantId || found.actorId,
              action: found.eventType,
              targetTenantId: found.tenantId || null,
              tenantName: null,
              reason: null,
              ticketRef: null,
              executionResult: 'SUCCESS',
              requestId: 'req_mock_123',
              hasDiff: Boolean(found.payload),
              impersonationContext: null,
              before: null,
              after: found.payload || null,
              changes: found.payload
                ? Object.entries(found.payload).map(([k, v]) => ({
                    path: k,
                    before: null,
                    after: v,
                  }))
                : [],
            }
          : null
      );
      setDetailLoading(false);
      return;
    }

    try {
      const res = await apiFetch<{ ok: boolean; event: AuditEventDetail }>(
        `/audit/events/${evtSource}/${evtId}`
      );
      if (res.ok && res.event) {
        setEventDetail(res.event);
      } else {
        setDetailError('Event details could not be retrieved.');
      }
    } catch (err: any) {
      setDetailError(err.message || 'Failed to load audit event details.');
    } finally {
      setDetailLoading(false);
    }
  };

  // CSV Export Trigger
  const handleExportCsv = async () => {
    setExporting(true);
    setExportNotice(null);
    try {
      const queryParams = new URLSearchParams();
      if (source !== 'ALL') queryParams.set('source', source);
      if (search.trim()) queryParams.set('search', search.trim());
      if (actorId) queryParams.set('actorId', actorId);
      if (action) queryParams.set('action', action);
      if (subjectType) queryParams.set('subjectType', subjectType);
      if (targetTenantId.trim()) queryParams.set('targetTenantId', targetTenantId.trim());
      if (ticketRef.trim()) queryParams.set('ticketRef', ticketRef.trim());
      if (result !== 'ALL') queryParams.set('result', result);
      if (fromDate) queryParams.set('from', new Date(fromDate).toISOString());
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        queryParams.set('to', endOfDay.toISOString());
      }

      const token = localStorage.getItem('platform_token');
      const res = await fetch(`/api/v1/platform/audit/export?${queryParams.toString()}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) {
        throw new Error('Export request failed');
      }

      const isTruncated = res.headers.get('X-Truncated') === 'true';
      if (isTruncated) {
        setExportNotice('Export file exceeded 10,000 records and was truncated to the latest 10,000 events.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Export failed: ${err.message || err}`);
    } finally {
      setExporting(false);
    }
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSearch('');
    setActorId('');
    setAction('');
    setSubjectType('');
    setTargetTenantId('');
    setTicketRef('');
    setResult('ALL');
    setFromDate('');
    setToDate('');
    setSearchParams({});
  };

  const hasActiveFilters =
    Boolean(search.trim()) ||
    Boolean(actorId) ||
    Boolean(action) ||
    Boolean(subjectType) ||
    Boolean(targetTenantId.trim()) ||
    Boolean(ticketRef.trim()) ||
    result !== 'ALL' ||
    Boolean(fromDate) ||
    Boolean(toDate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <History className="w-6 h-6 text-indigo-400" />
              Unified Platform Audit Explorer
            </h1>
            <MockBadge />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tamper-proof append-only telemetry protected by database invariant triggers across Platform & Billing schemas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            disabled={exporting || loading}
            className="bg-slate-900 hover:bg-slate-800 text-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-800 flex items-center gap-2 transition shadow-md disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            )}
            Export CSV
          </button>
          <button
            onClick={() => fetchEvents(null, false)}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-md shadow-indigo-600/20 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Truncation notice */}
      {exportNotice && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{exportNotice}</span>
          </div>
          <button onClick={() => setExportNotice(null)} className="text-amber-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Source Selection Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
        <button
          onClick={() => setSource('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            source === 'ALL'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> All Schemas
        </button>
        <button
          onClick={() => setSource('PLATFORM')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            source === 'PLATFORM'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-indigo-400" /> Platform Operations
        </button>
        <button
          onClick={() => setSource('BILLING')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            source === 'BILLING'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Billing Ledger
        </button>
      </div>

      {/* Search & Comprehensive Filters Panel */}
      <div className="glass-panel rounded-2xl p-4 border border-slate-800/90 space-y-3 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Free text search */}
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search action, reason, ticket, or subject ID..."
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans transition"
            />
          </div>

          {/* Action dropdown */}
          <div>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono transition"
            >
              <option value="">All Actions</option>
              {filtersMetadata.actions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          {/* Actor dropdown */}
          <div>
            <select
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono transition"
            >
              <option value="">All Actors (90d)</option>
              {filtersMetadata.actors.map((act) => (
                <option key={act.id} value={act.id}>
                  {act.role}: {act.id.slice(0, 8)}...
                </option>
              ))}
            </select>
          </div>

          {/* Subject Type dropdown */}
          <div>
            <select
              value={subjectType}
              onChange={(e) => setSubjectType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono transition"
            >
              <option value="">All Subject Types</option>
              {filtersMetadata.subjectTypes.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Execution Result */}
          <div>
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="ALL">All Results</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
            </select>
          </div>
        </div>

        {/* Second Row: Date range, Tenant ID, Ticket Ref, Clear button */}
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-800/60">
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] text-slate-400 mb-1">Target Tenant ID / Org ID</label>
            <input
              type="text"
              placeholder="e.g. 571b60e0-4ac4-4211-b61e-0bed6830af37"
              value={targetTenantId}
              onChange={(e) => setTargetTenantId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Ticket Reference</label>
            <input
              type="text"
              placeholder="e.g. SEC-101"
              value={ticketRef}
              onChange={(e) => setTicketRef(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div className="flex items-end">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="w-full bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Querying immutable multi-schema audit records...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <ErrorState
          title="Failed to Query Audit Trail"
          message={error.message}
          status={error.status}
          onRetry={() => fetchEvents(null, false)}
        />
      )}

      {/* Empty State */}
      {!loading && !error && events.length === 0 && (
        <EmptyState
          title={hasActiveFilters ? 'No Matching Audit Events' : 'No Audit Events Recorded'}
          description={
            hasActiveFilters
              ? 'Try modifying or clearing your filter criteria.'
              : 'There are no platform or billing audit records in the database.'
          }
          icon={History}
        />
      )}

      {/* Events Table Stream */}
      {!loading && !error && events.length > 0 && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl border border-slate-800/90 overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono text-[10px]">
                  <th className="py-3.5 px-4 font-semibold">Timestamp</th>
                  <th className="py-3.5 px-4 font-semibold">Source</th>
                  <th className="py-3.5 px-4 font-semibold">Actor</th>
                  <th className="py-3.5 px-4 font-semibold">Action</th>
                  <th className="py-3.5 px-4 font-semibold">Subject / Tenant</th>
                  <th className="py-3.5 px-4 font-semibold">Result</th>
                  <th className="py-3.5 px-4 font-semibold">Reason / Ticket</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {events.map((evt) => (
                  <tr
                    key={`${evt.source}-${evt.id}`}
                    onClick={() => fetchEventDetail(evt.source, evt.id)}
                    className="hover:bg-slate-900/60 transition cursor-pointer group"
                  >
                    {/* Timestamp */}
                    <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(evt.occurredAt).toLocaleString()}
                    </td>

                    {/* Source */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                          evt.source === 'PLATFORM'
                            ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        }`}
                      >
                        {evt.source}
                      </span>
                    </td>

                    {/* Actor */}
                    <td className="py-3.5 px-4 text-slate-300">
                      <span className="font-semibold text-slate-200">{evt.actorRole}</span>
                      <span className="text-slate-500 text-[10px] block font-mono">
                        {evt.actorId.slice(0, 10)}...
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 font-bold text-indigo-300 group-hover:text-indigo-200">
                      <div className="flex items-center gap-1.5">
                        <span>{evt.action}</span>
                        {evt.hasDiff && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            diff
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Subject / Tenant */}
                    <td className="py-3.5 px-4">
                      <div className="text-slate-300 text-[11px]">
                        <span className="text-slate-500">{evt.subjectType}:</span> {evt.subjectId.slice(0, 12)}
                      </div>
                      {evt.tenantName ? (
                        <span className="text-indigo-400 text-[10px] font-semibold block">
                          {evt.tenantName}
                        </span>
                      ) : evt.targetTenantId ? (
                        <span className="text-slate-500 text-[10px] block">
                          Tenant: {evt.targetTenantId.slice(0, 8)}...
                        </span>
                      ) : null}
                    </td>

                    {/* Result */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                          evt.executionResult === 'SUCCESS'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}
                      >
                        {evt.executionResult}
                      </span>
                    </td>

                    {/* Reason / Ticket */}
                    <td className="py-3.5 px-4 text-slate-400 max-w-xs truncate">
                      {evt.reason || evt.ticketRef || '—'}
                    </td>

                    {/* Detail trigger */}
                    <td className="py-3.5 px-4 text-right">
                      <span className="text-slate-500 group-hover:text-indigo-400 transition inline-flex items-center gap-1 text-[10px]">
                        View <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load More Button */}
          {nextCursor && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => fetchEvents(nextCursor, true)}
                disabled={loadingMore}
                className="bg-slate-900 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 border border-slate-800 px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg disabled:opacity-40"
              >
                {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Load More Events
              </button>
            </div>
          )}
        </div>
      )}

      {/* Side Drawer for Event Inspection */}
      {selectedEventId && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-2xl bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col">
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-800/80 flex items-start justify-between bg-slate-900/40">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        selectedEventId.source === 'PLATFORM'
                          ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                      }`}
                    >
                      {selectedEventId.source}
                    </span>
                    <h3 className="text-base font-bold text-white font-mono">
                      {eventDetail?.action || 'Audit Event Record'}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    ID: {selectedEventId.id}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedEventId(null);
                    setEventDetail(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {detailLoading && (
                  <div className="py-20 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-xs text-slate-400 font-mono">Loading event diff & state...</p>
                  </div>
                )}

                {detailError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300">
                    {detailError}
                  </div>
                )}

                {eventDetail && !detailLoading && (
                  <div className="space-y-6 text-xs">
                    {/* Event Summary Meta */}
                    <div className="glass-panel p-4 rounded-xl border border-slate-800/80 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Occurred At</span>
                        <span className="text-slate-200 font-mono font-semibold">
                          {new Date(eventDetail.occurredAt).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Execution Result</span>
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${
                            eventDetail.executionResult === 'SUCCESS'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}
                        >
                          {eventDetail.executionResult}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Actor Identity</span>
                        <span className="text-slate-200 font-mono">
                          {eventDetail.actorRole} ({eventDetail.actorId})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Subject</span>
                        <span className="text-slate-200 font-mono">
                          {eventDetail.subjectType}: {eventDetail.subjectId}
                        </span>
                      </div>
                      {eventDetail.targetTenantId && (
                        <div className="col-span-2">
                          <span className="text-[10px] text-slate-400 block">Target Tenant</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-indigo-400 font-semibold">
                              {eventDetail.tenantName || eventDetail.targetTenantId}
                            </span>
                            <Link
                              to={`/tenants/${eventDetail.targetTenantId}`}
                              className="text-slate-400 hover:text-white inline-flex items-center gap-1 text-[11px] underline"
                            >
                              Open Tenant <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      )}
                      {eventDetail.ticketRef && (
                        <div>
                          <span className="text-[10px] text-slate-400 block">Ticket Reference</span>
                          <span className="text-slate-200 font-mono">{eventDetail.ticketRef}</span>
                        </div>
                      )}
                      {eventDetail.requestId && (
                        <div>
                          <span className="text-[10px] text-slate-400 block">Request ID</span>
                          <span className="text-slate-400 font-mono text-[10px] truncate block">
                            {eventDetail.requestId}
                          </span>
                        </div>
                      )}
                      {eventDetail.reason && (
                        <div className="col-span-2">
                          <span className="text-[10px] text-slate-400 block">Justification Reason</span>
                          <p className="text-slate-300 font-sans mt-0.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                            {eventDetail.reason}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* State Changes Diff */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-indigo-400" /> State Changes Diff
                        </h4>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {eventDetail.changes?.length || 0} modified path(s)
                        </span>
                      </div>

                      {(!eventDetail.changes || eventDetail.changes.length === 0) && (
                        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl text-slate-400 text-xs">
                          No structural state diff recorded for this event.
                        </div>
                      )}

                      {eventDetail.changes && eventDetail.changes.length > 0 && (
                        <div className="border border-slate-800 rounded-xl overflow-hidden font-mono text-[11px]">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px]">
                                <th className="p-2.5 font-semibold">Field Path</th>
                                <th className="p-2.5 font-semibold">Before</th>
                                <th className="p-2.5 font-semibold">After</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80">
                              {eventDetail.changes.map((ch, idx) => (
                                <tr key={idx} className="hover:bg-slate-900/30">
                                  <td className="p-2.5 text-indigo-300 font-semibold align-top whitespace-nowrap">
                                    {ch.path}
                                  </td>
                                  <td className="p-2.5 text-red-400 bg-red-950/20 align-top max-w-xs break-all">
                                    {ch.before === null || ch.before === undefined ? (
                                      <span className="text-slate-500 italic">null</span>
                                    ) : typeof ch.before === 'object' ? (
                                      <pre className="text-[10px]">{JSON.stringify(ch.before, null, 2)}</pre>
                                    ) : (
                                      String(ch.before)
                                    )}
                                  </td>
                                  <td className="p-2.5 text-emerald-400 bg-emerald-950/20 align-top max-w-xs break-all">
                                    {ch.after === null || ch.after === undefined ? (
                                      <span className="text-slate-500 italic">null</span>
                                    ) : typeof ch.after === 'object' ? (
                                      <pre className="text-[10px]">{JSON.stringify(ch.after, null, 2)}</pre>
                                    ) : (
                                      String(ch.after)
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Collapsible Raw Payloads */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Raw State Snapshots
                      </h4>

                      {eventDetail.impersonationContext && (
                        <details className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                          <summary className="cursor-pointer font-semibold text-slate-300 text-xs">
                            Impersonation Context Snapshot
                          </summary>
                          <pre className="mt-2 text-[10px] text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800 overflow-x-auto">
                            {JSON.stringify(eventDetail.impersonationContext, null, 2)}
                          </pre>
                        </details>
                      )}

                      {eventDetail.before && (
                        <details className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                          <summary className="cursor-pointer font-semibold text-slate-300 text-xs">
                            Full Before State Snapshot
                          </summary>
                          <pre className="mt-2 text-[10px] text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800 overflow-x-auto">
                            {JSON.stringify(eventDetail.before, null, 2)}
                          </pre>
                        </details>
                      )}

                      {eventDetail.after && (
                        <details className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                          <summary className="cursor-pointer font-semibold text-slate-300 text-xs">
                            Full After State Snapshot
                          </summary>
                          <pre className="mt-2 text-[10px] text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800 overflow-x-auto">
                            {JSON.stringify(eventDetail.after, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
