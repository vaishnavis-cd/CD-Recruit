import React from 'react'
import {
  CheckCircle2,
  Clock,
  Code2,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  Award,
  Zap,
  Check,
  FileCode,
  Activity,
  UserCheck,
} from 'lucide-react'
import { ResolutionData } from './IncidentResolutionModal'

interface IncidentDebriefViewProps {
  resolutionData?: ResolutionData | null
  actionHistory: Array<{ timestamp: string; label: string; type: string }>
}

export function IncidentDebriefView({ resolutionData, actionHistory }: IncidentDebriefViewProps) {
  const scores = {
    debugging: 92,
    codeQuality: 88,
    communication: 95,
    riskAssessment: 90,
    timeManagement: 85,
    decisionMaking: 90,
  }

  const expertMetrics = [
    { metric: 'Time Spent', expert: '12m 30s', candidate: '11m 45s', status: 'BETTER' },
    { metric: 'Files Inspected', expert: '4 files', candidate: `${Math.max(3, actionHistory.length > 2 ? 4 : 2)} files`, status: 'MATCH' },
    { metric: 'Diagnostic Runs', expert: '3 runs', candidate: '2 runs', status: 'MATCH' },
    { metric: 'Communication Score', expert: '90%', candidate: '95%', status: 'BETTER' },
    { metric: 'Risk Assessment Score', expert: '95%', candidate: '90%', status: 'MATCH' },
  ]

  const timelineEvents = [
    { time: '09:14', event: 'QA reported login validation bug during regression', icon: AlertTriangle, color: 'text-amber-500' },
    { time: '09:32', event: 'Incident War Room launched & candidate assigned', icon: Zap, color: 'text-blue-500' },
    { time: '09:48', event: 'Initial SAY strategy plan submitted', icon: Code2, color: 'text-purple-500' },
    { time: '10:05', event: 'Inspected login_validation.py & executed diagnostic test suite', icon: Activity, color: 'text-emerald-500' },
    { time: '10:18', event: 'Implemented leading & trailing space validation fix', icon: FileCode, color: 'text-indigo-500' },
    { time: '10:22', event: 'Communicated deployment status to PM & Engineering Manager', icon: MessageSquare, color: 'text-blue-500' },
    { time: '10:25', event: 'Signed off Incident Resolution & authorized deployment', icon: CheckCircle2, color: 'text-emerald-500' },
  ]

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-8 pb-20 text-[var(--text-primary)]">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                PASSED — HIGH CONFIDENCE
              </span>
              <span className="text-xs font-mono text-[var(--text-secondary)]">Incident ID: INC-2026-0891</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-1">
              Engineering Post-Incident Debrief &amp; Review
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Comprehensive evaluation of incident response, code remediation, stakeholder communication, and risk management.
            </p>
          </div>
        </div>

        <div className="text-right font-mono">
          <span className="text-[10px] uppercase text-[var(--text-secondary)] block font-bold">Overall Rating</span>
          <span className="text-2xl font-extrabold text-emerald-500">EXCEEDS</span>
        </div>
      </div>

      {/* Performance Radar Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Debugging & Diagnosis', score: scores.debugging, color: 'text-emerald-500', bar: 'bg-emerald-500' },
          { label: 'Code Quality & Cleanliness', score: scores.codeQuality, color: 'text-blue-500', bar: 'bg-blue-500' },
          { label: 'Stakeholder Communication', score: scores.communication, color: 'text-purple-500', bar: 'bg-purple-500' },
          { label: 'Risk & Safety Assessment', score: scores.riskAssessment, color: 'text-indigo-500', bar: 'bg-indigo-500' },
          { label: 'Time & Urgency Control', score: scores.timeManagement, color: 'text-amber-500', bar: 'bg-amber-500' },
          { label: 'Decision Making & Strategy', score: scores.decisionMaking, color: 'text-emerald-500', bar: 'bg-emerald-500' },
        ].map((item, i) => (
          <div key={i} className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-[var(--text-secondary)] font-sans">{item.label}</span>
              <span className={`font-bold font-mono text-sm ${item.color}`}>{item.score}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--background)] overflow-hidden border border-[var(--border)]">
              <div className={`h-full ${item.bar} rounded-full transition-all duration-500`} style={{ width: `${item.score}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid: Replay Timeline & Senior Engineer Feedback */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Replay Timeline */}
        <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-[#2F5CFF] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#2F5CFF]" />
            <span>Incident Replay Timeline</span>
          </h3>

          <div className="relative pl-6 space-y-4 border-l border-[var(--border)]">
            {timelineEvents.map((evt, idx) => {
              const Icon = evt.icon
              return (
                <div key={idx} className="relative space-y-0.5">
                  <div className="absolute -left-[31px] top-0 p-1 rounded-full bg-[var(--surface)] border border-[var(--border)]">
                    <Icon className={`w-3.5 h-3.5 ${evt.color}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-[var(--text-secondary)]">{evt.time}</span>
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{evt.event}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Senior Engineer Review & Missed Opportunities */}
        <div className="space-y-6">
          {/* Code Review Comments */}
          <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-emerald-500">
                Senior Engineer Code Review Comments
              </h3>
            </div>

            <div className="p-4 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--text-primary)] space-y-2 leading-relaxed">
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                "Strong root cause analysis and clean remediation."
              </p>
              <p className="text-[var(--text-secondary)]">
                The candidate correctly identified the missing space validation in <code className="font-mono text-[var(--accent)]">validate_username()</code>.
                Communication with stakeholders was clear, structured, and provided accurate ETA expectations without overpromising.
              </p>
            </div>
          </div>

          {/* Missed Opportunities / Recommendations */}
          <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-amber-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Recommendations &amp; Missed Opportunities</span>
            </h3>

            <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
              <li className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)]">
                <span className="font-bold text-amber-500 shrink-0">•</span>
                <span>Inspecting related helper files like <code className="font-mono text-[var(--accent)]">utils/string_helpers.py</code> before editing could have identified pre-existing sanitizer functions.</span>
              </li>
              <li className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)]">
                <span className="font-bold text-amber-500 shrink-0">•</span>
                <span>Proactively running the regression test suite twice ensured 100% confidence before authorization.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Expert Comparison Table */}
      <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-[var(--text-primary)] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Benchmark Comparison: Expert vs Candidate</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono text-left">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                <th className="py-2 px-3 font-semibold uppercase text-[10px]">Metric</th>
                <th className="py-2 px-3 font-semibold uppercase text-[10px]">Expert Benchmark</th>
                <th className="py-2 px-3 font-semibold uppercase text-[10px]">Candidate Metric</th>
                <th className="py-2 px-3 font-semibold uppercase text-[10px]">Evaluation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
              {expertMetrics.map((m, i) => (
                <tr key={i} className="hover:bg-[var(--background)]">
                  <td className="py-2.5 px-3 font-bold font-sans">{m.metric}</td>
                  <td className="py-2.5 px-3 text-[var(--text-secondary)]">{m.expert}</td>
                  <td className="py-2.5 px-3 font-bold text-[var(--accent)]">{m.candidate}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      m.status === 'BETTER'
                        ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                        : 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                    }`}>
                      {m.status === 'BETTER' ? '✓ EXCEEDS' : '✓ MATCHES EXPERT'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
