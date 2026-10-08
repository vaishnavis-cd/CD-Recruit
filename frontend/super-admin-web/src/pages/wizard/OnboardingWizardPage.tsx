import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Check,
  Building2,
  Globe,
  User,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Sparkles,
  Save,
  Trash2,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface Draft {
  id: string;
  corporateDomain: string;
  currentStep: number;
  draftData: any;
  expiresAt: string;
  updatedAt: string;
}

export const OnboardingWizardPage: React.FC = () => {
  const navigate = useNavigate();

  // Draft Management State
  const [draftId, setDraftId] = useState<string | null>(null);
  const [existingDrafts, setExistingDrafts] = useState<Draft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Wizard Navigation
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Company
    companyName: '',
    slug: '',
    billingCountry: 'US',
    currency: 'USD',
    legalEntityName: '',
    taxId: '',

    // Step 2: First Tenant Admin
    adminName: '',
    adminEmail: '',

    // Step 3: Domain & Licensing
    domain: '',
    licenseTier: 'STARTER',
    internalOwnerId: '',

    // Step 5: Walkthrough Checklist
    kickoffCallDone: false,
    sampleDriveDeployed: false,
    adminTrained: false,
  });

  // Step 3 Domain Verification State
  const [isVerifyingDomain, setIsVerifyingDomain] = useState(false);
  const [domainCheckResult, setDomainCheckResult] = useState<{
    ok: boolean;
    reasons: string[];
    normalizedDomain?: string;
  } | null>(null);

  // Commit & Result State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [committedOrg, setCommittedOrg] = useState<{
    organizationId: string;
    billingAccountId: string;
    trial: { creditsGranted: number; validityDays: number; expiresAt: string };
  } | null>(null);

  const steps = [
    { num: 1, label: 'Company Profile', icon: Building2 },
    { num: 2, label: 'Tenant Admin', icon: User },
    { num: 3, label: 'Domain & Tier', icon: Globe },
    { num: 4, label: 'Review & Commit', icon: ShieldCheck },
    { num: 5, label: 'Walkthrough Checklist', icon: CheckCircle2 },
    { num: 6, label: 'Completed', icon: Sparkles },
  ];

  // Fetch active drafts on mount
  useEffect(() => {
    fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    try {
      setLoadingDrafts(true);
      const drafts = await apiFetch<Draft[]>('/onboarding/drafts');
      setExistingDrafts(drafts || []);
    } catch (err) {
      setExistingDrafts([]);
    } finally {
      setLoadingDrafts(false);
    }
  };

  // Auto-generate slug from company name if empty or pristine
  const handleCompanyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    const autoSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    setFormData((prev) => ({
      ...prev,
      companyName: name,
      slug: prev.slug === '' || prev.slug === prev.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-') ? autoSlug : prev.slug,
    }));
  };

  // Create new draft or load an existing one
  const handleStartNewDraft = async () => {
    try {
      setSaveStatus('saving');
      const draft = await apiFetch<Draft>('/onboarding/drafts', {
        method: 'POST',
        body: JSON.stringify({ draftData: formData }),
      });
      setDraftId(draft.id);
      setCurrentStep(1);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const handleResumeDraft = (draft: Draft) => {
    setDraftId(draft.id);
    const data = draft.draftData || {};
    setFormData((prev) => ({
      ...prev,
      companyName: data.companyName || '',
      slug: data.slug || '',
      billingCountry: data.billingCountry || 'US',
      currency: data.currency || (data.billingCountry === 'IN' ? 'INR' : 'USD'),
      legalEntityName: data.legalEntityName || '',
      taxId: data.taxId || '',
      adminName: data.adminName || '',
      adminEmail: data.adminEmail || '',
      domain: data.domain || '',
      licenseTier: data.licenseTier || 'STARTER',
      internalOwnerId: data.internalOwnerId || '',
    }));
    setCurrentStep(Math.min(4, Math.max(1, draft.currentStep || 1)));
    setDomainCheckResult(null);
  };

  const handleDeleteDraft = async (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch(`/onboarding/drafts/${idToDelete}`, { method: 'DELETE' });
      setExistingDrafts((prev) => prev.filter((d) => d.id !== idToDelete));
      if (draftId === idToDelete) {
        setDraftId(null);
        setCurrentStep(1);
      }
    } catch (err) {
      console.error('Failed to delete draft', err);
    }
  };

  // Autosave with 800ms debounce
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!draftId || currentStep >= 5) return;

    setSaveStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        await apiFetch(`/onboarding/drafts/${draftId}`, {
          method: 'PUT',
          body: JSON.stringify({
            currentStep,
            draftData: formData,
          }),
        });
        setSaveStatus('saved');
      } catch (err) {
        setSaveStatus('error');
      }
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [formData, currentStep, draftId]);

  // Step 3 Domain Check
  const handleVerifyDomain = async () => {
    if (!formData.domain || !formData.adminEmail) return;

    setIsVerifyingDomain(true);
    setDomainCheckResult(null);

    try {
      const res = await apiFetch<{ ok: boolean; normalizedDomain: string; reasons: string[] }>(
        '/onboarding/domain-check',
        {
          method: 'POST',
          body: JSON.stringify({
            domain: formData.domain.trim(),
            adminEmail: formData.adminEmail.trim(),
          }),
        },
      );
      setDomainCheckResult(res);
      if (res.ok && res.normalizedDomain) {
        setFormData((prev) => ({ ...prev, domain: res.normalizedDomain }));
      }
    } catch (err: any) {
      setDomainCheckResult({
        ok: false,
        reasons: [err.message || 'Domain check service failed.'],
      });
    } finally {
      setIsVerifyingDomain(false);
    }
  };

  // Step 4 Atomic Commit
  const handleCommitTenant = async () => {
    if (!draftId) return;

    setIsSubmitting(true);
    setCommitError(null);

    try {
      const result = await apiFetch<{
        organizationId: string;
        billingAccountId: string;
        trial: { creditsGranted: number; validityDays: number; expiresAt: string };
      }>(`/onboarding/drafts/${draftId}/commit`, {
        method: 'POST',
      });

      setCommittedOrg(result);
      setCurrentStep(5);
    } catch (err: any) {
      const msg =
        err instanceof ApiError && err.data?.message
          ? Array.isArray(err.data.message)
            ? err.data.message.join(', ')
            : err.data.message
          : err.message || 'Tenant creation failed. Please review errors.';
      setCommitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 5 Walkthrough Checklist Save
  const handleSaveWalkthrough = async () => {
    if (!committedOrg?.organizationId) {
      setCurrentStep(6);
      return;
    }

    try {
      await apiFetch(`/tenants/${committedOrg.organizationId}/walkthrough`, {
        method: 'PATCH',
        body: JSON.stringify({
          kickoffCallDone: formData.kickoffCallDone,
          sampleDriveDeployed: formData.sampleDriveDeployed,
          adminTrained: formData.adminTrained,
        }),
      });
    } catch (err) {
      console.error('Walkthrough update error', err);
    } finally {
      setCurrentStep(6);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Wizard Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-[#2f68ff]" />
            Tenant Onboarding Wizard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Standard 6-step atomic tenant provisioning • Company, Admin, Domain, Atomic Commit & Walkthrough
          </p>
        </div>

        {draftId && currentStep < 5 && (
          <div className="flex items-center gap-2 text-xs font-mono bg-white border border-[#e8ecf4] shadow-xs px-3 py-1.5 rounded-xl">
            <Save className={`w-3.5 h-3.5 ${saveStatus === 'saving' ? 'text-amber-500 animate-spin' : saveStatus === 'saved' ? 'text-[#12b76a]' : 'text-slate-400'}`} />
            <span className={saveStatus === 'saved' ? 'text-[#12b76a] font-semibold' : 'text-slate-500'}>
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Draft Autosaved' : 'Draft Ready'}
            </span>
          </div>
        )}
      </div>

      {/* Resume Drafts Banner (Step 1 when no active draft loaded) */}
      {!draftId && existingDrafts.length > 0 && currentStep === 1 && (
        <div className="bg-[#eff6ff]/60 rounded-2xl p-5 border border-[#bfdbfe] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#2f68ff] uppercase tracking-wider flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-[#2f68ff]" />
              Resume Existing Onboarding Drafts
            </h3>
            <span className="text-[11px] text-slate-500">{existingDrafts.length} drafts saved</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {existingDrafts.map((d) => (
              <div
                key={d.id}
                onClick={() => handleResumeDraft(d)}
                className="bg-white hover:bg-slate-50 border border-[#e8ecf4] hover:border-[#2f68ff]/40 rounded-xl p-3.5 cursor-pointer transition flex items-center justify-between group shadow-xs"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#2f68ff] transition">
                    {d.draftData?.companyName || d.corporateDomain || 'Untitled Draft'}
                  </h4>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Step {d.currentStep} of 4 • Updated {new Date(d.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleDeleteDraft(d.id, e)}
                    className="p-1.5 text-slate-400 hover:text-[#f04438] rounded-lg hover:bg-slate-100 transition"
                    title="Delete draft"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ArrowRight className="w-4 h-4 text-[#2f68ff] group-hover:translate-x-0.5 transition" />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-[#dbeafe] flex justify-end">
            <button
              onClick={handleStartNewDraft}
              className="text-xs font-semibold text-[#2f68ff] hover:text-[#2557db] transition"
            >
              + Start fresh blank draft
            </button>
          </div>
        </div>
      )}

      {/* Step Indicator */}
      <div className="bg-white rounded-2xl p-4 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isDone = currentStep > step.num;
            const isCurrent = currentStep === step.num;

            return (
              <React.Fragment key={step.num}>
                <div className="flex flex-col items-center gap-1.5 relative">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs transition ${
                      isDone
                        ? 'bg-[#ecfdf3] text-[#12b76a] border border-[#a6f4c5]'
                        : isCurrent
                        ? 'bg-[#2f68ff] text-white shadow-md shadow-[#2f68ff]/25 ring-2 ring-[#2f68ff]/20'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span
                    className={`text-[11px] font-medium hidden sm:block ${
                      isCurrent ? 'text-[#2f68ff] font-bold' : isDone ? 'text-slate-700' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`flex-1 h-[2px] mx-2 sm:mx-3 ${
                      currentStep > idx + 1 ? 'bg-[#12b76a]' : 'bg-[#e2e8f0]'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step Form Container */}
      <div className="bg-white rounded-2xl p-6 border border-[#e8ecf4] shadow-[0_4px_16px_rgba(0,0,0,0.02)] space-y-6">
        {/* STEP 1: Company Profile */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Step 1: Company Profile & Commercial Entity</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Define primary company identity, URL slug, and billing currency metadata.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Company Name <span className="text-[#f04438]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corporation"
                  value={formData.companyName}
                  onChange={handleCompanyNameChange}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Workspace URL Slug <span className="text-[#f04438]">*</span>
                </label>
                <div className="flex items-center">
                  <span className="bg-slate-100 border border-r-0 border-[#e2e8f0] px-3 py-2 text-xs text-slate-500 rounded-l-xl font-mono">
                    app.proctora.com/
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="acme-corp"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-r-xl px-3.5 py-2 text-xs text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Billing Country (ISO-2) <span className="text-[#f04438]">*</span>
                </label>
                <select
                  value={formData.billingCountry}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      billingCountry: e.target.value,
                      currency: e.target.value === 'IN' ? 'INR' : 'USD',
                    })
                  }
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                >
                  <option value="US">United States (US)</option>
                  <option value="IN">India (IN)</option>
                  <option value="GB">United Kingdom (GB)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Currency (ISO-3) <span className="text-[#f04438]">*</span>
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white font-mono"
                >
                  <option value="USD">USD ($)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Legal Entity Name <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Acme Technologies Inc."
                  value={formData.legalEntityName}
                  onChange={(e) => setFormData({ ...formData, legalEntityName: e.target.value })}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tax Identification Number <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="EIN / GSTIN / VAT ID"
                  value={formData.taxId}
                  onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: First Tenant Admin */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Step 2: Primary Tenant Administrator</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Designate the initial organization admin who will receive workspace provisioning credentials.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Admin Full Name <span className="text-[#f04438]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Jane Doe"
                  value={formData.adminName}
                  onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Admin Corporate Email <span className="text-[#f04438]">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="jane.doe@acme.com"
                  value={formData.adminEmail}
                  onChange={(e) => {
                    const email = e.target.value;
                    const domainPart = email.includes('@') ? email.split('@')[1] : '';
                    setFormData((prev) => ({
                      ...prev,
                      adminEmail: email,
                      domain: prev.domain === '' && domainPart ? domainPart : prev.domain,
                    }));
                  }}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Domain Check & Licensing */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Step 3: Domain Verification & License Tier</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify corporate domain ownership and select initial platform licensing tier.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Corporate Email Domain <span className="text-[#f04438]">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. acme.com"
                    value={formData.domain}
                    onChange={(e) => {
                      setFormData({ ...formData, domain: e.target.value });
                      setDomainCheckResult(null);
                    }}
                    className="flex-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleVerifyDomain}
                    disabled={isVerifyingDomain || !formData.domain || !formData.adminEmail}
                    loading={isVerifyingDomain}
                  >
                    Check Domain
                  </Button>
                </div>
              </div>

              {/* Domain Check Feedback */}
              {domainCheckResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    domainCheckResult.ok
                      ? 'bg-[#ecfdf3] border-[#a6f4c5] text-[#12b76a]'
                      : 'bg-[#fef3f2] border-[#fecdca] text-[#f04438]'
                  }`}
                >
                  {domainCheckResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-[#12b76a] shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[#f04438] shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold">
                      {domainCheckResult.ok
                        ? `Domain "${domainCheckResult.normalizedDomain}" is eligible for onboarding & trial grant.`
                        : 'Domain verification failed:'}
                    </span>
                    {!domainCheckResult.ok && (
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] font-mono">
                        {domainCheckResult.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Platform License Tier <span className="text-[#f04438]">*</span>
                  </label>
                  <select
                    value={formData.licenseTier}
                    onChange={(e) => setFormData({ ...formData, licenseTier: e.target.value })}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                  >
                    <option value="STARTER">Starter Tier</option>
                    <option value="GROWTH">Growth Tier</option>
                    <option value="ENTERPRISE">Enterprise Tier</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Internal Account Owner <span className="text-slate-400 font-normal">(optional Staff ID)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Staff UUID / Operator ID"
                    value={formData.internalOwnerId}
                    onChange={(e) => setFormData({ ...formData, internalOwnerId: e.target.value })}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-[#2f68ff] focus:bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Review & Atomic Commit */}
        {currentStep === 4 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Step 4: Review & Atomic Tenant Commit</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review verified configuration before committing changes to the multi-schema ledger.
              </p>
            </div>

            {commitError && (
              <div className="p-3.5 bg-[#fef3f2] border border-[#fecdca] rounded-xl text-xs text-[#f04438] flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#f04438] shrink-0 mt-0.5" />
                <div>
                  <strong className="block">Commit Transaction Failed</strong>
                  <span>{commitError}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#f8fafc] border border-[#e8ecf4] rounded-xl p-4 space-y-2.5 text-xs">
                <h4 className="font-bold text-[#2f68ff] uppercase tracking-wider text-[10px]">Company & Commercial</h4>
                <div className="space-y-1.5 text-slate-700">
                  <div><span className="text-slate-500">Name:</span> <strong className="text-slate-900">{formData.companyName}</strong></div>
                  <div><span className="text-slate-500">Slug:</span> <code className="text-[#2f68ff] font-mono">{formData.slug}</code></div>
                  <div><span className="text-slate-500">Country / Currency:</span> {formData.billingCountry} • {formData.currency}</div>
                  {formData.legalEntityName && <div><span className="text-slate-500">Legal Entity:</span> {formData.legalEntityName}</div>}
                </div>
              </div>

              <div className="bg-[#f8fafc] border border-[#e8ecf4] rounded-xl p-4 space-y-2.5 text-xs">
                <h4 className="font-bold text-[#2f68ff] uppercase tracking-wider text-[10px]">Admin & Governance</h4>
                <div className="space-y-1.5 text-slate-700">
                  <div><span className="text-slate-500">Admin Name:</span> <strong className="text-slate-900">{formData.adminName}</strong></div>
                  <div><span className="text-slate-500">Admin Email:</span> <code className="text-[#2f68ff] font-mono">{formData.adminEmail}</code></div>
                  <div><span className="text-slate-500">Domain:</span> <code className="text-[#12b76a] font-mono">{formData.domain}</code></div>
                  <div><span className="text-slate-500">License Tier:</span> <span className="font-semibold text-slate-900">{formData.licenseTier}</span></div>
                </div>
              </div>
            </div>

            <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-3.5 text-xs text-[#2f68ff] flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-[#2f68ff] shrink-0" />
              <span>
                Atomic commit executes within an interactive PostgreSQL transaction. If any step fails, all mutations roll back cleanly.
              </span>
            </div>
          </div>
        )}

        {/* STEP 5: Walkthrough Checklist */}
        {currentStep === 5 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#ecfdf3] text-[#12b76a] border border-[#a6f4c5] mb-2">
                <Check className="w-3 h-3" /> Tenant Provisioned Successfully
              </div>
              <h3 className="text-base font-bold text-slate-900">Step 5: Onboarding Walkthrough Checklist</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Track customer success milestone completion for this new organization.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 p-3.5 bg-[#f8fafc] border border-[#e8ecf4] rounded-xl cursor-pointer hover:bg-slate-50 transition">
                <input
                  type="checkbox"
                  checked={formData.kickoffCallDone}
                  onChange={(e) => setFormData({ ...formData, kickoffCallDone: e.target.checked })}
                  className="w-4 h-4 rounded text-[#2f68ff] focus:ring-[#2f68ff] border-slate-300"
                />
                <div>
                  <strong className="text-xs text-slate-900 block">Kickoff Call Completed</strong>
                  <span className="text-[11px] text-slate-500">Introduction to workspace admin and assessment objectives established.</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-[#f8fafc] border border-[#e8ecf4] rounded-xl cursor-pointer hover:bg-slate-50 transition">
                <input
                  type="checkbox"
                  checked={formData.sampleDriveDeployed}
                  onChange={(e) => setFormData({ ...formData, sampleDriveDeployed: e.target.checked })}
                  className="w-4 h-4 rounded text-[#2f68ff] focus:ring-[#2f68ff] border-slate-300"
                />
                <div>
                  <strong className="text-xs text-slate-900 block">Sample Assessment Drive Deployed</strong>
                  <span className="text-[11px] text-slate-500">Test drive configured and previewed by customer lead.</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-[#f8fafc] border border-[#e8ecf4] rounded-xl cursor-pointer hover:bg-slate-50 transition">
                <input
                  type="checkbox"
                  checked={formData.adminTrained}
                  onChange={(e) => setFormData({ ...formData, adminTrained: e.target.checked })}
                  className="w-4 h-4 rounded text-[#2f68ff] focus:ring-[#2f68ff] border-slate-300"
                />
                <div>
                  <strong className="text-xs text-slate-900 block">Tenant Admin Trained</strong>
                  <span className="text-[11px] text-slate-500">Candidate review, invite dispatch, and report navigation walkthrough completed.</span>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* STEP 6: Finished / Success State */}
        {currentStep === 6 && (
          <div className="py-8 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-3xl bg-[#ecfdf3] border border-[#a6f4c5] text-[#12b76a] flex items-center justify-center mx-auto shadow-md">
              <Check className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-slate-900">Tenant Onboarding Completed!</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                The organization has been provisioned with ACTIVE status and trial pool allocation.
              </p>
            </div>

            {committedOrg && (
              <div className="inline-flex items-center gap-3 bg-[#f8fafc] border border-[#e8ecf4] rounded-xl p-3 text-xs font-mono text-slate-700">
                <span>Org ID: <strong className="text-[#2f68ff]">{committedOrg.organizationId}</strong></span>
                <span>•</span>
                <span>Trial Credits: <strong className="text-[#12b76a]">{committedOrg.trial.creditsGranted}</strong></span>
              </div>
            )}

            <div className="pt-4 flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/tenants')}
              >
                Back to Tenants Directory
              </Button>
              {committedOrg && (
                <Link to={`/tenants/${committedOrg.organizationId}`}>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={ExternalLink}
                  >
                    View Tenant Profile
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Wizard Navigation Footer */}
        {currentStep < 6 && (
          <div className="flex items-center justify-between pt-4 border-t border-[#e8ecf4]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
              disabled={currentStep === 1 || currentStep >= 5}
              icon={ArrowLeft}
            >
              Previous
            </Button>

            <div className="flex items-center gap-3">
              {currentStep === 1 && !draftId && (
                <button
                  type="button"
                  onClick={handleStartNewDraft}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
                >
                  Save Draft Later
                </button>
              )}

              {currentStep < 4 && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    if (currentStep === 1 && !draftId) {
                      await handleStartNewDraft();
                    }
                    setCurrentStep((s) => Math.min(4, s + 1));
                  }}
                  disabled={
                    (currentStep === 1 && (!formData.companyName || !formData.slug)) ||
                    (currentStep === 2 && (!formData.adminName || !formData.adminEmail)) ||
                    (currentStep === 3 && (!formData.domain || !domainCheckResult?.ok))
                  }
                >
                  <span>Next Step</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              )}

              {currentStep === 4 && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleCommitTenant}
                  disabled={isSubmitting}
                  loading={isSubmitting}
                >
                  Create Tenant & Grant Trial
                </Button>
              )}

              {currentStep === 5 && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSaveWalkthrough}
                >
                  <span>Save & Finish Onboarding</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
