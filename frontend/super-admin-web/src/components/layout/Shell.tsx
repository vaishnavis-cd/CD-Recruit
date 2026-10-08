import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  UserPlus,
  Sliders,
  ShieldCheck,
  History,
  LogOut,
  Search,
  AlertTriangle,
  Lock,
  ExternalLink,
  Columns,
  DollarSign,
  CreditCard,
  Tag,
  Receipt,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { MfaSetupModal } from '@/components/auth/MfaSetupModal';
import { usePendingBillingRequests } from '@/hooks/billing/useBilling';

interface ShellProps {
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { staff, impersonation, stopImpersonation, logout } = useAuthStore();
  const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Poll pending maker-checker count for live badge counter
  const { data: pendingRequests } = usePendingBillingRequests({
    page: 1,
    pageSize: 1,
    status: 'PENDING',
  });
  const pendingCount = pendingRequests?.total || 0;

  const navItems = [
    { label: 'Platform Overview', path: '/', icon: LayoutDashboard },
    { label: 'Tenants Directory', path: '/tenants', icon: Building2 },
    { label: 'Pipeline Board', path: '/pipeline', icon: Columns },
    { label: 'Onboard New Tenant', path: '/tenants/new', icon: UserPlus },
    { label: 'Operational Overrides', path: '/overrides', icon: Sliders },
    { label: 'Staff Governance', path: '/staff', icon: ShieldCheck, ownerOnly: true },
    { label: 'Audit Log Explorer', path: '/audit', icon: History },
    { label: 'Finance Telemetry', path: '/finance', icon: DollarSign },
    { label: 'Billing Accounts', path: '/billing/accounts', icon: CreditCard },
    {
      label: 'Maker-Checker Queue',
      path: '/billing/requests',
      icon: ShieldAlert,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { label: 'Ledger Explorer', path: '/billing/ledger', icon: History },
    { label: 'Regional Price Book', path: '/billing/pricing', icon: Tag },
    { label: 'Payments & Invoices', path: '/billing/payments', icon: Receipt },
    { label: 'Integrity & Invariants', path: '/billing/integrity', icon: Scale },
  ].filter((item) => !item.ownerOnly || staff?.role === 'OWNER');

  const handleLogout = () => {
    setShowLogoutModal(false);
    logout();
    navigate('/login');
  };

  const initials = (staff?.fullName || 'Super Operator')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'SO';

  const isNavActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (location.pathname === path) return true;
    if (location.pathname.startsWith(path + '/')) {
      // Prevent parent route (e.g. /tenants) from matching when a more specific child route (e.g. /tenants/new) exists
      const hasMoreSpecific = navItems.some(
        (item) =>
          item.path !== path &&
          item.path.startsWith(path) &&
          (location.pathname === item.path || location.pathname.startsWith(item.path + '/'))
      );
      return !hasMoreSpecific;
    }
    return false;
  };

  return (
    <div className="flex h-screen max-h-screen w-full max-w-full overflow-hidden text-[#0b0b0d] font-sans relative bg-transparent">
      {/* Left Sidebar: Single full-height white panel */}
      <aside className="w-[260px] shrink-0 bg-white border-r border-[#e8ecf4] text-[#0b0b0d] flex flex-col h-screen z-20 shadow-[1px_0_4px_rgba(0,0,0,0.01)]">
        {/* Brand Header */}
        <div className="px-5 pt-6 pb-4 shrink-0">
          <div className="text-[18px] font-bold tracking-tight text-[#0d1424]">Proctora</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#2f68ff] leading-none mt-1">
            SUPER ADMIN
          </div>
        </div>

        {/* Scrollable Nav Container */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-1">
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex items-center justify-between px-3.5 py-2 rounded-xl text-[13px] transition-all ${
                    active
                      ? 'font-semibold text-[#2f68ff] bg-blue-50/70'
                      : 'font-medium text-[#64748b] hover:text-[#0d1424] hover:bg-[#f8fafc]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {active && (
                      <span className="w-[3.5px] h-[18px] bg-[#2f68ff] rounded-full shrink-0 absolute left-1" />
                    )}
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        active ? 'text-[#2f68ff]' : 'text-[#64748b]'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold border shrink-0 ${
                        active
                          ? 'bg-amber-100/90 text-amber-800 border-amber-300'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer: Ops Documentation & Operator Profile */}
        <div className="shrink-0 p-3.5 border-t border-[#f1f5f9] space-y-2.5">
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="relative flex items-center gap-3 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium text-[#64748b] hover:text-[#0d1424] hover:bg-[#f8fafc] transition"
          >
            <ExternalLink className="w-4 h-4 text-[#64748b] shrink-0" />
            <span>Ops Documentation</span>
          </a>

          {/* Operator Profile Footer */}
          <div className="pt-2 border-t border-[#f1f5f9] flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#2f68ff] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] truncate text-[#0d1424] font-bold leading-tight">
                {staff?.fullName || 'Super Operator'}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9.5px] font-bold text-[#2f68ff] uppercase tracking-wider">
                  {staff?.role || 'SUPPORT'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsMfaModalOpen(true)}
                  className={`text-[9px] px-1 py-0.2 rounded font-mono font-semibold border ${
                    staff?.mfaEnabled
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                  title="Configure 2FA Authenticator"
                >
                  {staff?.mfaEnabled ? '2FA ON' : 'SET 2FA'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowLogoutModal(true)}
              title="Log out"
              className="p-1.5 text-[#94a3b8] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 h-screen overflow-y-auto overflow-x-hidden flex flex-col min-w-0 max-w-full overscroll-contain">
        {/* Active Impersonation Warning Banner */}
        {impersonation?.isImpersonating && (
          <div className="bg-amber-500 text-slate-950 px-6 py-2.5 text-xs font-semibold flex items-center justify-between shadow-sm sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 animate-bounce" />
              <span>
                ACTIVE OPERATOR IMPERSONATION: Viewing as <strong>{impersonation.tenantName}</strong> ({impersonation.tenantId})
              </span>
              <span className="text-[10px] font-mono bg-amber-950/20 px-2 py-0.5 rounded ml-2">
                Hard 30-min window • Dual-Audit Logging Active
              </span>
            </div>
            <button
              onClick={stopImpersonation}
              className="bg-slate-950 text-white hover:bg-slate-900 px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              Terminate Session
            </button>
          </div>
        )}

        {/* Top Sticky Header */}
        <header className="sticky top-0 z-10 bg-white border-b border-[#e8ecf4] px-8 h-[64px] flex items-center justify-between shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-4 w-96">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <input
                type="text"
                placeholder="Global Search (Org, Domain, Billing ID, Drive UUID)..."
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl pl-9 pr-12 py-1.5 text-xs text-[#0d1424] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2f68ff] focus:ring-2 focus:ring-[#2f68ff]/10 transition shadow-2xs"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono bg-white text-[#64748b] px-1.5 py-0.5 rounded border border-[#e2e8f0] shadow-2xs">
                Ctrl+K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMfaModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border transition ${
                staff?.mfaEnabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Lock className="w-3 h-3" />
              {staff?.mfaEnabled ? '2FA: Enforced (TOTP)' : '2FA: Setup Needed'}
            </button>
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#64748b] hover:text-[#0d1424] flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-[#f1f5f9] transition"
            >
              Ops Manual <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </header>

        {/* Main Canvas */}
        <main className="flex-1 min-w-0 max-w-full overflow-x-hidden p-8">{children}</main>
      </div>

      {/* MFA Configuration Modal */}
      <MfaSetupModal isOpen={isMfaModalOpen} onClose={() => setIsMfaModalOpen(false)} />

      {/* Blurred Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 transition-all">
          <div className="bg-white rounded-2xl border border-[#e8ecf4] shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0d1424]">Confirm Logout</h3>
                <p className="text-xs text-[#64748b]">End active super admin session</p>
              </div>
            </div>

            <p className="text-xs text-[#64748b] leading-relaxed">
              Are you sure you want to log out of the Proctora Super Admin Console?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 text-xs font-medium text-[#64748b] hover:bg-[#f1f5f9] rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-xs"
              >
                <LogOut size={13} />
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

