import React from 'react';
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
  const [isMfaModalOpen, setIsMfaModalOpen] = React.useState(false);

  // Poll pending maker-checker count for live badge counter
  const { data: pendingRequests } = usePendingBillingRequests({
    page: 1,
    pageSize: 1,
    status: 'PENDING',
  });
  const pendingCount = pendingRequests?.total || 0;

  const platformNavItems = [
    { label: 'Platform Overview', path: '/', icon: LayoutDashboard },
    { label: 'Tenants Directory', path: '/tenants', icon: Building2 },
    { label: 'Pipeline Board', path: '/pipeline', icon: Columns },
    { label: 'Onboard New Tenant', path: '/tenants/new', icon: UserPlus },
    { label: 'Operational Overrides', path: '/overrides', icon: Sliders },
    { label: 'Staff Governance', path: '/staff', icon: ShieldCheck, ownerOnly: true },
    { label: 'Audit Log Explorer', path: '/audit', icon: History },
  ].filter((item) => !item.ownerOnly || staff?.role === 'OWNER');

  const commerceNavItems = [
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
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'OWNER':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'FINANCE':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col">
      {/* Active Impersonation Warning Banner */}
      {impersonation?.isImpersonating && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-sm font-semibold flex items-center justify-between shadow-lg sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 animate-bounce" />
            <span>
              ACTIVE OPERATOR IMPERSONATION: Viewing as <strong>{impersonation.tenantName}</strong> ({impersonation.tenantId})
            </span>
            <span className="text-xs bg-amber-950/20 px-2 py-0.5 rounded ml-2">
              Hard 30-min window • Dual-Audit Logging Active
            </span>
          </div>
          <button
            onClick={stopImpersonation}
            className="bg-slate-950 text-white hover:bg-slate-900 px-3 py-1 rounded text-xs font-bold transition flex items-center gap-1.5"
          >
            Terminate Session
          </button>
        </div>
      )}

      {/* Main App Layout */}
      <div className="flex flex-1">
        {/* Left Sidebar */}
        <aside className="w-64 bg-slate-950/80 border-r border-slate-800/80 flex flex-col justify-between p-4 shrink-0">
          <div className="flex-1 flex flex-col min-h-0">
            {/* Logo & Product Badge */}
            <div className="flex items-center gap-3 px-3 py-4 border-b border-slate-800/60 mb-4 shrink-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                  PROCTORA
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                    Ops
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400 font-medium">Platform Super Admin</p>
              </div>
            </div>

            {/* Scrollable Navigation Groups */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1">
              {/* Group 1: Platform Operations */}
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-slate-500 px-3 mb-1.5 block">
                  Platform Operations
                </span>
                <nav className="space-y-0.5">
                  {platformNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      location.pathname === item.path ||
                      (item.path !== '/' && location.pathname.startsWith(item.path));
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                          isActive
                            ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* Group 2: Commerce & Billing */}
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-slate-500 px-3 mb-1.5 block">
                  Commerce & Billing
                </span>
                <nav className="space-y-0.5">
                  {commerceNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                          isActive
                            ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>
          </div>

          {/* Operator Profile & Status */}
          <div className="pt-4 border-t border-slate-800/60 space-y-3">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-mono text-slate-400">PII-Blind Active</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                v1.0-Ops
              </span>
            </div>

            <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-bold text-slate-200 truncate">{staff?.fullName || 'Super Operator'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${getRoleBadgeColor(
                      staff?.role
                    )}`}
                  >
                    {staff?.role || 'SUPPORT'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsMfaModalOpen(true)}
                    className={`text-[10px] flex items-center gap-1 transition px-1.5 py-0.5 rounded border ${
                      staff?.mfaEnabled
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                    }`}
                    title="Configure 2FA Authenticator"
                  >
                    <Lock className="w-2.5 h-2.5" />
                    {staff?.mfaEnabled ? '2FA Active' : 'Setup 2FA'}
                  </button>
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Log Out"
                className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar with Global Search */}
          <header className="h-16 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4 w-96">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Global Search (Org, Domain, Billing ID, Drive UUID)..."
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-12 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
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
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                }`}
              >
                <Lock className="w-3 h-3" />
                {staff?.mfaEnabled ? '2FA: Enforced (TOTP)' : '2FA: Setup Needed'}
              </button>
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-900 transition"
              >
                Ops Manual <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </header>

          {/* Main Scrollable Canvas */}
          <main className="flex-1 overflow-y-auto p-8">
            {children}
          </main>
        </div>
      </div>

      {/* MFA Configuration Modal */}
      <MfaSetupModal isOpen={isMfaModalOpen} onClose={() => setIsMfaModalOpen(false)} />
    </div>
  );
};

