import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  Shield,
  ArrowRight,
  Link2,
  Check,
  LayoutGrid,
  Database,
  Code2,
  Sparkles,
  Cpu,
  Briefcase,
  Video,
  User,
} from 'lucide-react'

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

// ─── Iridescent Floating Ribbon Graphics ─────────────────────────────────────
function FloatingRibbonLeft() {
  return (
    <div
      aria-hidden="true"
      className="absolute -left-12 top-28 w-44 h-72 pointer-events-none select-none opacity-80 lg:opacity-100"
    >
      <svg viewBox="0 0 160 260" fill="none" className="w-full h-full filter drop-shadow-xl">
        <defs>
          <linearGradient id="ribbonGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.8" />
            <stop offset="35%" stopColor="#93C5FD" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#FBCFE8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#67E8F9" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="ribbonHighlight1" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#818CF8" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path
          d="M30 20 C60 50, 140 70, 100 130 C60 190, 10 160, 40 220 C60 260, 110 240, 130 210"
          stroke="url(#ribbonGrad1)"
          strokeWidth="28"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M30 20 C60 50, 140 70, 100 130 C60 190, 10 160, 40 220 C60 260, 110 240, 130 210"
          stroke="url(#ribbonHighlight1)"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  )
}

function FloatingRibbonRight() {
  return (
    <div
      aria-hidden="true"
      className="absolute -right-12 top-36 w-44 h-72 pointer-events-none select-none opacity-80 lg:opacity-100"
    >
      <svg viewBox="0 0 160 260" fill="none" className="w-full h-full filter drop-shadow-xl">
        <defs>
          <linearGradient id="ribbonGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#A5B4FC" stopOpacity="0.85" />
            <stop offset="40%" stopColor="#67E8F9" stopOpacity="0.9" />
            <stop offset="80%" stopColor="#F472B6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.75" />
          </linearGradient>
          <linearGradient id="ribbonHighlight2" x1="100%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path
          d="M130 20 C100 60, 20 80, 50 140 C80 200, 140 170, 110 230 C90 270, 40 250, 20 220"
          stroke="url(#ribbonGrad2)"
          strokeWidth="28"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M130 20 C100 60, 20 80, 50 140 C80 200, 140 170, 110 230 C90 270, 40 250, 20 220"
          stroke="url(#ribbonHighlight2)"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  )
}

// ─── 3D Card Isometric Graphics ──────────────────────────────────────────────
function TakeHomesIllustration() {
  return (
    <svg viewBox="0 0 200 130" fill="none" className="w-full h-28 mx-auto mt-2">
      <defs>
        <linearGradient id="thGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#2563EB" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="thGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <path d="M60 40 L130 15 L160 70 L90 95 Z" fill="url(#thGrad1)" opacity="0.6" />
      <path d="M50 50 L120 25 L150 80 L80 105 Z" fill="url(#thGrad2)" opacity="0.85" />
      <path d="M40 60 L110 35 L140 90 L70 115 Z" fill="#FFFFFF" opacity="0.9" />
      <path d="M55 55 L95 40 M55 67 L105 50 M55 79 L85 68" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
    </svg>
  )
}

function LiveInterviewsIllustration() {
  return (
    <svg viewBox="0 0 200 130" fill="none" className="w-full h-28 mx-auto mt-2">
      <defs>
        <linearGradient id="camGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id="lensGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#DBEAFE" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
      </defs>
      <rect x="40" y="45" width="75" height="55" rx="14" fill="url(#camGrad1)" />
      <rect x="44" y="49" width="67" height="47" rx="10" fill="#2563EB" opacity="0.9" />
      <circle cx="77" cy="72" r="18" fill="url(#lensGrad)" />
      <circle cx="77" cy="72" r="11" fill="#0F172A" />
      <circle cx="73" cy="68" r="4" fill="#60A5FA" opacity="0.9" />
      <path d="M115 58 L160 38 L160 106 L115 86 Z" fill="url(#camGrad1)" opacity="0.85" />
      <path d="M120 63 L152 48 L152 96 L120 81 Z" fill="#93C5FD" opacity="0.5" />
    </svg>
  )
}

function ResumeScreensIllustration() {
  return (
    <svg viewBox="0 0 200 130" fill="none" className="w-full h-28 mx-auto mt-2">
      <defs>
        <linearGradient id="megaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <path d="M60 55 L130 30 L130 100 L60 75 Z" fill="url(#megaGrad)" />
      <ellipse cx="130" cy="65" rx="8" ry="35" fill="#DBEAFE" />
      <ellipse cx="60" cy="65" rx="5" ry="10" fill="#1E40AF" />
      <rect x="40" y="60" width="22" height="10" rx="3" fill="#60A5FA" />
      <path d="M50 70 L50 98 L62 98 L62 70 Z" fill="#1D4ED8" />
    </svg>
  )
}

// ─── 1. Header / Navbar (Figma Spec Node 7:435) ────────────────────────────────
function Header() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <header
      className="fixed top-0 w-full z-50 backdrop-blur-md transition-all duration-200"
      style={{
        background: scrolled ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 255, 255, 0.9)',
        borderBottom: '1px solid rgba(229, 231, 235, 0.8)',
        boxShadow: scrolled ? '0 4px 20px -2px rgba(0, 0, 0, 0.05)' : 'none',
      }}
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

          <a
            href="mailto:hello@proctora.com?subject=Demo%20request"
            className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 text-[13px] sm:text-[14px] font-semibold text-white rounded-lg no-underline transition-all hover:bg-[#2349B8] hover:shadow-md active:scale-98 whitespace-nowrap"
            style={{ background: '#2E5DE0', boxShadow: '0 2px 10px rgba(46,93,224,0.25)' }}
          >
            Book Demo <ArrowRight size={14} />
          </a>
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
        {/* Input Box — Figma id 25:178: 399×49, bg #FFFFFF1A, transparent w/ black border */}
        <div
          className="flex items-center gap-2.5 flex-1 min-w-0 bg-transparent border border-[#0F0F1A] rounded-[10px] px-4 py-[14px] transition-all focus-within:border-[#0F0F1A]"
        >
          {/* IconLink — Figma id 25:180: 16×16, two 8×9 chain vectors */}
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            className="flex-shrink-0 opacity-50"
            aria-hidden="true"
          >
            <path d="M6.667 8.667a3.333 3.333 0 005 .04l2-2a3.333 3.333 0 00-4.714-4.714l-1.147 1.14" stroke="#0F0F1A" strokeWidth="1.333" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9.333 7.333a3.333 3.333 0 00-5-.04l-2 2a3.333 3.333 0 004.714 4.714l1.14-1.147" stroke="#0F0F1A" strokeWidth="1.333" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
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
          className="flex items-center justify-center gap-1.5 rounded-[10px] text-[14px] font-semibold text-white transition-all hover:bg-[#2349B8] active:scale-[0.98] cursor-pointer flex-shrink-0 whitespace-nowrap"
          style={{ background: '#2E5DE0', width: '151px', height: '49px' }}
        >
          {loading ? (
            <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" />
            </svg>
          ) : (
            <>
              Start Session <ArrowRight size={14} />
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
    <Reveal delay={0.35} className="mt-14 max-w-[960px] mx-auto">
      <div
        className="rounded-2xl border border-[#1E293B]/80 overflow-hidden text-left bg-[#12131A] shadow-2xl"
        style={{
          boxShadow: '0 30px 90px -15px rgba(15, 23, 42, 0.4), 0 0 80px -20px rgba(37, 99, 235, 0.25)',
        }}
      >
        {/* Window Chrome Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1E293B] bg-[#0E0F15]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#EF4444]" />
            <span className="w-3 h-3 rounded-full bg-[#F59E0B]" />
            <span className="w-3 h-3 rounded-full bg-[#10B981]" />
          </div>
          <div className="text-[12px] font-mono text-[#64748B] bg-[#181924] border border-[#1E293B] rounded-md py-1 px-4 tracking-wide">
            assess.proctora.com/workspace/●●●●●●
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
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)' }}
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
                className="rounded-xl p-4 border border-[#2563EB]/30"
                style={{ background: 'rgba(37, 99, 235, 0.08)' }}
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
        <Reveal className="flex justify-center">
          <img
            src="/problem_section.svg"
            alt="Skill tests grade the output. They ignore the context. Take-homes, Live interviews, Resume screens, and The Full Picture."
            className="w-full h-auto max-w-[1200px] object-contain block"
          />
        </Reveal>
      </div>
    </section>
  )
}

// ─── 5. 5 Core Modules / Platform Section ─────────────────────────────────────
function CoreModulesSection() {
  return (
    <section id="platform" className="py-12 bg-[#FFFFFF] scroll-mt-24">
      <div className="max-w-[1200px] mx-auto px-6">
        <Reveal className="flex justify-center">
          <img
            src="/core_modules.svg"
            alt="5 Core Modules: MCQ, SQL, Coding & DSA, AI Prompting, Contextual Simulation"
            className="w-full h-auto max-w-[1200px] object-contain block"
          />
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
                <div className="text-6xl sm:text-7xl font-extrabold text-[#2E5DE0] tracking-tight leading-none mb-1">
                  94%
                </div>
                <div className="text-[12px] font-bold uppercase tracking-wider text-[#6B6B88]">
                  SAY-DO SYNC SCORE
                </div>
              </div>

              {/* Progress Bar Tracker */}
              <div className="pb-6 border-b border-[#F1F5F9] mb-6">
                <div className="flex justify-between text-[13px] font-medium mb-2.5">
                  <span className="text-[#6B6B88]">Responses Flagged</span>
                  <span className="text-[#EF4444] font-semibold">1 of 14</span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#F0F1F7] overflow-hidden">
                  <div className="h-full rounded-full bg-[#2E5DE0] w-[94%]" />
                </div>
              </div>

              {/* 4-Box Stat Grid (Figma Spec #EFF3FF) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-[#EFF3FF] border border-[#2E5DE0]/10">
                  <div className="text-[22px] font-extrabold text-[#0F0F1A] leading-none mb-1">14</div>
                  <div className="text-[12px] font-medium text-[#6B6B88]">Code Reviewed</div>
                </div>

                <div className="p-4 rounded-2xl bg-[#EFF3FF] border border-[#2E5DE0]/10">
                  <div className="text-[22px] font-extrabold text-[#0F0F1A] leading-none mb-1">3.2m</div>
                  <div className="text-[12px] font-medium text-[#6B6B88]">Avg Response Time</div>
                </div>

                <div className="p-4 rounded-2xl bg-[#EFF3FF] border border-[#2E5DE0]/10">
                  <div className="text-[22px] font-extrabold text-[#0F0F1A] leading-none mb-1">94%</div>
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

// ─── 7. Wide Call-To-Action Banner (Crisp Vector SVG from Figma) ───────────────
function CtaBanner() {
  return (
    <section className="py-20 bg-[#FFFFFF]">
      <div className="max-w-[1470px] mx-auto px-4 sm:px-6">
        <Reveal>
          <div className="relative rounded-3xl overflow-hidden shadow-2xl group border border-[#2E5DE0]/20 bg-[#5282FF]">
            {/* Vector SVG Exported directly from Figma */}
            <img
              src="/cta_banner.svg"
              alt="See what your current process is missing"
              className="w-full h-auto block object-contain"
            />
            {/* Clickable Overlay Link over Request a Demo Button */}
            <a
              href="mailto:hello@proctora.com?subject=Demo%20request"
              aria-label="Request a demo"
              className="absolute left-[3.5%] bottom-[16%] w-[22%] h-[20%] min-w-[140px] max-w-[220px] rounded-2xl cursor-pointer hover:bg-white/10 active:bg-white/20 transition-all"
            />
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
                ['Say-Do Score', '#say-do'],
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
  return (
    <div className="min-h-screen bg-[#FBFBFC] text-[#111827] font-sans antialiased overflow-x-hidden selection:bg-[#2563EB] selection:text-white scroll-smooth">
      <Header />

      {/* ═══ HERO SECTION (Figma BG.png & Container (4).svg) ═══ */}
      <section
        className="relative text-center pt-36 pb-20 overflow-hidden min-h-[880px]"
        style={{
          backgroundImage: "url('/hero_bg.png')",
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center top',
        }}
      >
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 relative z-10">
          <Reveal delay={0.1}>
            <div className="relative mx-auto max-w-[1240px] group">
              {/* Figma Container (4).svg Vector Image */}
              <img
                src="/hero_container.svg"
                alt="They can say the right thing. But do they actually build it?"
                className="w-full h-auto block object-contain select-none"
              />

              {/* Positioned Live Input Box & Submit Button — exact SVG position y=408/867 = 47% */}
              <div className="absolute left-1/2 -translate-x-1/2 top-[47%] w-[90%] max-w-[560px] z-20">
                <InviteWidget />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ PROBLEM SECTION ═══ */}
      <ProblemSection />

      {/* ═══ 5 CORE MODULES SECTION ═══ */}
      <CoreModulesSection />

      {/* ═══ SAY-DO AGREEMENT SECTION ═══ */}
      <SayDoSection />

      {/* ═══ CALL TO ACTION BANNER ═══ */}
      <CtaBanner />

      {/* ═══ FOOTER ═══ */}
      <Footer />
    </div>
  )
}
