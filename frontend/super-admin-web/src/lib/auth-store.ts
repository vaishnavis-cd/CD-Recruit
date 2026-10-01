import { create } from 'zustand';

export interface PlatformStaff {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPPORT' | 'FINANCE' | 'OWNER';
  mfaEnabled: boolean;
}

interface ImpersonationState {
  isImpersonating: boolean;
  tenantId?: string;
  tenantName?: string;
  expiresAt?: string;
}

interface AuthState {
  staff: PlatformStaff | null;
  token: string | null;
  tempToken: string | null; // For MFA verification step
  impersonation: ImpersonationState | null;
  setAuth: (staff: PlatformStaff, token: string) => void;
  setTempAuth: (tempToken: string) => void;
  startImpersonation: (session: { tenantId: string; tenantName: string; token: string; expiresAt: string }) => void;
  stopImpersonation: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const savedStaff = localStorage.getItem('platform_staff');
  const savedToken = localStorage.getItem('platform_token');

  return {
    staff: savedStaff ? JSON.parse(savedStaff) : null,
    token: savedToken || null,
    tempToken: null,
    impersonation: null,

    setAuth: (staff, token) => {
      localStorage.setItem('platform_staff', JSON.stringify(staff));
      localStorage.setItem('platform_token', token);
      set({ staff, token, tempToken: null });
    },

    setTempAuth: (tempToken) => {
      set({ tempToken });
    },

    startImpersonation: (session) => {
      set({
        impersonation: {
          isImpersonating: true,
          tenantId: session.tenantId,
          tenantName: session.tenantName,
          expiresAt: session.expiresAt,
        },
      });
    },

    stopImpersonation: () => {
      set({ impersonation: null });
    },

    logout: () => {
      localStorage.removeItem('platform_staff');
      localStorage.removeItem('platform_token');
      set({ staff: null, token: null, tempToken: null, impersonation: null });
    },
  };
});
