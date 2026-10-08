import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { billingApi } from '@/lib/api/billing/billing.api';
import * as T from '@/lib/api/billing/types';

// Query Keys Constants
export const BILLING_KEYS = {
  accounts: (params?: any) => ['billing', 'accounts', params] as const,
  accountDetail: (id: string) => ['billing', 'account', id] as const,
  accountSummary: (id: string) => ['billing', 'account', id, 'summary'] as const,
  accountPools: (id: string) => ['billing', 'account', id, 'pools'] as const,
  poolDetail: (poolId: string) => ['billing', 'pool', poolId] as const,
  ledger: (params?: any) => ['billing', 'ledger', params] as const,
  requests: (params?: any) => ['billing', 'requests', params] as const,
  pricing: (country?: string) => ['billing', 'pricing', country] as const,
  payments: (params?: any) => ['billing', 'payments', params] as const,
  financeMetrics: (period?: string) => ['finance', 'metrics', period] as const,
  reconciliation: ['billing', 'reconciliation', 'latest'] as const,
  incidents: ['billing', 'incidents'] as const,
};

// ── 1. Accounts Hooks ──────────────────────────────────────────────────────────
export function useBillingAccounts(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  country?: string;
  currency?: string;
}) {
  return useQuery({
    queryKey: BILLING_KEYS.accounts(params),
    queryFn: () => billingApi.getAccounts(params),
  });
}

export function useBillingAccountDetail(id: string) {
  return useQuery({
    queryKey: BILLING_KEYS.accountDetail(id),
    queryFn: () => billingApi.getAccount(id),
    enabled: Boolean(id),
  });
}

export function useBillingAccountSummary(id: string) {
  return useQuery({
    queryKey: BILLING_KEYS.accountSummary(id),
    queryFn: () => billingApi.getAccountSummary(id),
    enabled: Boolean(id),
  });
}

export function useUpdateAccountStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      status,
      reason,
      ticketRef,
    }: {
      accountId: string;
      status: T.BillingAccountStatus;
      reason: string;
      ticketRef: string;
    }) =>
      billingApi.createRequest({
        billingAccountId: accountId,
        kind: 'ACCOUNT_STATUS' as any,
        payload: { status },
        reason,
        ticketRef,
      }),
    onSuccess: () => {
      toast.success('Account status change submitted to Maker-Checker queue');
      qc.invalidateQueries({ queryKey: ['billing', 'requests'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to submit status change request');
    },
  });
}

// ── 2. Credit Pool Hooks ─────────────────────────────────────────────────────
export function useCreditPoolDetail(poolId: string) {
  return useQuery({
    queryKey: BILLING_KEYS.poolDetail(poolId),
    queryFn: () => billingApi.getPoolDetail(poolId),
    enabled: Boolean(poolId),
  });
}

export function useExtendPoolExpiryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      poolId,
      billingAccountId,
      newExpiryDate,
      reason,
      ticketRef,
    }: {
      poolId: string;
      billingAccountId: string;
      newExpiryDate: string;
      reason: string;
      ticketRef: string;
    }) =>
      billingApi.createRequest({
        billingAccountId,
        kind: 'EXPIRY_EXTEND' as any,
        payload: { poolId, newExpiry: newExpiryDate },
        reason,
        ticketRef,
      }),
    onSuccess: () => {
      toast.success('Pool validity extension submitted to Maker-Checker queue');
      qc.invalidateQueries({ queryKey: ['billing', 'requests'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to submit pool extension request');
    },
  });
}

// ── 3. Ledger Explorer Hooks ─────────────────────────────────────────────────
export function useLedgerEntries(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  accountId?: string;
  entryType?: string;
  reason?: string;
  startDate?: string;
  endDate?: string;
  shadowMode?: boolean;
  includeShadow?: boolean;
}) {
  return useQuery({
    queryKey: BILLING_KEYS.ledger(params),
    queryFn: () => billingApi.getLedgerEntries(params),
  });
}

export const useCreditLedger = useLedgerEntries;

// ── 4. Maker-Checker Requests Hooks ──────────────────────────────────────────
export function useMakerCheckerRequests(params?: {
  tab?: 'MY' | 'AWAITING' | 'ALL';
  status?: string;
  kind?: string;
  requestedBy?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: BILLING_KEYS.requests(params),
    queryFn: () => billingApi.getRequests(params),
    refetchInterval: 15000,
  });
}

export const usePendingBillingRequests = useMakerCheckerRequests;

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => billingApi.approveRequest(requestId),
    onSuccess: () => {
      toast.success('Request approved and executed successfully');
      qc.invalidateQueries({ queryKey: ['billing', 'requests'] });
      qc.invalidateQueries({ queryKey: ['billing', 'accounts'] });
      qc.invalidateQueries({ queryKey: ['billing', 'account'] });
      qc.invalidateQueries({ queryKey: ['billing', 'pools'] });
      qc.invalidateQueries({ queryKey: ['billing', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['billing', 'summary'] });
      qc.invalidateQueries({ queryKey: ['finance', 'metrics'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to approve request');
    },
  });
}

export const useApproveBillingRequestMutation = useApproveRequest;

export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      billingApi.rejectRequest(requestId, reason),
    onSuccess: () => {
      toast.success('Request rejected');
      qc.invalidateQueries({ queryKey: ['billing', 'requests'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to reject request');
    },
  });
}

export const useRejectBillingRequestMutation = useRejectRequest;

export function useCancelRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => billingApi.cancelRequest(requestId),
    onSuccess: () => {
      toast.success('Request cancelled');
      qc.invalidateQueries({ queryKey: ['billing', 'requests'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to cancel request');
    },
  });
}

export function useRetryRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => billingApi.retryRequest(requestId),
    onSuccess: () => {
      toast.success('Execution retried successfully');
      qc.invalidateQueries({ queryKey: ['billing', 'requests'] });
      qc.invalidateQueries({ queryKey: ['billing', 'accounts'] });
      qc.invalidateQueries({ queryKey: ['billing', 'account'] });
      qc.invalidateQueries({ queryKey: ['billing', 'pools'] });
      qc.invalidateQueries({ queryKey: ['billing', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['billing', 'summary'] });
      qc.invalidateQueries({ queryKey: ['finance', 'metrics'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Retry execution failed');
    },
  });
}

export function useCreateManualRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      billingAccountId: string;
      requestType: string;
      amount?: number;
      payload?: Record<string, any>;
      reason: string;
      ticketRef: string;
    }) =>
      billingApi.createRequest({
        billingAccountId: vars.billingAccountId,
        kind: vars.requestType as any,
        payload: vars.payload ?? { amount: vars.amount },
        reason: vars.reason,
        ticketRef: vars.ticketRef,
      }),
    onSuccess: () => {
      toast.success('Manual request submitted for maker-checker approval');
      qc.invalidateQueries({ queryKey: ['billing', 'requests'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to submit request');
    },
  });
}

export const useCreateManualBillingRequestMutation = useCreateManualRequest;

// ── 5. Price Book Hooks ──────────────────────────────────────────────────────
export function usePriceBook(country = 'IN') {
  return useQuery({
    queryKey: BILLING_KEYS.pricing(country),
    queryFn: () => billingApi.getPriceBook(country),
  });
}

export function usePublishPricingVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      currency: string;
      tierName: string;
      unitRateMinor: number;
      effectiveFrom: string;
      reason?: string;
    }) =>
      billingApi.publishPricingVersion({
        sku: `${vars.tierName}_${vars.currency}`,
        billingCountry: vars.currency === 'INR' ? 'IN' : vars.currency === 'USD' ? 'US' : 'MY',
        currency: vars.currency,
        poolType: 'TALENT_RESERVE',
        totalCredits: 1,
        validityDays: 365,
        unitPriceMinor: vars.unitRateMinor,
        effectiveFrom: vars.effectiveFrom,
      }),
    onSuccess: () => {
      toast.success('Price schedule revision published');
      qc.invalidateQueries({ queryKey: ['billing', 'pricing'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to publish pricing version');
    },
  });
}

export const usePublishPriceBookMutation = usePublishPricingVersion;

// ── 6. Payments & Invoices Hooks ─────────────────────────────────────────────
export function usePayments(params?: { page?: number; pageSize?: number; provider?: string }) {
  return useQuery({
    queryKey: BILLING_KEYS.payments(params),
    queryFn: () => billingApi.getPayments(params),
  });
}

export function useRecordManualInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      billingAccountId: string;
      amountMinor: number;
      currency: string;
      invoiceNumber: string;
      paymentMethod?: string;
      notes?: string;
    }) =>
      billingApi.recordManualInvoice({
        billingAccountId: vars.billingAccountId,
        amountMinor: vars.amountMinor,
        currency: vars.currency,
        creditsPurchased: Math.round(vars.amountMinor / 100),
        invoiceNumber: vars.invoiceNumber,
        poReference: vars.paymentMethod,
        poolType: 'TALENT_RESERVE',
        validityDays: 365,
      }),
    onSuccess: () => {
      toast.success('Manual invoice registered and pool minted');
      qc.invalidateQueries({ queryKey: ['billing', 'payments'] });
      qc.invalidateQueries({ queryKey: ['billing', 'accounts'] });
      qc.invalidateQueries({ queryKey: ['billing', 'account'] });
      qc.invalidateQueries({ queryKey: ['billing', 'pools'] });
      qc.invalidateQueries({ queryKey: ['billing', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['finance', 'metrics'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to record invoice payment');
    },
  });
}

export const useRecordManualInvoiceMutation = useRecordManualInvoice;

export function useReplayWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => billingApi.replayWebhook(eventId),
    onSuccess: () => {
      toast.success('Webhook replay job enqueued');
      qc.invalidateQueries({ queryKey: ['billing', 'payments'] });
      qc.invalidateQueries({ queryKey: ['billing', 'ledger'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Webhook replay failed');
    },
  });
}

export const useReplayWebhookMutation = useReplayWebhook;

// ── 7. Finance Metrics Hooks ─────────────────────────────────────────────────
export function useFinanceMetrics(period = '30d') {
  return useQuery({
    queryKey: BILLING_KEYS.financeMetrics(period),
    queryFn: () => billingApi.getFinanceMetrics({ period }),
    staleTime: 60000,
  });
}

export const useFinanceOverview = useFinanceMetrics;

// ── 8. Reconciliation & Incident Hooks ───────────────────────────────────────
export function useLatestReconciliation() {
  return useQuery({
    queryKey: BILLING_KEYS.reconciliation,
    queryFn: billingApi.getLatestReconciliation,
  });
}

export const useReconciliationStatus = useLatestReconciliation;

export function useTriggerReconciliationRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: billingApi.triggerReconciliationRun,
    onSuccess: () => {
      toast.success('Reconciliation run completed');
      qc.invalidateQueries({ queryKey: BILLING_KEYS.reconciliation });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Reconciliation execution failed');
    },
  });
}

export const useTriggerReconciliationMutation = useTriggerReconciliationRun;

export function useIncidents() {
  return useQuery({
    queryKey: BILLING_KEYS.incidents,
    queryFn: billingApi.getIncidents,
  });
}

export function useDeclareIncidentWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      startTime: string;
      endTime: string;
      description: string;
      ticketRef?: string;
      billingAccountId?: string;
    }) =>
      billingApi.declareIncidentWindow({
        startedAt: vars.startTime,
        endedAt: vars.endTime,
        description: vars.description,
        ticketRef: vars.ticketRef,
        billingAccountId: vars.billingAccountId,
      }),
    onSuccess: () => {
      toast.success('Incident window declared and reversals enqueued');
      qc.invalidateQueries({ queryKey: BILLING_KEYS.incidents });
      qc.invalidateQueries({ queryKey: ['billing', 'ledger'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to declare incident');
    },
  });
}

export const useDeclareIncidentMutation = useDeclareIncidentWindow;
