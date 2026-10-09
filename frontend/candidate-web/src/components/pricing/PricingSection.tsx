import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Zap,
  Shield,
  Building2,
  Sparkles,
  ArrowRight,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Globe,
  Award,
} from 'lucide-react';

export interface PricingTier {
  id: string;
  name: string;
  tagline: string;
  price: number | null;
  currency: string;
  credits: number | string;
  period: string;
  features: string[];
  highlight: boolean;
  badge?: string;
  ctaText: string;
  ctaAction: 'signup' | 'contact';
}

interface PricingSectionProps {
  onOpenSignup: (tierId?: string) => void;
}

const DEFAULT_TIERS_IN: PricingTier[] = [
  {
    id: 'starter-trial',
    name: 'Trial / Evaluation',
    tagline: 'Instant free sandbox to run your first 25 live technical interviews.',
    price: 0,
    currency: 'INR',
    credits: 25,
    period: '14-day validity',
    features: [
      '25 live candidate evaluation credits',
      'All 5 assessment engines (MCQ, SQL, Coding, NoSQL, Simulation)',
      'Real-time webcam, tab-switch & audio proctoring',
      'Automated Say-Do Score & forensic audit report',
      'Zero credit card required at signup',
    ],
    highlight: false,
    ctaText: 'Start Free Trial',
    ctaAction: 'signup',
  },
  {
    id: 'drive-pass',
    name: 'Campus Drive Pass',
    tagline: 'High-concurrency hiring pass for structured college or hackathon drives.',
    price: 5000,
    currency: 'INR',
    credits: 100,
    period: 'per hiring drive',
    features: [
      '100 assessment attempts included',
      'Custom question authoring & test-case evaluator',
      'Live proctoring dashboard with video mosaic',
      'Instant PDF/Excel candidate rankings',
      'Incident window pause & network waiver tools',
      'Priority recruiter email support',
    ],
    highlight: true,
    badge: 'Most Popular',
    ctaText: 'Get Drive Pass',
    ctaAction: 'signup',
  },
  {
    id: 'talent-reserve',
    name: 'Talent Reserve',
    tagline: 'Flexible credit pool for ongoing quarterly and lateral hiring.',
    price: 25000,
    currency: 'INR',
    credits: 500,
    period: 'annual credit pool',
    features: [
      '500 flexible credits with unused rollover support',
      'Curated role templates (Frontend, Backend, DevOps, Data)',
      'Multi-seat recruiter management (Admin, HR, Reviewer)',
      'ATS webhook integration & automatic grade push',
      'Quarterly integrity audit verification',
      'Dedicated customer success manager',
    ],
    highlight: false,
    ctaText: 'Choose Talent Reserve',
    ctaAction: 'signup',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom scale, dedicated proctoring clusters, and air-gapped security.',
    price: null,
    currency: 'INR',
    credits: 'Custom Volume',
    period: 'custom contract',
    features: [
      'Volume commitments over 2,000+ candidates',
      'Dedicated Judge0 code execution sandbox clusters',
      'Custom proctoring sensitivity & compliance policies',
      'Enterprise SSO (SAML 2.0 / Okta / Azure AD)',
      '99.9% uptime SLA & 24/7 incident hotline',
      'Custom invoice billing & procurement workflows',
    ],
    highlight: false,
    ctaText: 'Talk to Enterprise Sales',
    ctaAction: 'contact',
  },
];

const DEFAULT_TIERS_US: PricingTier[] = [
  {
    ...DEFAULT_TIERS_IN[0],
    currency: 'USD',
  },
  {
    ...DEFAULT_TIERS_IN[1],
    price: 200,
    currency: 'USD',
  },
  {
    ...DEFAULT_TIERS_IN[2],
    price: 950,
    currency: 'USD',
  },
  {
    ...DEFAULT_TIERS_IN[3],
    currency: 'USD',
  },
];

const FAQS = [
  {
    q: 'How does the credit model work?',
    a: 'Exactly 1 credit is consumed only when a candidate begins a live assessment attempt. Practice tests, audio checks, and recruiter previews are always 100% free.',
  },
  {
    q: 'What happens if a candidate experiences internet or power loss?',
    a: 'Recruiters can approve courtesy waivers or activate platform incident windows to grant reattempts without consuming extra credits.',
  },
  {
    q: 'Do unconsumed credits expire?',
    a: 'Trial credits are valid for 14 days. Campus Drive Passes are active for the duration of the scheduled drive (up to 30 days). Talent Reserve credits are valid for 12 months with rollover protection.',
  },
  {
    q: 'Can I invite other recruiters or interviewers from my company?',
    a: 'Yes! All plans include multi-seat recruiter workspaces where team members can author questions, review submissions, and manage candidate invitations.',
  },
];

export const PricingSection: React.FC<PricingSectionProps> = ({ onOpenSignup }) => {
  const [country, setCountry] = useState<'IN' | 'US'>('IN');
  const [tiers, setTiers] = useState<PricingTier[]>(DEFAULT_TIERS_IN);
  const [loading, setLoading] = useState(false);
  const [candidateSlider, setCandidateSlider] = useState(150);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Fetch dynamic live pricing catalog from public API
  useEffect(() => {
    let isCancelled = false;
    const fetchPricing = async () => {
      setLoading(true);
      try {
        const apiUrl = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/public/pricing?country=${country}`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data?.tiers?.length > 0) {
            setTiers(data.tiers);
          }
        }
      } catch {
        // Fallback to static regional tier matrix
        if (!isCancelled) {
          setTiers(country === 'IN' ? DEFAULT_TIERS_IN : DEFAULT_TIERS_US);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchPricing();
    return () => {
      isCancelled = true;
    };
  }, [country]);

  // Dynamic recommendation based on slider volume
  const recommendedTier = candidateSlider <= 30
    ? 'starter-trial'
    : candidateSlider <= 200
    ? 'drive-pass'
    : candidateSlider <= 800
    ? 'talent-reserve'
    : 'enterprise';

  return (
    <section id="pricing" className="relative py-28 bg-[#fafbfe] overflow-hidden border-t border-[#edf2f9]">
      {/* Background radial highlights */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-blue-100/50 via-indigo-50/20 to-transparent blur-3xl pointer-events-none" />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#eff4ff] border border-[#dbe6fe] text-[#2563eb] text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles size={13} className="text-[#2563eb]" />
            Transparent, Pay-For-Signal Pricing
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0f172a] tracking-tight leading-tight">
            Predictable costs. <span className="text-[#2563eb]">Zero overdraft penalties.</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
            Pay only when real candidates attempt live assessments. Practice sandboxes, audio calibrations, and recruiter previews are always completely free.
          </p>

          {/* Currency Toggle */}
          <div className="mt-8 inline-flex items-center p-1 rounded-xl bg-white border border-slate-200 shadow-xs">
            <button
              onClick={() => {
                setCountry('IN');
                setTiers(DEFAULT_TIERS_IN);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                country === 'IN'
                  ? 'bg-[#2563eb] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🇮🇳</span> India (INR ₹)
            </button>
            <button
              onClick={() => {
                setCountry('US');
                setTiers(DEFAULT_TIERS_US);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                country === 'US'
                  ? 'bg-[#2563eb] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🇺🇸</span> Global (USD $)
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch mb-20">
          {tiers.map((tier) => {
            const isRec = tier.id === recommendedTier;
            return (
              <motion.div
                key={tier.id}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                className={`relative flex flex-col justify-between rounded-2xl p-7 transition-all ${
                  tier.highlight
                    ? 'bg-gradient-to-b from-white via-white to-blue-50/40 border-2 border-[#2563eb] shadow-xl shadow-blue-500/10'
                    : 'bg-white border border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-md'
                }`}
              >
                {/* Popular or Recommended Badge */}
                {tier.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[11px] font-bold uppercase tracking-wider shadow-sm">
                    {tier.badge}
                  </div>
                )}
                {!tier.badge && isRec && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-slate-900 text-white text-[11px] font-bold tracking-wider shadow-sm">
                    Fits Your Volume
                  </div>
                )}

                <div>
                  {/* Tier Title */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-slate-900">{tier.name}</h3>
                    {tier.highlight && <Zap size={18} className="text-[#2563eb]" />}
                  </div>
                  <p className="text-xs text-slate-500 min-h-[32px] leading-relaxed mb-6">
                    {tier.tagline}
                  </p>

                  {/* Price */}
                  <div className="mb-6 pb-6 border-b border-slate-100">
                    {tier.price === 0 ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-extrabold text-slate-900">Free</span>
                        <span className="text-xs text-slate-500 font-medium">/ 14 days</span>
                      </div>
                    ) : tier.price !== null ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-semibold text-slate-500">
                          {country === 'IN' ? '₹' : '$'}
                        </span>
                        <span className="text-4xl font-extrabold text-slate-900">
                          {tier.price.toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          /{tier.period.includes('drive') ? 'drive' : 'year'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-extrabold text-slate-900">Custom</span>
                        <span className="text-xs text-slate-500 font-medium">/ tailored SLA</span>
                      </div>
                    )}

                    <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                      <Award size={12} />
                      {typeof tier.credits === 'number'
                        ? `${tier.credits} candidate credits`
                        : tier.credits}
                    </div>
                  </div>

                  {/* Features List */}
                  <ul className="space-y-3 mb-8">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 leading-snug">
                        <div className="w-4 h-4 rounded-full bg-blue-50 text-[#2563eb] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check size={10} strokeWidth={3} />
                        </div>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA Action */}
                <div>
                  {tier.ctaAction === 'signup' ? (
                    <button
                      onClick={() => onOpenSignup(tier.id)}
                      className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        tier.highlight
                          ? 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-md shadow-blue-500/20 active:scale-[0.98]'
                          : 'bg-slate-900 hover:bg-slate-800 text-white active:scale-[0.98]'
                      }`}
                    >
                      {tier.ctaText}
                      <ArrowRight size={14} />
                    </button>
                  ) : (
                    <a
                      href="mailto:sales@proctora.com?subject=Enterprise%20Inquiry"
                      className="w-full py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] no-underline"
                    >
                      {tier.ctaText}
                      <ArrowRight size={14} />
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Interactive Volume Estimator Slider */}
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 shadow-xs mb-20 max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563eb] uppercase tracking-wider mb-1">
                <Building2 size={14} /> Interactive Hiring Calculator
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                How many candidates are you screening each month?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Drag the slider to preview the most cost-effective credit allocation.
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-extrabold text-[#2563eb]">{candidateSlider}</span>
              <span className="text-xs font-semibold text-slate-500 block">candidates / month</span>
            </div>
          </div>

          <div className="pt-6">
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={candidateSlider}
              onChange={(e) => setCandidateSlider(parseInt(e.target.value))}
              className="w-full h-2.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#2563eb]"
            />
            <div className="flex justify-between text-[11px] font-semibold text-slate-400 mt-2">
              <span>10 Candidates</span>
              <span>250 Candidates</span>
              <span>500 Candidates</span>
              <span>1,000+ Candidates</span>
            </div>

            <div className="mt-6 p-4 rounded-2xl bg-blue-50/60 border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-blue-200 flex items-center justify-center text-[#2563eb] font-bold shadow-xs">
                  <Zap size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Recommended for your hiring volume:</p>
                  <p className="text-sm font-bold text-slate-900">
                    {recommendedTier === 'starter-trial' && 'Free Evaluation (25 Credits)'}
                    {recommendedTier === 'drive-pass' && 'Campus Drive Pass (100–200 Candidates)'}
                    {recommendedTier === 'talent-reserve' && 'Talent Reserve Credit Pack (500 Candidates)'}
                    {recommendedTier === 'enterprise' && 'Enterprise Custom Volume Plan'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onOpenSignup(recommendedTier)}
                className="px-5 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                Provision Workspace <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Pricing FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-slate-900">Frequently Asked Questions</h3>
            <p className="text-xs text-slate-500 mt-1">
              Everything you need to know about candidate credits and billing policies.
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                  >
                    <span className="text-sm font-bold text-slate-900">{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp size={18} className="text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-100/80">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
