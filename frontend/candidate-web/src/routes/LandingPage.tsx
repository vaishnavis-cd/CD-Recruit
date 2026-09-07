import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────
function extractInviteId(raw: string): string | null {
  const v = (raw || '').trim();
  if (!v) return null;
  const m = v.match(/\/(?:invite|start)\/([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  if (/^inv_[a-zA-Z0-9]+$/i.test(v)) return v;
  return null;
}

// ─── Reveal ───────────────────────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px 0px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: 'easeOut', delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled ? 'bg-[var(--background)]/90 backdrop-blur-md border-b border-[var(--border)] shadow-xs py-3.5' : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between">
        {/* Brand */}
        <a href="#" className="flex items-center gap-2.5 no-underline">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-mono font-bold text-sm tracking-wider shadow-xs">
            P
          </div>
          <span className="font-bold text-lg tracking-tight text-[var(--foreground)]">Proctora</span>
        </a>

        <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
          {([['Platform', '#how-it-works'], ['The Say-Do Score', '#say-do'], ['Security', '#trust']] as [string, string][]).map(([label, href]) => (
            <a key={href} href={href} className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors no-underline">{label}</a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a href="#start"
            className="hidden sm:inline-flex items-center px-4 py-2 text-xs font-semibold text-[var(--foreground)] border border-[var(--border)] rounded-lg bg-[var(--surface)] hover:bg-[var(--background)] hover:border-[var(--border)] transition-all no-underline">
            Have an invite?
          </a>
          <a href="mailto:hello@proctora.com?subject=Demo%20request"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-lg no-underline transition-all hover:-translate-y-0.5 bg-brand hover:bg-brand-hover shadow-xs"
            style={{ background: '#111827' }}>
            Book Demo <ArrowRight size={13} />
          </a>
        </div>
      </div>
    </header>
  );
}

// ─── Invite Widget ────────────────────────────────────────────────────────────
function InviteWidget() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'error' | 'success'>('idle');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  function reset() { setState('idle'); }

  function handleStart() {
    const id = extractInviteId(value);
    if (!id) {
      setState('error');
      setMsg('Please enter a valid invite link or ID.');
      return;
    }
    setState('success');
    setMsg('Found it — taking you to your assessment…');
    setLoading(true);
    setTimeout(() => navigate(`/invite/${id}`), 650);
  }

  return (
    <div id="start" className="max-w-[480px] mx-auto">
      <div className="flex gap-2 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xs">
        <input
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); if (state === 'error') reset(); }}
          onKeyDown={e => e.key === 'Enter' && handleStart()}
          placeholder="Paste your assessment invite link or ID..."
          spellCheck={false}
          autoComplete="off"
          aria-label="Paste your assessment invite link or ID"
          className="flex-1 min-w-0 bg-transparent border-none font-mono text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none px-4 py-3"
        />
        <button
          onClick={handleStart}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:-translate-y-0.5 disabled:opacity-60 cursor-pointer flex-shrink-0 bg-brand hover:bg-brand-hover shadow-xs"
        >
          {loading
            ? <Loader2 className="animate-spin w-4 h-4" />
            : 'Start Session'
          }
        </button>
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={state + msg}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-live="polite"
          className={`mt-3 text-xs font-mono text-center ${state === 'error' ? 'text-danger' : state === 'success' ? 'text-success' : 'text-[var(--muted-foreground)]'}`}
        >
          {msg}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

// ─── Browser Mockup ───────────────────────────────────────────────────────────
function BrowserMockup() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <Reveal delay={0.5} className="mt-20">
      <div ref={ref} style={{ perspective: '1000px' }}>
        <motion.div
          initial={{ rotateX: 4, scale: 0.97 }}
          animate={inView ? { rotateX: 0, scale: 1 } : {}}
          whileHover={{ rotateX: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="rounded-xl border border-[var(--border)] overflow-hidden bg-white text-left"
          style={{ boxShadow: '0 30px 100px -10px rgba(37,99,235,0.15)', transformOrigin: 'top center' }}
        >
          {/* Chrome bar */}
          <div className="flex items-center gap-4 px-5 py-3 border-b border-[var(--border)]" style={{ background: '#F9FAFB' }}>
            <div className="flex gap-2">
              {['#D1D5DB', '#D1D5DB', '#D1D5DB'].map((c, i) => (
                <span key={i} className="w-3 h-3 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <div className="flex-1 text-center text-xs font-mono text-[var(--muted-foreground)] bg-white border border-[var(--border)] rounded-md py-1.5 px-4 max-w-[400px] mx-auto">
              assess.proctora.com/workspace/●●●●●●
            </div>
          </div>

          {/* Panes */}
          <div className="grid grid-cols-[1fr_1.5fr] min-h-[400px]">
            {/* Inbox */}
            <div className="bg-white p-6 border-r border-[var(--border)]">
              <div className="border border-[var(--accent)] rounded-lg p-4" style={{ background: 'rgba(37,99,235,0.07)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }} />
                  <span className="text-sm font-semibold text-[var(--foreground)]">Priya Shah · Eng Manager</span>
                </div>
                <p className="text-sm-minus text-[var(--foreground)] leading-relaxed m-0">
                  "Good catch — I'll make sure to add payload validation before this ships to prod."
                </p>
              </div>
            </div>

            {/* Code pane */}
            <div className="p-6 font-mono text-sm leading-[1.8]" style={{ background: '#F8FAFC', color: '#334155' }}>
              <div className="text-[var(--muted-foreground)]">{'// Candidate promised: payload validation'}</div>
              <div className="text-[var(--muted-foreground)]">{'// Status: Say-Do gap detected. No validation found.'}</div>
              <div className="mt-4">
                <span style={{ color: '#D946EF' }}>export async function </span>
                <span style={{ color: '#2563EB' }}>saveUser</span>
                <span>(payload) {'{'}</span>
              </div>
              <div><span className="ml-6">const user = payload.user;</span></div>
              <div><span className="ml-6">await db.insert(</span><span style={{ color: '#16A34A' }}>'users'</span><span>).values(user);</span></div>
              <div><span className="ml-6" style={{ color: '#D946EF' }}>return </span><span>{'{ ok: '}</span><span style={{ color: '#D946EF' }}>true</span><span>{' };'}</span></div>
              <div>{'}'}</div>
            </div>
          </div>
        </motion.div>
      </div>
    </Reveal>
  );
}

// ─── Checkmark Icon ───────────────────────────────────────────────────────────
function CheckIcon() {
  return <CheckCircle2 className="flex-shrink-0 text-success" size={18} />;
}

// ─── LandingPage ─────────────────────────────────────────────────────────────
export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--foreground)] font-sans">
      <Header />

      {/* ═══ HERO ═══ */}
      <section className="relative text-center overflow-hidden" style={{ padding: '160px 0 80px' }}>
        <div className="absolute pointer-events-none"
          style={{ top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 800, height: 600, background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, rgba(255,255,255,0) 70%)', zIndex: 0 }} />

        <div className="max-w-[1200px] mx-auto px-6 relative z-10">
          <Reveal delay={0.1}>
            <h1 className="font-extrabold tracking-[-0.02em] mb-6" style={{ fontSize: 'clamp(40px, 6vw, 72px)', lineHeight: 1.1 }}>
              <span style={{ background: 'linear-gradient(135deg, #111827 0%, #6B7280 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                They can say the right thing.
              </span>
              <br />
              <span style={{ background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                But do they actually build it?
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="mx-auto mb-10 text-xl leading-[1.65]" style={{ color: '#4B5563', maxWidth: 700 }}>
              Proctora runs candidates through real code, real tickets, and real pressure. Then checks whether their code matches their promises. The signal most platforms miss.
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <InviteWidget />
          </Reveal>

          <BrowserMockup />
        </div>
      </section>

      {/* ═══ PROBLEM — BENTO GRID ═══ */}
      <section style={{ padding: '120px 0' }}>
        <div className="max-w-[1200px] mx-auto px-6">
          <Reveal className="text-center max-w-[680px] mx-auto mb-16">
            <h2 className="font-extrabold tracking-[-0.02em] mb-4" style={{ fontSize: 'clamp(32px, 4vw, 48px)', lineHeight: 1.15 }}>
              Skill tests grade the output.<br />They ignore the context.
            </h2>
            <p className="text-lg leading-[1.6]" style={{ color: '#4B5563', margin: 0 }}>
              A candidate can promise anything in a chat reply. Most platforms never connect that promise back to the code. If tests pass, they pass.
            </p>
          </Reveal>

          <Reveal>
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {/* Row 1 — three small cards */}
              {[
                { title: 'Take-homes', desc: 'Projects that sit in a queue nobody on your team actually has time to review properly.' },
                { title: 'Live interviews', desc: "High-stress, performative sessions that don't scale past a handful of candidates a week." },
                { title: 'Resume screens', desc: "Filters that measure a candidate's pedigree and past logos instead of their actual judgment." },
              ].map((c, i) => (
                <motion.div
                  key={i}
                  whileHover={{ boxShadow: '0 10px 15px -3px rgba(0,0,0,0.06)', borderColor: '#D1D5DB' }}
                  className="rounded-2xl p-8 flex flex-col"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', transition: 'all 0.3s ease' }}
                >
                  <h3 className="font-extrabold tracking-[-0.02em] mb-3" style={{ fontSize: 24 }}>{c.title}</h3>
                  <p className="text-md leading-[1.6] m-0" style={{ color: '#4B5563' }}>{c.desc}</p>
                </motion.div>
              ))}

              {/* Row 2 — large highlight + small */}
              <motion.div
                whileHover={{ boxShadow: '0 10px 15px -3px rgba(0,0,0,0.06)' }}
                className="rounded-2xl p-8 flex flex-col col-span-2"
                style={{
                  background: 'linear-gradient(180deg, rgba(37,99,235,0.04) 0%, #FFFFFF 100%)',
                  border: '1px solid rgba(37,99,235,0.22)',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                  transition: 'all 0.3s ease',
                }}
              >
                <div className="text-xl font-bold text-[var(--foreground)] mb-4 tracking-[-0.01em]">What Proctora sees</div>
                <h3 className="font-extrabold tracking-[-0.02em] mb-3" style={{ fontSize: 32, color: '#2563EB' }}>The Full Picture.</h3>
                <p className="mb-6 leading-[1.6]" style={{ fontSize: 18, color: '#4B5563', maxWidth: 500 }}>
                  We check the tests, the syntax, and the speed. But more importantly, we check if the code actually matches what they told a teammate they'd do.
                </p>
                <div className="grid grid-cols-2 gap-3 mt-auto">
                  {['Tests pass', 'Clean syntax', 'Contextual accuracy', 'Say-Do alignment'].map(item => (
                    <div key={item} className="flex items-center gap-3 text-md" style={{ color: '#4B5563' }}>
                      <CheckIcon /> {item}
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                whileHover={{ boxShadow: '0 10px 15px -3px rgba(0,0,0,0.06)', borderColor: '#D1D5DB' }}
                className="rounded-2xl p-8 flex flex-col"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', transition: 'all 0.3s ease' }}
              >
                <div className="font-extrabold tracking-[-0.02em] leading-none mb-1" style={{ fontSize: 48, color: '#111827' }}>5</div>
                <div className="text-xs font-bold uppercase tracking-[0.1em] mb-5" style={{ color: '#9CA3AF' }}>Core Modules</div>
                <ul className="m-0 p-0 list-none space-y-2.5">
                  {['MCQ', 'SQL', 'Coding & DSA', 'AI Prompting', 'Contextual Simulation'].map(mod => (
                    <li key={mod} className="flex items-center gap-2.5 text-sm" style={{ color: '#4B5563' }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#2563EB' }} />
                      {mod}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ SAY-DO ═══ */}
      <section id="say-do" style={{ padding: '120px 0', borderTop: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB', background: 'radial-gradient(circle at right center, rgba(37,99,235,0.05) 0%, transparent 50%)' }}>
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <Reveal>
              <h2 className="font-extrabold tracking-[-0.02em] mb-6" style={{ fontSize: 'clamp(32px, 4vw, 48px)', lineHeight: 1.15 }}>
                We check if the conversation and the code agree.
              </h2>
              <p className="mb-8 leading-[1.65]" style={{ fontSize: 18, color: '#4B5563' }}>
                The Correlation Engine cross-references every written response against the code changes that follow it, scoring the distance between the two — not just whether it compiles.
              </p>
              <div className="rounded-xl p-6" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                <div className="font-mono text-xs uppercase tracking-[0.1em] mb-3" style={{ color: '#9CA3AF' }}>Example Event</div>
                <p className="mb-3" style={{ color: '#111827' }}>
                  Candidate writes: <span style={{ color: '#2563EB' }}>"Good catch, I'll add input validation before this ships."</span>
                </p>
                <p className="m-0 text-sm leading-[1.6]" style={{ color: '#4B5563' }}>
                  They submit code with no validation. The unit tests still pass. Proctora flags the mismatch anyway.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.2}>
              <div className="rounded-2xl p-8 relative overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                <motion.div
                  className="font-mono font-bold leading-none mb-2"
                  style={{ fontSize: 64, color: '#2563EB' }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  viewport={{ once: true }}
                >
                  94%
                </motion.div>
                <div className="font-bold uppercase tracking-[0.1em] mb-10" style={{ fontSize: 14, color: '#9CA3AF' }}>Say-Do Sync Score</div>
                <div className="border-t pt-6" style={{ borderColor: '#E5E7EB' }}>
                  <div className="flex justify-between mb-3 font-mono text-sm-minus">
                    <span style={{ color: '#4B5563' }}>Responses flagged</span>
                    <span style={{ color: '#EF4444' }}>1 of 14</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#E5E7EB' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: '#2563EB' }}
                      initial={{ width: 0 }}
                      whileInView={{ width: '94%' }}
                      transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                      viewport={{ once: true }}
                    />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ CLOSING CTA ═══ */}
      <section style={{ padding: '120px 0', textAlign: 'center' }}>
        <div className="max-w-[1200px] mx-auto px-6">
          <Reveal>
            <h2 className="font-extrabold tracking-[-0.02em] mb-6" style={{ fontSize: 'clamp(32px, 4vw, 48px)', lineHeight: 1.15 }}>
              See what your current process is missing.
            </h2>
            <p className="mx-auto mb-10 text-lg leading-[1.65]" style={{ color: '#4B5563', maxWidth: 500 }}>
              Walk through a real session and see the Say-Do Score applied to an actual candidate response.
            </p>
            <a
              href="mailto:hello@proctora.com?subject=Demo%20request"
              className="inline-flex items-center gap-2 px-6 py-3.5 text-md font-semibold text-white rounded-lg no-underline transition-all hover:-translate-y-0.5"
              style={{ background: '#111827', boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}
            >
              Request a demo
            </a>
          </Reveal>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="relative overflow-hidden" style={{ padding: '80px 0 40px' }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(160deg, #EEF2FF 0%, #F5F7FF 35%, #F9FAFB 65%, #EFF6FF 100%)',
          zIndex: 0,
        }} />
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, opacity: 0.045 }} aria-hidden="true">
          <filter id="footer-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#footer-noise)" />
        </svg>
        <div className="relative z-10 max-w-[1200px] mx-auto px-6">
          <div className="grid gap-12 mb-16" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
            <div>
              <a href="#" className="flex items-center gap-2.5 no-underline mb-4">
                <span className="font-bold text-lg text-[var(--foreground)] tracking-[-0.02em]">Proctora</span>
              </a>
              <p className="text-sm leading-[1.65] m-0" style={{ color: '#4B5563', maxWidth: 250 }}>
                Technical hiring that checks whether candidates meant what they said, not just whether the code runs.
              </p>
            </div>

            {([
              { heading: 'Product', links: [['Platform', '#how-it-works'], ['Say-Do Score', '#say-do'], ['Security', '#trust']] },
              { heading: 'Candidates', links: [['Start Assessment', '#start'], ['Support', 'mailto:support@proctora.com']] },
              { heading: 'Legal', links: [['Privacy Policy', '#'], ['Terms of Service', '#']] },
            ] as { heading: string; links: [string, string][] }[]).map(col => (
              <div key={col.heading}>
                <h5 className="font-semibold text-sm mb-6" style={{ color: '#111827', margin: '0 0 24px' }}>{col.heading}</h5>
                {col.links.map(([label, href]) => (
                  <a key={label} href={href} className="block text-sm no-underline mb-4 transition-colors"
                    style={{ color: '#4B5563' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#111827')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#4B5563')}
                  >
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-between items-center gap-4 pt-6 text-sm" style={{ color: '#9CA3AF' }}>
            <span>© 2026 Proctora</span>
            <a href="mailto:hello@proctora.com" className="no-underline transition-colors" style={{ color: '#9CA3AF' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#111827')}
              onMouseLeave={e => (e.currentTarget.style.color = '#9CA3AF')}
            >
              hello@proctora.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
