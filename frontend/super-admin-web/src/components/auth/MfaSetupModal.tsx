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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-[#e8ecf4] rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-[#0d1424]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#94a3b8] hover:text-[#0d1424] p-1.5 rounded-lg hover:bg-[#f1f5f9] transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#eff6ff] text-[#2f68ff] flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#0d1424]">Two-Factor Authentication (2FA)</h3>
            <p className="text-xs text-[#64748b]">Microsoft Authenticator / Google Authenticator</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-800">
            <Check className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* State 1: MFA is already enabled */}
        {staff?.mfaEnabled && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900">2FA is Enforced & Active</p>
                <p className="text-[11px] text-[#64748b]">Your staff account is protected by RFC 6238 TOTP.</p>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0d1424] text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
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
                <Loader2 className="w-8 h-8 text-[#2f68ff] animate-spin" />
                <p className="text-xs text-[#64748b]">Generating secure TOTP secret...</p>
              </div>
            ) : (
              <form onSubmit={handleConfirmMfa} className="space-y-5">
                <div className="bg-[#f8fafc] border border-[#e8ecf4] rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
                  {qrCodeUrl ? (
                    <div className="bg-white p-2 rounded-xl shrink-0 shadow-sm border border-[#e8ecf4]">
                      <img src={qrCodeUrl} alt="2FA QR Code" className="w-32 h-32" />
                    </div>
                  ) : (
                    <div className="w-32 h-32 bg-[#eff0f3] rounded-xl flex items-center justify-center text-[#94a3b8]">
                      <QrCode className="w-12 h-12" />
                    </div>
                  )}

                  <div className="space-y-2 text-left min-w-0 flex-1">
                    <p className="text-xs text-[#0d1424] font-medium">
                      1. Open <strong>Microsoft Authenticator</strong>.
                    </p>
                    <p className="text-xs text-[#0d1424] font-medium">
                      2. Tap <strong>+</strong> &rarr; <strong>Other account</strong> &rarr; <strong>Scan QR code</strong>.
                    </p>

                    <div className="pt-1">
                      <span className="text-[10px] text-[#94a3b8] uppercase font-mono block mb-1">
                        Manual Entry Key:
                      </span>
                      <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-[#e2e8f0]">
                        <code className="text-[11px] font-mono text-[#2f68ff] font-semibold truncate">{secretKey}</code>
                        <button
                          type="button"
                          onClick={handleCopySecret}
                          className="text-[#64748b] hover:text-[#0d1424] p-1 rounded hover:bg-[#f1f5f9] transition shrink-0 cursor-pointer"
                          title="Copy Secret"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0d1424] mb-1.5">
                    3. Enter the 6-digit code shown in Microsoft Authenticator:
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 492019"
                    className="w-full bg-white border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-center text-lg font-mono tracking-widest text-[#2f68ff] placeholder-[#cbd5e1] focus:outline-none focus:border-[#2f68ff] focus:ring-2 focus:ring-[#2f68ff]/10 transition shadow-2xs font-bold"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="bg-white border border-[#e2e8f0] hover:bg-[#f8fafc] text-[#64748b] hover:text-[#0d1424] text-xs font-semibold px-4 py-2.5 rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || code.length !== 6}
                    className="bg-[#2f68ff] hover:bg-[#1e50ff] disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer"
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
