import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Lock,
  ShieldAlert,
  AlertCircle,
  Clock,
  CheckCircle2,
  X,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { ErrorState } from '@/components/common/ErrorState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';

interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: 'OWNER' | 'FINANCE' | 'SUPPORT';
  status: 'ACTIVE' | 'INACTIVE';
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export const StaffPage: React.FC = () => {
  const { staff: currentActor } = useAuthStore();
  const isOwner = currentActor?.role === 'OWNER';

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<{
    type: 'ROLE' | 'DEACTIVATE' | 'REACTIVATE' | 'RESET_MFA' | 'RESET_PASSWORD';
    target: StaffMember;
  } | null>(null);

  // Form states
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'OWNER' | 'FINANCE' | 'SUPPORT'>('SUPPORT');
  const [newPassword, setNewPassword] = useState('');
  const [actionRole, setActionRole] = useState<'OWNER' | 'FINANCE' | 'SUPPORT'>('SUPPORT');
  const [actionPassword, setActionPassword] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    if (!isOwner) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (searchInput.trim()) params.append('search', searchInput.trim());
    if (roleFilter) params.append('role', roleFilter);
    if (statusFilter) params.append('status', statusFilter);
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));

    try {
      const res = await apiFetch<{
        data: StaffMember[];
        total: number;
        page: number;
        pageSize: number;
      }>(`/staff?${params.toString()}`);
      setStaffList(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError({
        message: err.message || 'Failed to load platform staff directory.',
        status: err instanceof ApiError ? err.status : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [isOwner, searchInput, roleFilter, statusFilter, page, pageSize]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const mapErrorMessage = (msg: string): string => {
    if (msg.includes('CANNOT_MODIFY_SELF')) {
      return 'Security constraint: You cannot modify your own administrative account role, status, or credentials.';
    }
    if (msg.includes('LAST_OWNER')) {
      return 'Governance barrier: Cannot demote or deactivate the last remaining active OWNER account.';
    }
    if (msg.includes('STAFF_EMAIL_TAKEN')) {
      return 'Conflict: A platform staff account already exists with this email address.';
    }
    return msg;
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setActionLoading(true);

    try {
      await apiFetch('/staff', {
        method: 'POST',
        body: JSON.stringify({
          fullName: newFullName.trim(),
          email: newEmail.trim(),
          role: newRole,
          initialPassword: newPassword,
        }),
      });

      setIsAddModalOpen(false);
      setNewFullName('');
      setNewEmail('');
      setNewRole('SUPPORT');
      setNewPassword('');
      setFeedbackSuccess('Staff member created successfully. Initial password change will be enforced.');
      setTimeout(() => setFeedbackSuccess(null), 5000);
      fetchStaff();
    } catch (err: any) {
      setFormError(mapErrorMessage(err.message || 'Failed to create staff member.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAction) return;

    if (actionReason.trim().length < 10) {
      setFormError('Audit reason must be at least 10 characters long explaining this change.');
      return;
    }

    setFormError(null);
    setActionLoading(true);

    try {
      const targetId = activeAction.target.id;

      switch (activeAction.type) {
        case 'ROLE':
          await apiFetch(`/staff/${targetId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({
              role: actionRole,
              reason: actionReason.trim(),
            }),
          });
          setFeedbackSuccess(`Role updated to ${actionRole} for ${activeAction.target.fullName}.`);
          break;

        case 'DEACTIVATE':
          await apiFetch(`/staff/${targetId}/deactivate`, {
            method: 'POST',
            body: JSON.stringify({
              reason: actionReason.trim(),
            }),
          });
          setFeedbackSuccess(`Account deactivated for ${activeAction.target.fullName}.`);
          break;

        case 'REACTIVATE':
          await apiFetch(`/staff/${targetId}/reactivate`, {
            method: 'POST',
            body: JSON.stringify({
              reason: actionReason.trim(),
            }),
          });
          setFeedbackSuccess(`Account reactivated for ${activeAction.target.fullName}.`);
          break;

        case 'RESET_MFA':
          await apiFetch(`/staff/${targetId}/reset-mfa`, {
            method: 'POST',
            body: JSON.stringify({
              reason: actionReason.trim(),
            }),
          });
          setFeedbackSuccess(`2FA reset for ${activeAction.target.fullName}. Re-enrollment required at next login.`);
          break;

        case 'RESET_PASSWORD':
          await apiFetch(`/staff/${targetId}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({
              newTemporaryPassword: actionPassword,
              reason: actionReason.trim(),
            }),
          });
          setFeedbackSuccess(`Password reset for ${activeAction.target.fullName}. Forced change required at next login.`);
          break;
      }

      setActiveAction(null);
      setActionReason('');
      setActionPassword('');
      setTimeout(() => setFeedbackSuccess(null), 5000);
      fetchStaff();
    } catch (err: any) {
      setFormError(mapErrorMessage(err.message || 'Action failed to execute.'));
    } finally {
      setActionLoading(false);
    }
  };

  // Access check: Only OWNER allowed
  if (!isOwner) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#fef3f2] border border-[#fecdca] text-[#f04438] flex items-center justify-center shadow-xs">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500 mt-1">
            Platform Staff Governance and role administration requires the <strong>OWNER</strong> role. Your current account role is <span className="font-mono text-[#2f68ff]">{currentActor?.role || 'SUPPORT'}</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff Management & Governance</h1>
            <span className="text-[10px] font-mono bg-[#f5f3ff] text-[#7c3aed] border border-[#ddd6fe] px-2 py-0.5 rounded-lg font-bold">
              OWNER EXCLUSIVE
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage administrative platform operators, roles, 2FA credentials, and session lifecycles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchStaff}
            disabled={loading}
            icon={RefreshCw}
            className={loading ? '[&_svg]:animate-spin' : ''}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setFormError(null);
              setIsAddModalOpen(true);
            }}
            icon={UserPlus}
          >
            Add Staff Member
          </Button>
        </div>
      </div>

      {feedbackSuccess && (
        <div className="bg-[#ecfdf3] border border-[#a6f4c5] rounded-xl p-3 flex items-center gap-2.5 text-xs text-[#12b76a]">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#12b76a]" />
          <span>{feedbackSuccess}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by staff name or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
            >
              <option value="">All Roles</option>
              <option value="OWNER">OWNER</option>
              <option value="FINANCE">FINANCE</option>
              <option value="SUPPORT">SUPPORT</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && !staffList.length && (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#2f68ff] animate-spin" />
          <p className="text-xs text-slate-500">Loading platform staff directory...</p>
        </div>
      )}

      {error && (
        <ErrorState
          title="Staff Directory Unavailable"
          message={error.message}
          status={error.status}
          onRetry={fetchStaff}
        />
      )}

      {/* Staff Table */}
      {!loading && !error && (
        <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#e8ecf4] bg-[#f8fafc] text-slate-500 font-semibold uppercase font-mono text-[10px]">
                  <th className="py-3.5 px-4">Staff Member</th>
                  <th className="py-3.5 px-4">Platform Role</th>
                  <th className="py-3.5 px-4">Account Status</th>
                  <th className="py-3.5 px-4">2FA Enforced</th>
                  <th className="py-3.5 px-4">Password Status</th>
                  <th className="py-3.5 px-4">Last Login</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8ecf4]">
                {staffList.length > 0 ? (
                  staffList.map((s) => (
                    <tr key={s.id} className="hover:bg-[#f8fafc]/70 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{s.fullName}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">{s.email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                            s.role === 'OWNER'
                              ? 'bg-[#f5f3ff] text-[#7c3aed] border-[#ddd6fe]'
                              : s.role === 'FINANCE'
                              ? 'bg-[#ecfdf3] text-[#12b76a] border-[#a6f4c5]'
                              : 'bg-[#eff6ff] text-[#2f68ff] border-[#bfdbfe]'
                          }`}
                        >
                          {s.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={s.status} dot />
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[11px] font-medium flex items-center gap-1 ${
                            s.mfaEnabled ? 'text-[#12b76a]' : 'text-[#d97706]'
                          }`}
                        >
                          <Lock className="w-3 h-3" />
                          {s.mfaEnabled ? 'Active' : 'Setup Pending'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {s.mustChangePassword ? (
                          <span className="text-[10px] font-mono bg-[#fffbeb] text-[#b54708] border border-[#fde68a] px-1.5 py-0.5 rounded font-medium">
                            Must Change
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Normal</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {s.lastLoginAt ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(s.lastLoginAt).toLocaleDateString()}{' '}
                            <span className="text-slate-400 font-mono">
                              {new Date(s.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Never</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActionRole(s.role);
                              setActionReason('');
                              setFormError(null);
                              setActiveAction({ type: 'ROLE', target: s });
                            }}
                            className="bg-white hover:bg-slate-50 text-slate-700 border border-[#e2e8f0] px-2 py-1 rounded-lg text-[11px] font-semibold transition shadow-xs"
                            title="Change Role"
                          >
                            Role
                          </button>
                          {s.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActionReason('');
                                setFormError(null);
                                setActiveAction({ type: 'DEACTIVATE', target: s });
                              }}
                              className="bg-[#fef3f2] hover:bg-[#fee4e2] text-[#f04438] border border-[#fecdca] px-2 py-1 rounded-lg text-[11px] font-semibold transition shadow-xs"
                              title="Deactivate Account"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setActionReason('');
                                setFormError(null);
                                setActiveAction({ type: 'REACTIVATE', target: s });
                              }}
                              className="bg-[#ecfdf3] hover:bg-[#d1fadf] text-[#12b76a] border border-[#a6f4c5] px-2 py-1 rounded-lg text-[11px] font-semibold transition shadow-xs"
                              title="Reactivate Account"
                            >
                              Reactivate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setActionReason('');
                              setFormError(null);
                              setActiveAction({ type: 'RESET_MFA', target: s });
                            }}
                            className="bg-white hover:bg-slate-50 text-slate-700 border border-[#e2e8f0] px-2 py-1 rounded-lg text-[11px] font-semibold transition shadow-xs"
                            title="Reset 2FA"
                          >
                            Reset 2FA
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActionPassword('');
                              setActionReason('');
                              setFormError(null);
                              setActiveAction({ type: 'RESET_PASSWORD', target: s });
                            }}
                            className="bg-white hover:bg-slate-50 text-slate-700 border border-[#e2e8f0] px-2 py-1 rounded-lg text-[11px] font-semibold transition shadow-xs"
                            title="Reset Password"
                          >
                            Reset Pwd
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No staff members match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD STAFF */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e8ecf4] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8ecf4] pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#2f68ff]" />
                Add Platform Staff Member
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="bg-[#fef3f2] border border-[#fecdca] rounded-xl p-3 text-xs text-[#f04438] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#f04438] shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateStaff} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Sarah Connor"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Staff Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="sarah.connor@platform.local"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Platform Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                >
                  <option value="SUPPORT">SUPPORT (Default operational read/write)</option>
                  <option value="FINANCE">FINANCE (Commercial ledger & pricing)</option>
                  <option value="OWNER">OWNER (Full administrative authority)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Initial Temporary Password</label>
                <input
                  type="password"
                  required
                  placeholder="Min 12 chars (Upper, lower, digit, symbol)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2 text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Policy: &ge; 12 chars with upper, lower, digit, and symbol. The staff member will be forced to change it at first login.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e8ecf4]">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={actionLoading}
                >
                  Create Staff Account
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ACTIONS (ROLE / DEACTIVATE / REACTIVATE / RESET MFA / RESET PWD) */}
      {activeAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e8ecf4] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8ecf4] pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {activeAction.type === 'ROLE' && 'Change Staff Role'}
                {activeAction.type === 'DEACTIVATE' && 'Deactivate Staff Account'}
                {activeAction.type === 'REACTIVATE' && 'Reactivate Staff Account'}
                {activeAction.type === 'RESET_MFA' && 'Reset Two-Factor Authentication'}
                {activeAction.type === 'RESET_PASSWORD' && 'Reset Staff Temporary Password'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveAction(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Target Operator: <strong className="text-slate-900">{activeAction.target.fullName}</strong> ({activeAction.target.email})
            </p>

            {formError && (
              <div className="bg-[#fef3f2] border border-[#fecdca] rounded-xl p-3 text-xs text-[#f04438] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#f04438] shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleExecuteAction} className="space-y-3.5 text-xs">
              {activeAction.type === 'ROLE' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Select New Role</label>
                  <select
                    value={actionRole}
                    onChange={(e) => setActionRole(e.target.value as any)}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                  >
                    <option value="SUPPORT">SUPPORT</option>
                    <option value="FINANCE">FINANCE</option>
                    <option value="OWNER">OWNER</option>
                  </select>
                </div>
              )}

              {activeAction.type === 'RESET_PASSWORD' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">New Temporary Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Min 12 chars (Upper, lower, digit, symbol)"
                    value={actionPassword}
                    onChange={(e) => setActionPassword(e.target.value)}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2 text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    The staff member will be forced to change this password immediately upon their next login.
                  </p>
                </div>
              )}

              {activeAction.type === 'RESET_MFA' && (
                <div className="bg-[#fffbeb] border border-[#fde68a] p-3 rounded-xl text-[11px] text-[#b54708]">
                  ⚠️ This will revoke the existing TOTP key and immediately invalidate all active sessions. The user will be required to re-enroll in 2FA.
                </div>
              )}

              {activeAction.type === 'DEACTIVATE' && (
                <div className="bg-[#fef3f2] border border-[#fecdca] p-3 rounded-xl text-[11px] text-[#f04438]">
                  ⚠️ Deactivating this operator will immediately invalidate all active tokens and block future login attempts.
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Audit Reason <span className="text-[#f04438]">*</span> (Min 10 characters)
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Explain why this administrative mutation is being executed..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e8ecf4]">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActiveAction(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={activeAction.type === 'DEACTIVATE' ? 'danger' : 'primary'}
                  loading={actionLoading}
                >
                  Confirm & Audit
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default StaffPage;
