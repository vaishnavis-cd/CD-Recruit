import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  Shield,
  ArrowRight,
  Check,
  Briefcase,
  Video,
  User,
} from 'lucide-react'
import ribbon3dLeft from '../assets/3D Image - 40 left.svg'
import ribbon3dRight from '../assets/3D Image - 40 right.svg'
import takehomes3d from '../assets/icon-takehomes-3d.png'
import liveinterviews3d from '../assets/icon-liveinterviews-3d.png'
import resumescreens3d from '../assets/icon-resumescreens-3d.png'
import iconGrid from '../assets/IconGrid.svg'
import iconDatabase from '../assets/IconDatabase.svg'
import iconCode from '../assets/IconCode.svg'
import iconBrain from '../assets/IconBrain.svg'
import iconCpu from '../assets/IconCpu.svg'
import { CountUp } from '../components/common/CountUp'
import { PricingSection } from '../components/pricing/PricingSection'
import { ClientOnboardingModal } from '../components/pricing/ClientOnboardingModal'

// ─── Token Extraction Helper ──────────────────────────────────────────────────
function extractInviteId(raw: string): string | null {
  const v = (raw || '').trim()
  if (!v) return null
  // Match full URLs with path like /invite/inv_123 or /start/inv_123
  const pathMatch = v.match(/\/(?:invite|start)\/([a-zA-Z0-9_\-\.]+)/i)
  if (pathMatch) return pathMatch[1]
  // Match URLs with query parameter like ?token=inv_123
  const queryMatch = v.match(/[?&]token=([a-zA-Z0-9_\-\.]+)/i)
  if (queryMatch) return queryMatch[1]
  // Match raw tokens (inv_..., JWT eyJ..., demo, or general token format)
  if (
    /^(?:inv_[a-zA-Z0-9_-]+|eyJ[a-zA-Z0-9_\-\.]+|demo(?:-[a-zA-Z0-9_-]+)?|[a-zA-Z0-9_-]{4,})$/i.test(
      v
    )
  ) {
    return v
  }
  return null
}

// ─── Scroll Reveal Wrapper ──────────────────────────────────────────────────
function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px 0px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 22 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─── 3D Swirl Ribbons (Reference: 3D Image - 40 left & right) ────────────────
function FloatingRibbonLeft() {
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="absolute left-0 top-[170px] sm:top-[190px] md:top-[200px] w-[160px] sm:w-[190px] md:w-[220px] lg:w-[240px] pointer-events-none select-none z-0 filter drop-shadow-[0_20px_35px_rgba(147,197,253,0.3)]"
    >
      <img
        src={ribbon3dLeft}
        alt="3D Swirl Left"
        className="w-full h-auto object-contain object-left select-none"
      />
    </motion.div>
  )
}

function FloatingRibbonRight() {
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="absolute right-0 top-[430px] sm:top-[450px] md:top-[470px] w-[180px] sm:w-[210px] md:w-[240px] lg:w-[260px] pointer-events-none select-none z-0 filter drop-shadow-[0_20px_35px_rgba(244,114,182,0.3)]"
    >
      <img
        src={ribbon3dRight}
        alt="3D Swirl Right"
        className="w-full h-auto object-contain object-right select-none"
      />
    </motion.div>
  )
}



// ─── 1. Header / Navbar (Figma Spec Node 7:435) ────────────────────────────────
function Header({ onOpenSignup }: { onOpenSignup: () => void }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <header
      className={`fixed top-0 w-full z-50 backdrop-blur-md transition-all duration-200 ${
        scrolled ? 'landing-header-bg-scrolled' : 'landing-header-bg-default'
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-8 sm:px-12 flex items-center justify-between h-[104px]">
        {/* Brand Logo (Left) */}
        <a href="#" className="flex items-center gap-3 no-underline group" aria-label="Proctora home">
          <div className="w-8 h-8 rounded-lg bg-[#2E5DE0] flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105">
            <Shield size={18} strokeWidth={2.4} />
          </div>
          <span className="font-extrabold text-[20px] text-[#0F0F1A] tracking-tight">Proctora</span>
        </a>

        {/* Navigation Links + CTA Button (Aligned Right, matching Figma Frame 1) */}
        <div className="flex items-center gap-4 sm:gap-6 md:gap-8">
          <nav className="flex items-center gap-3 sm:gap-5 md:gap-8" aria-label="Main navigation">
            {[
              ['Platform', '#platform'],
              ['The Say-Do Score', '#say-do'],
              ['Pricing', '#pricing'],
              ['Security', '#security'],
              ['Have an invite?', '#start'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-[13px] sm:text-[14px] md:text-[15px] font-medium text-[#0F0F1A] hover:text-[#2E5DE0] transition-colors no-underline whitespace-nowrap"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="http://localhost:5174/login"
              className="hidden sm:inline-block text-[13px] sm:text-[14px] font-semibold text-slate-700 hover:text-[#2E5DE0] transition-colors no-underline whitespace-nowrap"
            >
              Sign In
            </a>
            <button
              onClick={onOpenSignup}
              className="landing-demo-btn inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 text-[13px] sm:text-[14px] font-semibold text-white rounded-full no-underline transition-all hover:bg-[#2349B8] hover:shadow-md active:scale-98 whitespace-nowrap cursor-pointer"
            >
              Start Free Trial <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

// ─── 2. Invite Input Widget (Integrated with App Router & API Hand-off) ───────
function InviteWidget() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [state, setState] = useState<'idle' | 'error' | 'success'>('idle')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleStart() {
    const id = extractInviteId(value)
    if (!id) {
      setState('error')
      setMsg('Please enter a valid assessment invite link or ID.')
      return
    }
    setState('success')
    setMsg('Found your invite — preparing assessment environment…')
    setLoading(true)
    // Smooth transition hand-off to TokenRouteHandler & API session resolver
    setTimeout(() => {
      navigate(`/invite/${id}`)
    }, 550)
  }

  return (
    <div id="start" className="w-full">
      {/* Separated Live Input Box & Submit Button — exact Figma specs (25:177 → 560×97) */}
      <div className="flex items-center gap-2.5 w-full">
        {/* Input Box — Figma id 25:178: 399×49, bg #ff00001a, transparent w/ black border */}
        <div
          className="flex items-center gap-2.5 flex-1 min-w-0 bg-transparent border border-[#0F0F1A] rounded-[10px] px-4 py-[14px] transition-all focus-within:border-[#0F0F1A]"
        >
          {/* IconLink — from candidate-web-icons */}
          <img
            src="/assets/candidate-web-icons/link.svg"
            alt=""
            className="w-4 h-4 flex-shrink-0 opacity-50 select-none pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (state === 'error') setState('idle')
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            placeholder="Paste your assessment invite link…"
            spellCheck={false}
            autoComplete="off"
            aria-label="Paste your assessment invite link"
            className="w-full bg-transparent border-none text-[14px] font-medium text-[#0F0F1A] placeholder:text-[#0F0F1A]/50 outline-none"
          />
        </div>

        {/* Button — Figma id 25:185: 151×49, bg #2E5DE0 */}
        <button
          onClick={handleStart}
          disabled={loading}
          className="landing-start-btn flex items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold text-white transition-all hover:bg-[#2349B8] active:scale-[0.98] cursor-pointer flex-shrink-0 whitespace-nowrap"
        >
          {loading ? (
            <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" />
            </svg>
          ) : (
            <>
              Start Session
            </>
          )}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {msg && (
          <motion.p
            key={state + msg}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="status"
            className={`mt-2.5 text-[13px] font-medium text-center ${state === 'error' ? 'text-[#EF4444]' : state === 'success' ? 'text-[#10B981]' : 'text-[#6B7280]'
              }`}
          >
            {msg}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── 3. Dark Workspace Preview Mockup ─────────────────────────────────────────
function BrowserMockup() {
  return (
    <Reveal delay={0.25} className="mt-12 max-w-[960px] mx-auto">
      <div
        className="rounded-2xl border border-[#1E293B]/80 overflow-hidden text-left bg-[#12131A] shadow-2xl shadow-[0_25px_60px_-15px_rgba(15,15,26,0.6)]"
      >
        {/* Window Chrome Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1E293B] bg-[#0E0F15]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#EF4444]" />
            <span className="w-3 h-3 rounded-full bg-[#F59E0B]" />
            <span className="w-3 h-3 rounded-full bg-[#10B981]" />
          </div>
          <div className="text-[12px] font-mono text-[#64748B] bg-[#181924] border border-[#1E293B] rounded-md py-1 px-4 tracking-wide">
            assess.proctora.com/workspace/S2R3XQ29
          </div>
          <div className="w-12" />
        </div>

        {/* Workspace Panes Split */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.35fr] min-h-[340px]">
          {/* Left: Chat / Promise Panel */}
          <div className="p-6 border-b md:border-b-0 md:border-r border-[#1E293B] bg-[#12131A] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0 bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8]"
                >
                  P
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#F8FAFC]">Priya Shah</div>
                  <div className="text-[11px] text-[#94A3B8]">Eng Manager</div>
                </div>
              </div>

              {/* Message Box */}
              <div
                className="rounded-xl p-4 border border-[#2563EB]/30 bg-[#181924]"
              >
                <p className="text-[13px] text-[#E2E8F0] leading-relaxed italic m-0">
                  "Good catch — I'll make sure to add payload validation before this ships to prod."
                </p>
              </div>
            </div>

            {/* Say-Do Gap Badge */}
            <div className="mt-6 pt-4 border-t border-[#1E293B]">
              <div className="text-[11px] font-mono font-bold tracking-wider text-[#94A3B8] uppercase mb-1.5">
                SAY-DO GAP
              </div>
              <div className="flex items-center gap-2 text-[13px] font-medium text-[#F87171]">
                <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
                Detected. No validation found.
              </div>
            </div>
          </div>

          {/* Right: Code Editor Pane */}
          <div className="p-6 font-mono text-[13px] leading-[1.8] bg-[#0B0C10] text-[#E2E8F0] overflow-x-auto">
            <div className="text-[#64748B]">// Candidate promised: payload validation</div>
            <div className="text-[#64748B]">// Status: Say-Do gap detected. No validation found.</div>
            <div className="mt-4">
              <span className="text-[#C084FC] font-semibold">export async function </span>
              <span className="text-[#60A5FA]">saveUser</span>
              <span className="text-[#F1F5F9]">(payload) &#123;</span>
            </div>
            <div>
              <span className="ml-5 text-[#E2E8F0]">const user = payload.user;</span>
            </div>
            <div>
              <span className="ml-5 text-[#F1F5F9]">await db.insert(</span>
              <span className="text-[#4ADE80]">'users'</span>
              <span className="text-[#F1F5F9]">).values(user);</span>
            </div>
            <div>
              <span className="ml-5 text-[#C084FC]">return </span>
              <span className="text-[#F1F5F9]">&#123; ok: </span>
              <span className="text-[#C084FC]">true</span>
              <span className="text-[#F1F5F9]"> &#125;;</span>
            </div>
            <div>
              <span className="text-[#F1F5F9]">&#125;</span>
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  )
}



// ─── 4. Problem & The Full Picture / Security Section ─────────────────────────
function ProblemSection() {
  return (
    <section id="security" className="py-24 bg-[#FFFFFF] scroll-mt-24">
      <div className="max-w-[1200px] mx-auto px-6">
        <Reveal>
          {/* Header Title & Subtitle */}
          <div className="text-center max-w-[920px] mx-auto mb-16">
            <h2 className="text-[32px] sm:text-[40px] md:text-[44px] font-extrabold text-[#0F0F1A] tracking-tight leading-[1.18]">
              Skill tests grade the output.
              <br />
              They ignore the context.
            </h2>
            <p className="text-[15px] sm:text-[17px] text-[#6B6B88] leading-relaxed mt-4 max-w-[688px] mx-auto">
              A candidate can promise anything in a chat reply. Most platforms never connect that promise back to the code. If tests pass, they pass.
            </p>
          </div>

          {/* 3 Problem Cards / Boxes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Box 1: Take-homes */}
            <div className="group rounded-[14px] p-8 pb-3 flex flex-col justify-between min-h-[425px] relative overflow-hidden bg-[#5282FF] transition-all duration-300">
              <div>
                <div className="w-10 h-10 rounded-lg bg-[#ECF1FF] flex items-center justify-center text-[#5282FF] shadow-xs">
                  <Briefcase size={20} />
                </div>
                <h3 className="text-[22px] font-bold text-white mt-6 mb-2">Take-homes</h3>
                <p className="text-[14px] text-white/90 leading-relaxed max-w-[260px]">
                  Projects that sit in a queue nobody on your team actually has time to review properly.
                </p>
              </div>
              <div className="mt-2 flex justify-end items-end h-[230px] relative pr-1 sm:pr-2">
                <img
                  src={takehomes3d}
                  alt="Take-homes 3D Icon"
                  className="max-h-[195px] sm:max-h-[205px] w-auto object-contain select-none translate-x-3 transition-all duration-300 ease-out group-hover:scale-108 group-hover:-translate-y-2.5 cursor-pointer filter drop-shadow-xl"
                  style={{
                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 98%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 98%)',
                  }}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#5282FF] to-transparent z-10" />
              </div>
            </div>

            {/* Box 2: Live interviews */}
            <div className="group rounded-[14px] p-8 pb-3 flex flex-col justify-between min-h-[425px] relative overflow-hidden bg-[#5282FF] transition-all duration-300">
              <div>
                <div className="w-10 h-10 rounded-lg bg-[#ECF1FF] flex items-center justify-center text-[#5282FF] shadow-xs">
                  <Video size={20} />
                </div>
                <h3 className="text-[22px] font-bold text-white mt-6 mb-2">Live interviews</h3>
                <p className="text-[14px] text-white/90 leading-relaxed max-w-[260px]">
                  High-stress, performative sessions that don't scale past a handful of candidates a week.
                </p>
              </div>
              <div className="mt-2 flex justify-end items-end h-[230px] relative pr-1 sm:pr-2">
                <img
                  src={liveinterviews3d}
                  alt="Live interviews 3D Icon"
                  className="max-h-[200px] sm:max-h-[210px] w-auto object-contain select-none translate-x-3 transition-all duration-300 ease-out group-hover:scale-108 group-hover:-translate-y-2.5 cursor-pointer filter drop-shadow-xl"
                  style={{
                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 98%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 98%)',
                  }}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#5282FF] to-transparent z-10" />
              </div>
            </div>

            {/* Box 3: Resume screens */}
            <div className="group rounded-[14px] p-8 pb-3 flex flex-col justify-between min-h-[425px] relative overflow-hidden bg-[#5282FF] transition-all duration-300">
              <div>
                <div className="w-10 h-10 rounded-lg bg-[#ECF1FF] flex items-center justify-center text-[#5282FF] shadow-xs">
                  <User size={20} />
                </div>
                <h3 className="text-[22px] font-bold text-white mt-6 mb-2">Resume screens</h3>
                <p className="text-[14px] text-white/90 leading-relaxed max-w-[260px]">
                  Filters that measure a candidate's pedigree and past logos instead of their actual judgment.
                </p>
              </div>
              <div className="mt-2 flex justify-end items-end h-[230px] relative pr-1 sm:pr-2">
                <img
                  src={resumescreens3d}
                  alt="Resume screens 3D Icon"
                  className="max-h-[195px] sm:max-h-[205px] w-auto object-contain select-none translate-x-3 transition-all duration-300 ease-out group-hover:scale-108 group-hover:-translate-y-2.5 cursor-pointer filter drop-shadow-xl"
                  style={{
                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 98%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 98%)',
                  }}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#5282FF] to-transparent z-10" />
              </div>
            </div>
          </div>

          {/* Bottom Card: The Full Picture */}
          <div className="rounded-[14px] p-8 bg-[#F4F4F4] border border-[#EAEAEA] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="max-w-[560px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#000000] block mb-1">
                WHAT PROCTORA SEES
              </span>
              <h3 className="text-[26px] sm:text-[28px] font-extrabold text-[#000000] tracking-tight mb-2">
                The Full Picture.
              </h3>
              <p className="text-[14px] sm:text-[15px] text-[#4B5563] leading-relaxed m-0">
                We check the tests, the syntax, and the speed. But more importantly, we check if the code actually matches what they told a teammate they'd do.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3 w-full lg:w-auto flex-shrink-0">
              {[
                'Tests pass',
                'Contextual accuracy',
                'Clean syntax',
                'Say-Do alignment',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <div className="w-[18px] h-[18px] rounded-[4px] bg-[#F0F4FF] flex items-center justify-center flex-shrink-0">
                    <Check size={12} strokeWidth={3} className="text-[#2563EB]" />
                  </div>
                  <span className="text-[14px] font-medium text-[#000000] whitespace-nowrap">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── 5. 5 Core Modules / Platform Section ─────────────────────────────────────
const CORE_MODULES = [
  {
    id: 'mcq',
    label: 'MCQ',
    icon: <img src={iconGrid} alt="MCQ" className="w-9 h-9 object-contain select-none" />,
  },
  {
    id: 'sql',
    label: 'SQL',
    icon: <img src={iconDatabase} alt="SQL" className="w-9 h-9 object-contain select-none" />,
  },
  {
    id: 'coding',
    label: 'Coding\n& DSA',
    icon: <img src={iconCode} alt="Coding & DSA" className="w-9 h-9 object-contain select-none" />,
  },
  {
    id: 'ai',
    label: 'AI\nPrompting',
    icon: <img src={iconBrain} alt="AI Prompting" className="w-9 h-9 object-contain select-none" />,
  },
  {
    id: 'sim',
    label: 'Contextual\nSimulation',
    icon: <img src={iconCpu} alt="Contextual Simulation" className="w-9 h-9 object-contain select-none" />,
  },
]

function CoreModulesSection() {
  const iconsContainerRef = useRef<HTMLDivElement>(null)
  const isIconsInView = useInView(iconsContainerRef, { once: true, amount: 0.45 })

  return (
    <section id="platform" className="py-20 bg-[#FFFFFF] scroll-mt-24">
      <div className="max-w-[1200px] mx-auto px-6">
        <Reveal>
          <h2 className="text-[32px] sm:text-[38px] md:text-[44px] font-extrabold text-[#0F0F1A] text-center tracking-tight mb-10 sm:mb-12">
            5 Core Modules
          </h2>
          <div
            ref={iconsContainerRef}
            className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 md:gap-8 lg:gap-10 min-h-[260px] py-4"
          >
            {CORE_MODULES.map((mod) => (
              <div
                key={mod.id}
                className="flex items-center justify-center w-[135px] sm:w-[155px] md:w-[170px] h-[260px]"
              >
                <motion.div
                  initial={{ height: 165, borderRadius: 82.5 }}
                  animate={
                    isIconsInView
                      ? { height: 255, borderRadius: 82.5 }
                      : { height: 165, borderRadius: 82.5 }
                  }
                  transition={{
                    duration: 1.5,
                    delay: 0.35,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  whileHover={{ scale: 1.04 }}
                  className="group relative flex flex-col items-center justify-center w-[135px] sm:w-[155px] md:w-[170px] bg-gradient-to-b from-[#E4EBFF] to-[#FFF4F7] border border-[#E0E7FF]/50 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_16px_36px_rgba(37,99,235,0.12)] cursor-pointer select-none p-4"
                >
                  <motion.div
                    animate={isIconsInView ? { y: -6 } : { y: 0 }}
                    transition={{
                      duration: 1.5,
                      delay: 0.35,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="flex items-center justify-center"
                  >
                    {mod.icon}
                  </motion.div>
                  <motion.div
                    animate={
                      isIconsInView
                        ? { opacity: 1, height: 'auto', marginTop: 14 }
                        : { opacity: 0, height: 0, marginTop: 0 }
                    }
                    transition={{
                      duration: 1.2,
                      delay: 0.5,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="overflow-hidden flex flex-col items-center justify-center"
                  >
                    <span className="text-[13px] sm:text-[14px] font-bold text-[#0F0F1A] text-center whitespace-pre-line leading-tight">
                      {mod.label}
                    </span>
                  </motion.div>
                </motion.div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── 6. Say-Do Agreement & Analytics Section ──────────────────────────────────
function SayDoSection() {
  return (
    <section id="say-do" className="py-24 bg-[#FFFFFF] scroll-mt-24">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          {/* Left Column */}
          <Reveal>
            <h2 className="font-extrabold tracking-tight text-[#0F0F1A] text-3xl sm:text-4xl md:text-[42px] leading-[1.18] mb-6">
              We check if the conversation and the code agree.
            </h2>
            <p className="text-[17px] leading-relaxed text-[#6B6B88] mb-8">
              The Correlation Engine cross-references every written response against the code changes that follow it,
              scoring the distance between the two — not just whether it compiles.
            </p>

            {/* Example Event Box */}
            <div className="rounded-2xl p-6 bg-white border border-[#E5E7EB] shadow-sm">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#6B6B88] mb-3">
                EXAMPLE EVENT
              </div>
              <p className="text-[14px] text-[#0F0F1A] leading-relaxed mb-3">
                Candidate writes:{' '}
                <span className="font-semibold text-[#2E5DE0]">
                  "Good catch, I'll add input validation before this ships."
                </span>
              </p>
              <p className="text-[13px] text-[#6B6B88] leading-relaxed m-0">
                They submit code with no validation. The unit tests still pass. Proctora flags the mismatch anyway.
              </p>
            </div>
          </Reveal>

          {/* Right Column: Dashboard Card */}
          <Reveal delay={0.2}>
            <div className="rounded-3xl p-8 bg-white border border-[#E5E7EB] shadow-lg">
              {/* Score Header */}
              <div className="mb-6">
                <div className="text-6xl sm:text-7xl font-extrabold text-[#2E5DE0] tracking-tight leading-none mb-1 flex items-baseline">
                  <CountUp to={94} duration={2} delay={0.4} className="inline-block" />
                  <span>%</span>
                </div>
                <div className="text-[12px] font-bold uppercase tracking-wider text-[#6B6B88]">
                  SAY-DO SYNC SCORE
                </div>
              </div>

              {/* Progress Bar Tracker with Left-to-Right Animation */}
              <div className="pb-6 border-b border-[#F1F5F9] mb-6">
                <div className="flex justify-between text-[13px] font-medium mb-2.5">
                  <span className="text-[#6B6B88]">Responses Flagged</span>
                  <span className="text-[#EF4444] font-semibold">1 of 14</span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#F0F1F7] overflow-hidden">
                  <motion.div
                    initial={{ width: '0%' }}
                    whileInView={{ width: '94%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                    className="h-full rounded-full bg-[#2E5DE0]"
                  />
                </div>
              </div>

              {/* 4-Box Stat Grid (Figma Spec #EFF3FF) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-[#EFF3FF] border border-[#2E5DE0]/10">
                  <div className="text-[22px] font-extrabold text-[#0F0F1A] leading-none mb-1">
                    <CountUp to={14} duration={1.6} delay={0.3} />
                  </div>
                  <div className="text-[12px] font-medium text-[#6B6B88]">Code Reviewed</div>
                </div>

                <div className="p-4 rounded-2xl bg-[#EFF3FF] border border-[#2E5DE0]/10">
                  <div className="text-[22px] font-extrabold text-[#0F0F1A] leading-none mb-1">3.2m</div>
                  <div className="text-[12px] font-medium text-[#6B6B88]">Avg Response Time</div>
                </div>

                <div className="p-4 rounded-2xl bg-[#EFF3FF] border border-[#2E5DE0]/10">
                  <div className="text-[22px] font-extrabold text-[#0F0F1A] leading-none mb-1">
                    <CountUp to={94} duration={2} delay={0.3} />%
                  </div>
                  <div className="text-[12px] font-medium text-[#6B6B88]">Sync Accuracy</div>
                </div>

                <div className="p-4 rounded-2xl bg-[#EFF3FF] border border-[#2E5DE0]/10">
                  <div className="text-[22px] font-extrabold text-[#0F0F1A] leading-none mb-1">12/12</div>
                  <div className="text-[12px] font-medium text-[#6B6B88]">Tests Passed</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ─── 7. Wide Call-To-Action Banner (Coded Responsive UI) ─────────────────────
function CtaBanner({ onOpenSignup }: { onOpenSignup: () => void }) {
  return (
    <section className="py-16 sm:py-24 bg-[#FFFFFF]">
      <div className="max-w-[1470px] mx-auto px-4 sm:px-6">
        <Reveal>
          <div className="relative rounded-[28px] sm:rounded-3xl overflow-hidden shadow-2xl border border-[#2E5DE0]/30 bg-[#5282FF] text-white">
            {/* Ambient Background Decorative Effects */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/[0.08] blur-2xl" />
              <div className="absolute -bottom-28 left-1/4 w-[500px] h-[500px] rounded-full bg-[#3B6FF6] blur-3xl opacity-60" />
              <div className="absolute top-1/2 right-1/4 w-80 h-80 rounded-full bg-white/[0.06] blur-xl" />
            </div>

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 items-center min-h-[360px] sm:min-h-[394px]">
              {/* Left Column: Heading, Subtitle & Interactive CTA Button */}
              <div className="lg:col-span-6 xl:col-span-6 px-6 py-10 sm:px-12 sm:py-14 lg:py-16 lg:pl-14 lg:pr-6 flex flex-col justify-center items-start">
                <h2 className="text-[28px] sm:text-[38px] lg:text-[44px] xl:text-[48px] font-extrabold text-white leading-[1.12] tracking-tight max-w-[560px]">
                  See what your current process is missing.
                </h2>
                <p className="text-[15px] sm:text-[17px] text-white/90 leading-relaxed font-normal mt-4 sm:mt-5 mb-8 sm:mb-9 max-w-[480px]">
                  Walk through a real session and see the Say-Do Score applied to an actual candidate response with 25 free evaluation credits.
                </p>
                <button
                  onClick={onOpenSignup}
                  aria-label="Start free trial"
                  className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-[#0F0F1A] font-bold text-[15px] rounded-full shadow-lg hover:bg-[#F4F7FF] hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
                >
                  Start Free Trial (25 Credits) <ArrowRight size={16} className="ml-2" />
                </button>
              </div>

              {/* Right Column: Visual Artwork of Layered Perspective Cards */}
              <div className="lg:col-span-6 xl:col-span-6 relative h-[260px] sm:h-[320px] lg:h-full min-h-[320px] lg:min-h-[394px] w-full overflow-hidden flex items-center justify-end">
                <img
                  src="/cta_cards.svg"
                  alt="Proctora Dashboard Overview"
                  className="w-full h-full object-cover lg:object-contain object-left lg:object-right select-none pointer-events-none"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── 8. Footer (Figma Spec #F8F8F8) ───────────────────────────────────────────
function Footer() {
  return (
    <footer className="py-16 bg-[#F8F8F8] border-t border-[#E5E7EB]">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-[1.8fr_1fr_1fr_1fr] gap-10 mb-14">
          {/* Brand Col */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[#EBEFFB] flex items-center justify-center text-[#2E5DE0]">
                <Shield size={16} strokeWidth={2.4} />
              </div>
              <span className="font-bold text-[18px] text-[#0F0F1A] tracking-tight">Proctora</span>
            </div>
            <p className="text-[14px] leading-relaxed text-[#000000] max-w-[280px] m-0">
              Technical hiring that checks whether candidates meant what they said, not just whether the code runs.
            </p>
          </div>

          {/* Col 1: Product */}
          <div>
            <h4 className="font-bold text-[13px] uppercase tracking-wider text-[#0F0F1A] mb-4">PRODUCT</h4>
            <ul className="space-y-3 p-0 m-0 list-none">
              {[
                ['Platform', '#platform'],
                ['The Say-Do Score', '#say-do'],
                ['Pricing', '#pricing'],
                ['Security', '#security'],
              ].map(([item, href]) => (
                <li key={item}>
                  <a href={href} className="text-[14px] text-[#000000] hover:text-[#6B6B88] transition-colors no-underline">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 2: Candidates */}
          <div>
            <h4 className="font-bold text-[13px] uppercase tracking-wider text-[#0F0F1A] mb-4">CANDIDATES</h4>
            <ul className="space-y-3 p-0 m-0 list-none">
              <li>
                <a href="#start" className="text-[14px] text-[#000000] hover:text-[#6B6B88] transition-colors no-underline">
                  Start Assessment
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@proctora.com"
                  className="text-[14px] text-[#000000] hover:text-[#6B6B88] transition-colors no-underline"
                >
                  Support
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Legal */}
          <div>
            <h4 className="font-bold text-[13px] uppercase tracking-wider text-[#0F0F1A] mb-4">LEGAL</h4>
            <ul className="space-y-3 p-0 m-0 list-none">
              {['Privacy Policy', 'Terms of Service'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-[14px] text-[#000000] hover:text-[#6B6B88] transition-colors no-underline">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-[#E5E7EB] flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-[#9CA3AF]">
          <div>© 2026 Proctora</div>
          <a
            href="mailto:hello@proctora.com"
            className="text-[#9CA3AF] hover:text-[#0F0F1A] transition-colors no-underline"
          >
            hello@proctora.com
          </a>
        </div>
      </div>
    </footer>
  )
}

// ─── Main Landing Page Component ─────────────────────────────────────────────
export function LandingPage() {
  const [showSignupModal, setShowSignupModal] = useState(false)
  const [selectedTier, setSelectedTier] = useState<string | undefined>()

  const handleOpenSignup = (tierId?: string) => {
    setSelectedTier(tierId)
    setShowSignupModal(true)
  }

  return (
    <div className="min-h-screen bg-[#FBFBFC] text-[#111827] font-sans antialiased overflow-x-hidden selection:bg-[#2563EB] selection:text-white scroll-smooth">
      <Header onOpenSignup={() => handleOpenSignup()} />

      {/* ═══ HERO SECTION (with 3D Swirl Ribbons & Figma Light Gradient) ═══ */}
      <section
        className="relative text-center pt-36 pb-20 overflow-hidden min-h-[880px]"
        style={{
          background:
            'radial-gradient(ellipse 65% 55% at 15% 78%, rgba(244, 114, 182, 0.32) 0%, rgba(251, 113, 133, 0.14) 30%, transparent 60%), radial-gradient(ellipse 65% 55% at 85% 78%, rgba(192, 132, 252, 0.3) 0%, rgba(147, 197, 253, 0.2) 35%, transparent 60%), radial-gradient(ellipse 80% 50% at 50% -10%, rgba(219, 234, 254, 0.6) 0%, rgba(255, 255, 255, 0) 100%), #FFFFFF',
        }}
      >
        {/* Figma Light Gradient Mesh Background */}
        <div className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden opacity-80">
          <img
            src="/light-gradient-14.svg"
            alt=""
            className="w-full h-full object-cover object-center select-none"
          />
        </div>

        {/* 3D Swirl Graphics on either side */}
        <FloatingRibbonLeft />
        <FloatingRibbonRight />

        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 relative z-10">
          <Reveal delay={0.1}>
            <div className="max-w-[1020px] mx-auto text-center">
              {/* Main Headline */}
              <h1 className="text-[36px] sm:text-[48px] md:text-[58px] lg:text-[66px] font-extrabold tracking-tight leading-[1.08] mb-5">
                <span className="text-[#2E5DE0] block">They can say the right thing.</span>
                <span className="text-[#0F0F1A] block mt-1">But do they actually build it?</span>
              </h1>

              {/* Sub-headline Paragraph */}
              <p className="text-[15px] sm:text-[17px] md:text-[19px] text-[#4B5563] leading-relaxed max-w-[760px] mx-auto mb-9">
                Proctora runs candidates through real code, real tickets, and real conversations to see if their code matches their promises. The signal resume screens and live interviews miss.
              </p>

              {/* Live Assessment Invite Input Widget */}
              <div className="max-w-[560px] mx-auto mb-6">
                <InviteWidget />
              </div>
            </div>

            {/* Dark Workspace Code & Conversation Split Mockup */}
            <BrowserMockup />
          </Reveal>
        </div>
      </section>

      {/* ═══ PROBLEM SECTION ═══ */}
      <ProblemSection />

      {/* ═══ 5 CORE MODULES SECTION ═══ */}
      <CoreModulesSection />

      {/* ═══ SAY-DO AGREEMENT SECTION ═══ */}
      <SayDoSection />

      {/* ═══ PRICING & CREDIT MODEL SECTION ═══ */}
      <PricingSection onOpenSignup={handleOpenSignup} />

      {/* ═══ CALL TO ACTION BANNER ═══ */}
      <CtaBanner onOpenSignup={() => handleOpenSignup()} />

      {/* ═══ FOOTER ═══ */}
      <Footer />

      {/* ═══ CLIENT ONBOARDING MODAL ═══ */}
      <ClientOnboardingModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        selectedTierId={selectedTier}
      />
    </div>
  )
}
