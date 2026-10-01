import React, { useState, useEffect } from 'react';
import { ShieldCheck, QrCode, Key, Check, Copy, AlertCircle, Loader2, X, Lock } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface MfaSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MfaSetupModal: React.FC<MfaSetupModalProps> = ({ isOpen, onClose }) => {
  const { staff, setAuth, token } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [secretKey, setSecretKey] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && !staff?.mfaEnabled) {
      loadMfaSetup();
    }
    if (isOpen) {
      setError(null);
      setSuccess(null);
      setCode('');
    }
  }, [isOpen]);

  const loadMfaSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ secret: string; qrCodeDataUrl: string }>('/auth/mfa/setup', {
        method: 'POST',
      });
      setQrCodeUrl(data.qrCodeDataUrl);
      setSecretKey(data.secret);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize MFA setup.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.trim().length !== 6) {
      setError('Please enter a valid 6-digit code from Microsoft Authenticator.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await apiFetch<any>('/auth/mfa/confirm', {
        method: 'POST',
        body: JSON.stringify({
          tempSecret: secretKey,
          code: code.trim(),
        }),
      });

      if (response?.accessToken) {
        setAuth(response.staff || staff, response.accessToken);
      } else if (staff && token) {
        setAuth({ ...staff, mfaEnabled: true }, token);
      }

      setSuccess('Two-Factor Authentication is now active on your account!');
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'Invalid 6-digit code. Please verify the code in Microsoft Authenticator.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-900 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Two-Factor Authentication (2FA)</h3>
            <p className="text-xs text-slate-400">Microsoft Authenticator / Google Authenticator</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-300">
            <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* State 1: MFA is already enabled */}
        {staff?.mfaEnabled && (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-300">2FA is Enforced & Active</p>
                <p className="text-[11px] text-slate-400">Your staff account is protected by RFC 6238 TOTP.</p>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-4 py-2 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* State 2: Setup Enrollment Flow */}
        {!staff?.mfaEnabled && (
          <div>
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs text-slate-400">Generating secure TOTP secret...</p>
              </div>
            ) : (
              <form onSubmit={handleConfirmMfa} className="space-y-5">
                <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
                  {qrCodeUrl ? (
                    <div className="bg-white p-2 rounded-xl shrink-0 shadow-md">
                      <img src={qrCodeUrl} alt="2FA QR Code" className="w-32 h-32" />
                    </div>
                  ) : (
                    <div className="w-32 h-32 bg-slate-800 rounded-xl flex items-center justify-center text-slate-600">
                      <QrCode className="w-12 h-12" />
                    </div>
                  )}

                  <div className="space-y-2 text-left min-w-0 flex-1">
                    <p className="text-xs text-slate-300 font-medium">
                      1. Open <strong>Microsoft Authenticator</strong>.
                    </p>
                    <p className="text-xs text-slate-300 font-medium">
                      2. Tap <strong>+</strong> &rarr; <strong>Other account</strong> &rarr; <strong>Scan QR code</strong>.
                    </p>

                    <div className="pt-1">
                      <span className="text-[10px] text-slate-500 uppercase font-mono block mb-1">
                        Manual Entry Key:
                      </span>
                      <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                        <code className="text-[11px] font-mono text-indigo-300 truncate">{secretKey}</code>
                        <button
                          type="button"
                          onClick={handleCopySecret}
                          className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition shrink-0"
                          title="Copy Secret"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    3. Enter the 6-digit code shown in Microsoft Authenticator:
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 492019"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-center text-lg font-mono tracking-widest text-indigo-300 placeholder-slate-700 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || code.length !== 6}
                    className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-500/25"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Verify & Activate 2FA
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
