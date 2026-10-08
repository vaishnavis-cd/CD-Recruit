import { apiFetch } from '../../api';
import * as T from './types';

export const billingApi = {
  // ── Billing Accounts (H2.1) ──────────────────────────────────────────────
  getAccounts: async (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    country?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.page) sp.set('page', String(params.page));
    if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
    if (params?.search) sp.set('search', params.search);
    if (params?.status && params.status !== 'ALL') sp.set('status', params.status);
    if (params?.country && params.country !== 'ALL') sp.set('country', params.country);

    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return apiFetch<{ items: T.BillingAccountListItem[]; total: number; page: number; pageSize: number }>(
      `/billing/accounts${qs}`
    );
  },

  getAccount: async (id: string) => {
    return apiFetch<T.BillingAccountDetail>(`/billing/accounts/${id}`);
  },

  getAccountSummary: async (id: string) => {
    return apiFetch<T.BillingAccountSummary>(`/billing/accounts/${id}/summary`);
  },

  getAccountPools: async (id: string) => {
    return apiFetch<T.CreditPoolSummary[]>(`/billing/accounts/${id}/pools`);
  },

  // ── Credit Pools (H2.2) ──────────────────────────────────────────────────
  getPoolDetail: async (poolId: string) => {
    return apiFetch<T.CreditPoolDetail>(`/billing/pools/${poolId}`);
  },

  // ── Ledger Explorer (H2.3) ───────────────────────────────────────────────
  getLedgerEntries: async (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    entryType?: string;
    reason?: string;
    startDate?: string;
    endDate?: string;
    includeShadow?: boolean;
  }) => {
    const sp = new URLSearchParams();
    if (params?.page) sp.set('page', String(params.page));
    if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
    if (params?.search) sp.set('search', params.search);
    if (params?.entryType && params.entryType !== 'ALL') sp.set('entryType', params.entryType);
    if (params?.reason && params.reason !== 'ALL') sp.set('reason', params.reason);
    if (params?.startDate) sp.set('startDate', params.startDate);
    if (params?.endDate) sp.set('endDate', params.endDate);
    if (params?.includeShadow) sp.set('includeShadow', 'true');

    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return apiFetch<{ items: T.CreditLedgerEntryItem[]; total: number; page: number; pageSize: number }>(
      `/billing/ledger${qs}`
    );
  },

  exportLedgerCsv: async (params?: {
    search?: string;
    entryType?: string;
    reason?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.entryType && params.entryType !== 'ALL') sp.set('entryType', params.entryType);
    if (params?.reason && params.reason !== 'ALL') sp.set('reason', params.reason);
    if (params?.startDate) sp.set('startDate', params.startDate);
    if (params?.endDate) sp.set('endDate', params.endDate);

    const token = localStorage.getItem('platform_token');
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const res = await fetch(`/api/v1/platform/billing/ledger/export${qs}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Export failed with HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `proctora_ledger_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },

  // ── Manual Requests / Maker-Checker (H2.4) ───────────────────────────────
  getRequests: async (params?: {
    tab?: 'MY' | 'AWAITING' | 'ALL';
    status?: string;
    kind?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const sp = new URLSearchParams();
    if (params?.tab) sp.set('tab', params.tab);
    if (params?.status && params.status !== 'ALL') sp.set('status', params.status);
    if (params?.kind && params.kind !== 'ALL') sp.set('kind', params.kind);
    if (params?.page) sp.set('page', String(params.page));
    if (params?.pageSize) sp.set('pageSize', String(params.pageSize));

    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return apiFetch<{ items: T.ManualBillingRequestItem[]; total: number; pendingCount?: number }>(
      `/billing/requests${qs}`
    );
  },

  createRequest: async (body: {
    billingAccountId: string;
    kind: T.ManualRequestKind;
    payload: Record<string, any>;
    reason: string;
    ticketRef: string;
  }) => {
    return apiFetch<T.ManualBillingRequestItem>('/billing/requests', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  approveRequest: async (requestId: string) => {
    return apiFetch<{ success: boolean; request: T.ManualBillingRequestItem; message: string }>(
      `/billing/requests/${requestId}/approve`,
      { method: 'POST' }
    );
  },

  rejectRequest: async (requestId: string, reason: string) => {
    return apiFetch<{ success: boolean; request: T.ManualBillingRequestItem }>(
      `/billing/requests/${requestId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
  },

  cancelRequest: async (requestId: string) => {
    return apiFetch<{ success: boolean; request: T.ManualBillingRequestItem }>(
      `/billing/requests/${requestId}/cancel`,
      { method: 'POST' }
    );
  },

  retryRequest: async (requestId: string) => {
    return apiFetch<{ success: boolean; request: T.ManualBillingRequestItem }>(
      `/billing/requests/${requestId}/retry`,
      { method: 'POST' }
    );
  },

  // ── Price Book (H2.5) ────────────────────────────────────────────────────
  getPriceBook: async (country = 'IN') => {
    return apiFetch<T.PriceBookItem[]>(`/billing/pricing?country=${country}`);
  },

  publishPricingVersion: async (body: {
    sku: string;
    billingCountry: string;
    currency: string;
    poolType: T.PoolType;
    totalCredits: number;
    validityDays: number;
    unitPriceMinor: number;
    effectiveFrom: string;
  }) => {
    return apiFetch<T.PriceBookItem>('/billing/pricing', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // ── Payments & Invoices (H2.6) ───────────────────────────────────────────
  getPayments: async (params?: { page?: number; pageSize?: number; provider?: string }) => {
    const sp = new URLSearchParams();
    if (params?.page) sp.set('page', String(params.page));
    if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
    if (params?.provider && params.provider !== 'ALL') sp.set('provider', params.provider);

    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return apiFetch<{ items: T.PaymentItem[]; total: number }>(`/billing/payments${qs}`);
  },

  recordManualInvoice: async (body: {
    billingAccountId: string;
    amountMinor: number;
    currency: string;
    creditsPurchased: number;
    invoiceNumber: string;
    poReference?: string;
    poolType: T.PoolType;
    validityDays: number;
  }) => {
    return apiFetch<T.PaymentItem>('/billing/payments/manual-invoice', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  replayWebhook: async (eventId: string) => {
    return apiFetch<{ success: boolean; message: string }>('/billing/payments/replay-webhook', {
      method: 'POST',
      body: JSON.stringify({ eventId }),
    });
  },

  // ── Finance Overview & Unit Economics (H2.7) ─────────────────────────────
  getFinanceMetrics: async (params?: { period?: string }) => {
    const qs = params?.period ? `?period=${params.period}` : '';
    return apiFetch<T.FinanceOverviewMetrics>(`/finance/metrics${qs}`);
  },

  // ── Integrity, Reconciliation & Incidents (H2.8) ─────────────────────────
  getLatestReconciliation: async () => {
    return apiFetch<T.ReconciliationRunResult>('/billing/reconciliation/latest');
  },

  triggerReconciliationRun: async () => {
    return apiFetch<T.ReconciliationRunResult>('/billing/reconciliation/run', {
      method: 'POST',
    });
  },

  getIncidents: async () => {
    return apiFetch<T.IncidentWindowItem[]>('/billing/incidents');
  },

  declareIncidentWindow: async (body: {
    title?: string;
    description: string;
    ticketRef?: string;
    startedAt: string;
    endedAt: string;
    billingAccountId?: string;
  }) => {
    return apiFetch<T.IncidentWindowItem>('/billing/incidents', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

export const downloadLedgerCsv = billingApi.exportLedgerCsv;
