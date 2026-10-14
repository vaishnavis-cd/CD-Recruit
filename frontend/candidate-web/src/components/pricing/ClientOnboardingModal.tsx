import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Building,
  Mail,
  User,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ShieldCheck,
  Check,
  ExternalLink,
} from 'lucide-react';

interface ClientOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTierId?: string;
}

const DISALLOWED_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'aol.com',
  'zoho.com',
  'proton.me',
  'protonmail.com',
];

export const ClientOnboardingModal: React.FC<ClientOnboardingModalProps> = ({
  isOpen,
  onClose,
  selectedTierId,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [billingCountry, setBillingCountry] = useState('IN');
  const [adminName, setAdminName] = useState('');
  const [password, setPassword] = useState('');
  const [intendedUse, setIntendedUse] = useState('CAMPUS_HIRING');

  // Success State
  const [signupResult, setSignupResult] = useState<any>(null);

  // Validate personal email live
  const emailDomain = workEmail.includes('@') ? workEmail.split('@')[1]?.toLowerCase().trim() : '';
  const isPersonalEmail = DISALLOWED_DOMAINS.includes(emailDomain);

  // Password Strength Requirements
  const hasMinLength = password.length >= 8;
  const hasUpperLower = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z\d]/.test(password);
  const isPasswordValid = hasMinLength && hasUpperLower && hasNumber && hasSpecial;

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!companyName.trim()) {
      setError('Please enter your company or institutional name.');
      return;
    }

    if (!workEmail.trim() || !workEmail.includes('.')) {
      setError('Please provide a valid work email address.');
      return;
    }

    if (isPersonalEmail) {
      setError(
        'Please use your company or institutional email address (e.g., alex@company.com). Free email providers like Gmail or Yahoo are not supported for corporate workspace onboarding.',
      );
      return;
    }

    setStep(2);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!adminName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!isPasswordValid) {
      setError('Please satisfy all password complexity requirements.');
      return;
    }

    setLoading(true);

    try {
      const apiUrl = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/public/onboarding/signup`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          workEmail: workEmail.trim().toLowerCase(),
          adminName: adminName.trim(),
          password,
          billingCountry,
          intendedUse,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to create workspace.');
      }

      setSignupResult(data);
      setStep(3); // Celebration step
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchConsole = () => {
    if (!signupResult) return;
    const adminUrl = `http://localhost:5174/login?token=${encodeURIComponent(
      signupResult.accessToken,
    )}&refreshToken=${encodeURIComponent(signupResult.refreshToken)}`;
    window.location.href = adminUrl;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden text-slate-900">
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center text-white">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {step === 3 ? 'Workspace Ready!' : 'Start Free Recruiter Trial'}
              </h3>
              <p className="text-[11px] text-blue-100">
                {step === 1 && 'Step 1 of 2: Company details & corporate domain'}
                {step === 2 && 'Step 2 of 2: Admin credentials & hiring focus'}
                {step === 3 && '25 free credits provisioned & verified'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-7">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 leading-relaxed">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* ═══ STEP 1: COMPANY PROFILE ═══ */}
          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Company / Organization Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Building size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Corporation or Stanford University"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Corporate Work Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    required
                    value={workEmail}
                    onChange={(e) => setWorkEmail(e.target.value)}
                    placeholder="e.g. recruiter@acme.com"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
                      isPersonalEmail
                        ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-100'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
                    }`}
                  />
                </div>
                {isPersonalEmail && (
                  <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1 font-medium">
                    <AlertCircle size={12} /> Personal email domain detected. Please use your official company domain.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Billing Country / Region
                </label>
                <select
                  value={billingCountry}
                  onChange={(e) => setBillingCountry(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white"
                >
                  <option value="IN">🇮🇳 India (INR ₹ Price Book)</option>
                  <option value="US">🇺🇸 United States / Global (USD $ Price Book)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Instant activation &bull; Zero credit card needed
                </span>
                <button
                  type="submit"
                  disabled={isPersonalEmail || !companyName || !workEmail}
                  className="py-2.5 px-5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </form>
          )}

          {/* ═══ STEP 2: RECRUITER ADMIN CREDENTIALS ═══ */}
          {step === 2 && (
            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Recruiter Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Create Admin Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock size={16} />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 characters with numbers & symbols"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>

                {/* Password requirement chips */}
                <div className="grid grid-cols-2 gap-2 mt-2 pt-1">
                  <div className={`text-[10px] flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                    <div className={`w-3 h-3 rounded-full flex items-center justify-center ${hasMinLength ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <Check size={8} strokeWidth={3} />
                    </div>
                    8+ Characters
                  </div>
                  <div className={`text-[10px] flex items-center gap-1.5 ${hasUpperLower ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                    <div className={`w-3 h-3 rounded-full flex items-center justify-center ${hasUpperLower ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <Check size={8} strokeWidth={3} />
                    </div>
                    Uppercase & Lowercase
                  </div>
                  <div className={`text-[10px] flex items-center gap-1.5 ${hasNumber ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                    <div className={`w-3 h-3 rounded-full flex items-center justify-center ${hasNumber ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <Check size={8} strokeWidth={3} />
                    </div>
                    At least one Number
                  </div>
                  <div className={`text-[10px] flex items-center gap-1.5 ${hasSpecial ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                    <div className={`w-3 h-3 rounded-full flex items-center justify-center ${hasSpecial ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <Check size={8} strokeWidth={3} />
                    </div>
                    Special Character (!@#$)
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Primary Hiring Focus
                </label>
                <select
                  value={intendedUse}
                  onChange={(e) => setIntendedUse(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white"
                >
                  <option value="CAMPUS_HIRING">College Campus Drives & Volume Graduate Hiring</option>
                  <option value="EXPERIENCED_HIRING">Experienced / Lateral Software Engineers</option>
                  <option value="HACKATHONS">Hackathons & Coding Competitions</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                >
                  &larr; Back
                </button>
                <button
                  type="submit"
                  disabled={loading || !isPasswordValid || !adminName}
                  className="py-2.5 px-5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {loading ? 'Provisioning...' : 'Complete Setup & Launch'}
                  {!loading && <ArrowRight size={14} />}
                </button>
              </div>
            </form>
          )}

          {/* ═══ STEP 3: CELEBRATION & HANDOFF ═══ */}
          {step === 3 && signupResult && (
            <div className="text-center py-4 space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 mx-auto flex items-center justify-center shadow-xs">
                <CheckCircle2 size={36} strokeWidth={2.5} />
              </div>

              <div>
                <h4 className="text-xl font-bold text-slate-900">
                  Welcome, {signupResult.user.name}!
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Your corporate workspace for{' '}
                  <strong className="text-slate-800">{signupResult.organization.name}</strong> has been
                  initialized with 25 complimentary candidate credits.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 text-left space-y-2.5 text-xs text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Corporate Domain:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    @{workEmail.split('@')[1]}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Workspace Slug:</span>
                  <span className="font-mono font-semibold text-blue-600">
                    {signupResult.organization.slug}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Active Evaluation Credits:</span>
                  <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    25 Credits (Valid 30 Days)
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleLaunchConsole}
                  className="w-full py-3.5 px-6 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Launch Recruiter Console Now
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
