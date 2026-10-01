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

  // Dev bypass is strictly enabled ONLY when Vite DEV is true AND VITE_USE_MOCKS === 'true'
  const isDevBypassAllowed = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true';

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
    <div className="min-h-screen bg-[#030712] flex flex-col justify-center items-center px-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-md glass-panel-glow rounded-2xl p-8 border border-slate-800/80 shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Platform Operations Cockpit</h2>
          <p className="text-xs text-slate-400 mt-1">Super Admin Authentication Gateway</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: CREDENTIALS */}
        {step === 'CREDENTIALS' && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Staff Email</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@proctora.internal"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition duration-150 disabled:opacity-50"
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
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-2">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-200 font-bold">Mandatory Password Update</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Your account requires an immediate password update before logging in.
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">Password Policy:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-[10px]">
                <li>At least 12 characters</li>
                <li>Upper, lower, number, and special character</li>
                <li>Must differ from current temporary password</li>
                <li>Must not contain your email prefix</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New strong password"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !newPassword || !confirmPassword}
              className="w-full mt-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition duration-150 disabled:opacity-50"
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
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto mb-2">
                <KeyRound className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-300 font-medium">Two-Factor Authentication Required</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Enter the 6-digit TOTP code from Microsoft Authenticator for <strong>{email}</strong>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">6-Digit Security Token</label>
              <input
                type="text"
                required
                maxLength={6}
                pattern="[0-9]{6}"
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-3 text-center text-lg tracking-[0.5em] font-mono text-indigo-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition duration-150 disabled:opacity-50"
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
              className="w-full text-center text-xs text-slate-500 hover:text-slate-300 py-1 transition"
            >
              Back to credentials
            </button>
          </form>
        )}

        {/* STEP 3: MANDATORY NON-DISMISSABLE MFA SETUP */}
        {step === 'MFA_SETUP' && (
          <form onSubmit={handleMfaSetupConfirm} className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-2">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-200 font-bold">Mandatory 2FA Enrollment</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                All platform staff must enroll in 2FA before accessing the cockpit.
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex flex-col items-center gap-3">
              {qrCodeUrl ? (
                <div className="bg-white p-2 rounded-xl shadow-md">
                  <img src={qrCodeUrl} alt="2FA QR Code" className="w-28 h-28" />
                </div>
              ) : (
                <div className="w-28 h-28 bg-slate-800 rounded-xl flex items-center justify-center text-slate-600">
                  <QrCode className="w-10 h-10" />
                </div>
              )}

              <div className="w-full text-center space-y-1">
                <p className="text-[11px] text-slate-300">
                  Scan QR with <strong>Microsoft Authenticator</strong>
                </p>
                <div className="flex items-center justify-center gap-2 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                  <code className="text-[10px] font-mono text-indigo-300 truncate max-w-[200px]">{secretKey}</code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="text-slate-400 hover:text-slate-200 p-0.5"
                    title="Copy Secret"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Enter 6-Digit Code to Confirm:
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 text-center text-lg tracking-[0.5em] font-mono text-indigo-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full mt-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition duration-150 disabled:opacity-50"
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
              className="w-full text-center text-xs text-slate-500 hover:text-slate-300 py-1 transition"
            >
              Cancel & back to login
            </button>
          </form>
        )}

        {/* dev-only, injects a fake session that the backend will reject */}
        {isDevBypassAllowed && (
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <p className="text-[11px] font-mono text-slate-400 text-center mb-2.5">
              ⚡ Quick Dev / Demo Bypass (Mock Only)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuth(
                    {
                      id: 'stf_demo_owner',
                      email: 'owner@proctora.internal',
                      fullName: 'Chief Super Admin',
                      role: 'OWNER',
                      mfaEnabled: true,
                    },
                    'demo_jwt_token_owner'
                  );
                  navigate('/');
                }}
                className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-bold py-2 px-2.5 rounded-xl transition text-center"
              >
                👑 Enter as OWNER
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuth(
                    {
                      id: 'stf_demo_support',
                      email: 'support@proctora.internal',
                      fullName: 'Alex Morgan (Support)',
                      role: 'SUPPORT',
                      mfaEnabled: true,
                    },
                    'demo_jwt_token_support'
                  );
                  navigate('/');
                }}
                className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-bold py-2 px-2.5 rounded-xl transition text-center"
              >
                🛡️ Enter as SUPPORT
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 text-center text-slate-500 text-[11px] font-mono">
        Strict PII-Blindness & Append-Only Audit Trigger Enforced
      </div>
    </div>
  );
};
