import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, KeyRound, ArrowRight, AlertCircle, Loader2, QrCode, Copy, Check } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [step, setStep] = useState<'CREDENTIALS' | 'PASSWORD_CHANGE' | 'MFA_CHALLENGE' | 'MFA_SETUP'>('CREDENTIALS');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeToken, setPasswordChangeToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [staffInfo, setStaffInfo] = useState<any>(null);

  // MFA Setup State
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [copied, setCopied] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dev bypass is enabled in Vite development mode
  const isDevBypassAllowed = import.meta.env.DEV;

  const handleDevBypass = async (role: 'OWNER' | 'FINANCE' | 'SUPPORT') => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<any>(`/auth/dev-token?role=${role}`);
      if (res.token && res.staff) {
        setAuth(
          {
            id: res.staff.id,
            email: res.staff.email,
            fullName: res.staff.name || res.staff.fullName || `Platform ${role}`,
            role: res.staff.role || role,
            mfaEnabled: true,
          },
          res.token
        );
        navigate('/');
        return;
      }
    } catch {
      setAuth(
        {
          id: `stf_demo_${role.toLowerCase()}`,
          email: `${role.toLowerCase()}@proctora.local`,
          fullName: `Platform ${role}`,
          role,
          mfaEnabled: true,
        },
        `demo_jwt_token_${role.toLowerCase()}`
      );
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiFetch<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (response.mustChangePassword) {
        setPasswordChangeToken(response.passwordChangeToken);
        setStaffInfo(response.staff);
        setStep('PASSWORD_CHANGE');
      } else if (response.mfaRequired) {
        // Account has MFA configured -> challenge step
        setChallengeToken(response.mfaChallengeToken);
        setStaffInfo(response.staff);
        setStep('MFA_CHALLENGE');
      } else if (response.mfaSetupRequired) {
        // Account has NO MFA configured -> mandatory non-dismissable setup step
        setSetupToken(response.setupToken);
        setStaffInfo(response.staff);
        await initMfaSetup(response.setupToken);
        setStep('MFA_SETUP');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<any>('/auth/change-password', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${passwordChangeToken}`,
        },
        body: JSON.stringify({
          currentPassword: password,
          newPassword,
        }),
      });

      if (response.mfaRequired) {
        setChallengeToken(response.mfaChallengeToken);
        setStep('MFA_CHALLENGE');
      } else if (response.mfaSetupRequired) {
        setSetupToken(response.setupToken);
        await initMfaSetup(response.setupToken);
        setStep('MFA_SETUP');
      } else if (response.accessToken) {
        setAuth(staffInfo || response.staff, response.accessToken);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to change password. Ensure policy is met.');
    } finally {
      setIsLoading(false);
    }
  };

  const initMfaSetup = async (token: string) => {
    try {
      const data = await apiFetch<any>('/auth/mfa/setup', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setQrCodeUrl(data.qrCodeDataUrl);
      setSecretKey(data.secret);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize MFA setup.');
    }
  };

  const handleMfaChallengeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiFetch<any>('/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({
          challengeToken,
          code: totpCode,
        }),
      });

      if (response.accessToken) {
        setAuth(staffInfo || response.staff, response.accessToken);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid 6-digit TOTP code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSetupConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiFetch<any>('/auth/mfa/confirm', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${setupToken}`,
        },
        body: JSON.stringify({
          tempSecret: secretKey,
          code: totpCode,
        }),
      });

      if (response.accessToken) {
        setAuth(staffInfo || response.staff, response.accessToken);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please check Microsoft Authenticator.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#f7f7f9] flex flex-col justify-center items-center px-4 relative overflow-hidden select-none">
      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-2xl p-8 border border-[#e8ecf4] shadow-2xl relative z-10 text-[#0d1424]">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-13 h-13 rounded-2xl bg-[#eff6ff] text-[#2f68ff] flex items-center justify-center shadow-xs mb-3 border border-[#bfdbfe]">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-[#0d1424]">Proctora Operations Cockpit</h2>
          <p className="text-xs text-[#64748b] mt-1">Super Admin Authentication Gateway</p>
        </div>

        {error && (
          <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: CREDENTIALS */}
        {step === 'CREDENTIALS' && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#0d1424] mb-1.5">Staff Email</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@proctora.internal"
                  className="w-full bg-white border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-xs text-[#0d1424] placeholder-[#94a3b8] focus:outline-none focus:border-[#2f68ff] focus:ring-2 focus:ring-[#2f68ff]/10 transition shadow-2xs font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0d1424] mb-1.5">Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-white border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-xs text-[#0d1424] placeholder-[#94a3b8] focus:outline-none focus:border-[#2f68ff] focus:ring-2 focus:ring-[#2f68ff]/10 transition font-mono shadow-2xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-[#2f68ff] hover:bg-[#1e50ff] text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition duration-150 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                </>
              ) : (
                <>
                  Continue <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 1.5: FORCED PASSWORD CHANGE */}
        {step === 'PASSWORD_CHANGE' && (
          <form onSubmit={handlePasswordChangeSubmit} className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center mx-auto mb-2">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-xs text-[#0d1424] font-bold">Mandatory Password Update</p>
              <p className="text-[11px] text-[#64748b] mt-0.5">
                Your account requires an immediate password update before logging in.
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-[#f8fafc] border border-[#e8ecf4] text-[11px] text-[#64748b] space-y-1">
              <p className="font-semibold text-[#0d1424]">Password Policy:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-[10px]">
                <li>At least 12 characters</li>
                <li>Upper, lower, number, and special character</li>
                <li>Must differ from current temporary password</li>
                <li>Must not contain your email prefix</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0d1424] mb-1.5">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New strong password"
                className="w-full bg-white border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-[#0d1424] placeholder-[#94a3b8] focus:outline-none focus:border-[#2f68ff] font-mono shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0d1424] mb-1.5">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full bg-white border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-[#0d1424] placeholder-[#94a3b8] focus:outline-none focus:border-[#2f68ff] font-mono shadow-2xs"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !newPassword || !confirmPassword}
              className="w-full mt-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition duration-150 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Updating Password...
                </>
              ) : (
                <>
                  Set Password & Proceed <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: MFA CHALLENGE (FOR ENROLLED ACCOUNTS) */}
        {step === 'MFA_CHALLENGE' && (
          <form onSubmit={handleMfaChallengeSubmit} className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-10 h-10 rounded-full bg-[#eff6ff] text-[#2f68ff] border border-[#bfdbfe] flex items-center justify-center mx-auto mb-2">
                <KeyRound className="w-5 h-5" />
              </div>
              <p className="text-xs text-[#0d1424] font-semibold">Two-Factor Authentication Required</p>
              <p className="text-[11px] text-[#64748b] mt-0.5">
                Enter the 6-digit TOTP code from Microsoft Authenticator for <strong>{email}</strong>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0d1424] mb-1.5">6-Digit Security Token</label>
              <input
                type="text"
                required
                maxLength={6}
                pattern="[0-9]{6}"
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full bg-white border border-[#e2e8f0] rounded-xl px-3.5 py-3 text-center text-lg tracking-[0.5em] font-mono text-[#2f68ff] placeholder-[#cbd5e1] focus:outline-none focus:border-[#2f68ff] focus:ring-2 focus:ring-[#2f68ff]/10 transition shadow-2xs font-bold"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full mt-2 bg-[#2f68ff] hover:bg-[#1e50ff] text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition duration-150 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Verifying TOTP...
                </>
              ) : (
                <>
                  Verify & Enter Cockpit <ShieldCheck className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('CREDENTIALS');
                setTotpCode('');
                setError(null);
              }}
              className="w-full text-center text-xs text-[#64748b] hover:text-[#0d1424] py-1 transition cursor-pointer"
            >
              Back to credentials
            </button>
          </form>
        )}

        {/* STEP 3: MANDATORY NON-DISMISSABLE MFA SETUP */}
        {step === 'MFA_SETUP' && (
          <form onSubmit={handleMfaSetupConfirm} className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center mx-auto mb-2">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-xs text-[#0d1424] font-bold">Mandatory 2FA Enrollment</p>
              <p className="text-[11px] text-[#64748b] mt-0.5">
                All platform staff must enroll in 2FA before accessing the cockpit.
              </p>
            </div>

            <div className="bg-[#f8fafc] border border-[#e8ecf4] rounded-xl p-3 flex flex-col items-center gap-3">
              {qrCodeUrl ? (
                <div className="bg-white p-2 rounded-xl shadow-xs border border-[#e8ecf4]">
                  <img src={qrCodeUrl} alt="2FA QR Code" className="w-28 h-28" />
                </div>
              ) : (
                <div className="w-28 h-28 bg-[#eff0f3] rounded-xl flex items-center justify-center text-[#94a3b8]">
                  <QrCode className="w-10 h-10" />
                </div>
              )}

              <div className="w-full text-center space-y-1">
                <p className="text-[11px] text-[#0d1424] font-medium">
                  Scan QR with <strong>Microsoft Authenticator</strong>
                </p>
                <div className="flex items-center justify-center gap-2 bg-white px-2 py-1 rounded-lg border border-[#e2e8f0]">
                  <code className="text-[10px] font-mono text-[#2f68ff] font-semibold truncate max-w-[200px]">{secretKey}</code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="text-[#64748b] hover:text-[#0d1424] p-0.5 cursor-pointer"
                    title="Copy Secret"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0d1424] mb-1">
                Enter 6-Digit Code to Confirm:
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full bg-white border border-[#e2e8f0] rounded-xl px-3.5 py-2.5 text-center text-lg tracking-[0.5em] font-mono text-[#2f68ff] placeholder-[#cbd5e1] focus:outline-none focus:border-[#2f68ff] transition shadow-2xs font-bold"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full mt-1 bg-[#2f68ff] hover:bg-[#1e50ff] text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition duration-150 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Activating...
                </>
              ) : (
                <>
                  Activate 2FA & Enter Cockpit <ShieldCheck className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('CREDENTIALS');
                setTotpCode('');
                setError(null);
              }}
              className="w-full text-center text-xs text-[#64748b] hover:text-[#0d1424] py-1 transition cursor-pointer"
            >
              Cancel & back to login
            </button>
          </form>
        )}

        {/* Dev Quick Login / One-Click Access */}
        {isDevBypassAllowed && (
          <div className="mt-6 pt-5 border-t border-[#f1f5f9]">
            <p className="text-[11px] font-mono text-[#64748b] text-center mb-2.5">
              ⚡ One-Click Dev Sign-In (Direct API Token)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleDevBypass('OWNER')}
                disabled={isLoading}
                className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-[11px] font-bold py-2 px-1.5 rounded-xl transition text-center disabled:opacity-50 cursor-pointer"
              >
                👑 OWNER
              </button>
              <button
                type="button"
                onClick={() => handleDevBypass('FINANCE')}
                disabled={isLoading}
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold py-2 px-1.5 rounded-xl transition text-center disabled:opacity-50 cursor-pointer"
              >
                💳 FINANCE
              </button>
              <button
                type="button"
                onClick={() => handleDevBypass('SUPPORT')}
                disabled={isLoading}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold py-2 px-1.5 rounded-xl transition text-center disabled:opacity-50 cursor-pointer"
              >
                🛡️ SUPPORT
              </button>
            </div>

            <div className="mt-3 p-2.5 rounded-xl bg-[#f8fafc] border border-[#e8ecf4] text-[11px] font-mono text-[#64748b] space-y-1">
              <div className="font-semibold text-[#0d1424] mb-1">Seeded Dev Credentials:</div>
              <div className="flex justify-between">
                <span>Owner:</span>
                <span className="text-[#0d1424]">owner@proctora.local / ProctoraOwner#2026</span>
              </div>
              <div className="flex justify-between">
                <span>Finance:</span>
                <span className="text-[#0d1424]">finance@proctora.local / ProctoraFinance#2026</span>
              </div>
              <div className="flex justify-between">
                <span>Support:</span>
                <span className="text-[#0d1424]">support@proctora.local / ProctoraSupport#2026</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 text-center text-[#94a3b8] text-[11px] font-mono">
        Strict PII-Blindness & Append-Only Audit Trigger Enforced
      </div>
    </div>
  );
};
