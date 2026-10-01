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
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
export default App;
