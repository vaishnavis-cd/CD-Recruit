import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/lib/auth-store';
import { Shell } from '@/components/layout/Shell';
import { LoginPage } from '@/pages/auth/LoginPage';
import { OverviewPage } from '@/pages/overview/OverviewPage';
import { TenantsListPage } from '@/pages/tenants/TenantsListPage';
import { TenantDetailPage } from '@/pages/tenants/TenantDetailPage';
import { PipelinePage } from '@/pages/pipeline/PipelinePage';
import { OnboardingWizardPage } from '@/pages/wizard/OnboardingWizardPage';
import { OverridesPage } from '@/pages/overrides/OverridesPage';
import { StaffPage } from '@/pages/staff/StaffPage';
import { AuditPage } from '@/pages/audit/AuditPage';

// Commerce & Billing Pages
import { FinanceDashboardPage } from '@/pages/finance/FinanceDashboardPage';
import { AccountsListPage } from '@/pages/billing/accounts/AccountsListPage';
import { AccountDetailPage } from '@/pages/billing/accounts/AccountDetailPage';
import { CreditPoolDetailPage } from '@/pages/billing/pools/CreditPoolDetailPage';
import { LedgerExplorerPage } from '@/pages/billing/ledger/LedgerExplorerPage';
import { MakerCheckerQueuePage } from '@/pages/billing/requests/MakerCheckerQueuePage';
import { PriceBookPage } from '@/pages/billing/pricing/PriceBookPage';
import { PaymentsConsolePage } from '@/pages/billing/payments/PaymentsConsolePage';
import { IntegrityConsolePage } from '@/pages/billing/integrity/IntegrityConsolePage';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const ProtectedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuthStore();

  // If no auth token, redirect to login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Shell>{children}</Shell>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" theme="dark" richColors />
      <BrowserRouter>
        <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Platform Operations */}
        <Route
          path="/"
          element={
            <ProtectedLayout>
              <OverviewPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/tenants"
          element={
            <ProtectedLayout>
              <TenantsListPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/pipeline"
          element={
            <ProtectedLayout>
              <PipelinePage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/tenants/:id"
          element={
            <ProtectedLayout>
              <TenantDetailPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/tenants/new"
          element={
            <ProtectedLayout>
              <OnboardingWizardPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/overrides"
          element={
            <ProtectedLayout>
              <OverridesPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/staff"
          element={
            <ProtectedLayout>
              <StaffPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/audit"
          element={
            <ProtectedLayout>
              <AuditPage />
            </ProtectedLayout>
          }
        />

        {/* Commerce & Billing */}
        <Route
          path="/finance"
          element={
            <ProtectedLayout>
              <FinanceDashboardPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/billing/accounts"
          element={
            <ProtectedLayout>
              <AccountsListPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/billing/accounts/:id"
          element={
            <ProtectedLayout>
              <AccountDetailPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/billing/pools/:id"
          element={
            <ProtectedLayout>
              <CreditPoolDetailPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/billing/ledger"
          element={
            <ProtectedLayout>
              <LedgerExplorerPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/billing/requests"
          element={
            <ProtectedLayout>
              <MakerCheckerQueuePage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/billing/pricing"
          element={
            <ProtectedLayout>
              <PriceBookPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/billing/payments"
          element={
            <ProtectedLayout>
              <PaymentsConsolePage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/billing/integrity"
          element={
            <ProtectedLayout>
              <IntegrityConsolePage />
            </ProtectedLayout>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);
};
export default App;
