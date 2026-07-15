import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search, LayoutGrid, List as ListIcon, AlertTriangle } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { ScopeSpark } from "../components/scope-panel";
import { SessionDetailBody, StatusPill } from "../components/session-detail";
import { useStore } from "../lib/store";
import { ROLE_TEMPLATES, type Session, type SessionStatus } from "../lib/mock-data";

export const Route = createFileRoute("/sessions")({
  component: SessionsPage,
  head: () => ({
    meta: [
      { title: "Sessions — CD-Recruit" },
      { name: "description", content: "Review candidate assessment sessions across the pipeline." },
    ],
  }),
});

const STATUS_ORDER: SessionStatus[] = ["submitted", "ai_scored", "review", "reviewed", "decision"];
const STATUS_LABEL: Record<SessionStatus, string> = {
  submitted: "Submitted",
  ai_scored: "AI Scored",
  review: "Needs Review",
  reviewed: "Reviewed",
  decision: "Decision Made",
};

function SessionsPage() {
  const sessions = useStore((s) => s.sessions);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SessionStatus | "all">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [flagsOnly, setFlagsOnly] = useState<"any" | "yes" | "no">("any");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (
        q &&
        !s.candidate.name.toLowerCase().includes(q) &&
        !s.candidate.email.toLowerCase().includes(q)
      )
        return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (roleFilter !== "all" && s.roleTemplate.id !== roleFilter) return false;
      if (flagsOnly === "yes" && s.integrityFlags.length === 0) return false;
      if (flagsOnly === "no" && s.integrityFlags.length > 0) return false;
      return true;
    });
  }, [sessions, query, statusFilter, roleFilter, flagsOnly]);

  return (
    <AppShell
      title="Sessions"
      count={filtered.length}
      search={
        <div className="relative w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9CA5]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidate name or email…"
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
          />
        </div>
      }
      actions={
        <div className="flex items-center gap-1 p-1 bg-[#EFF0F3] rounded-md">
          <button
            onClick={() => setView("list")}
            className={`p-1.5 rounded ${view === "list" ? "bg-white shadow-sm" : "text-[#5B5B64]"}`}
            title="List view"
          >
            <ListIcon size={14} />
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`p-1.5 rounded ${view === "kanban" ? "bg-white shadow-sm" : "text-[#5B5B64]"}`}
            title="Kanban view"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      }
    >
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as any)}
          options={[
            { value: "all", label: "All" },
            ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
          ]}
        />
        <FilterSelect
          label="Role"
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: "all", label: "All" },
            ...ROLE_TEMPLATES.map((rt) => ({
              value: rt.id,
              label: `${rt.roleName} · ${rt.track}`,
            })),
          ]}
        />
        <FilterSelect
          label="Flags"
          value={flagsOnly}
          onChange={(v) => setFlagsOnly(v as any)}
          options={[
            { value: "any", label: "Any" },
            { value: "yes", label: "Has flags" },
            { value: "no", label: "No flags" },
          ]}
        />
      </div>

      {view === "list" ? (
        <ListView sessions={filtered} onOpen={setOpenId} />
      ) : (
        <KanbanView sessions={filtered} onOpen={setOpenId} />
      )}

      {/* Drawer */}
      {openId && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpenId(null)} />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[720px] bg-white shadow-2xl flex flex-col">
            <SessionDetailBody sessionId={openId} onClose={() => setOpenId(null)} embedded />
          </div>
        </>
      )}
    </AppShell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const active = value !== "all" && value !== "any";
  return (
    <label
      className={`inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full border text-[12px] cursor-pointer transition-colors ${
        active
          ? "bg-[#0B0B0D] text-white border-[#0B0B0D]"
          : "bg-white text-[#5B5B64] border-[#E6E6EA] hover:border-[#D6D7DC]"
      }`}
    >
      <span className="font-mono uppercase tracking-[0.14em] text-[10px]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent border-0 outline-none pr-1 text-[12px]"
        style={{ color: "inherit" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-[#0B0B0D]">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ListView({ sessions, onOpen }: { sessions: Session[]; onOpen: (id: string) => void }) {
  return (
    <div className="bg-white border border-[#E6E6EA] rounded-[10px] overflow-hidden">
      <div className="grid grid-cols-[2fr_1.4fr_1fr_1fr_0.9fr_1fr_0.8fr_0.6fr] gap-3 px-4 py-2.5 border-b border-[#E6E6EA] bg-[#F7F7F9] text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B5B64]">
        <div>Candidate</div>
        <div>Role</div>
        <div>Composite</div>
        <div>Say-Do</div>
        <div>Flags</div>
        <div>Status</div>
        <div>Submitted</div>
        <div>Reviewer</div>
      </div>
      {sessions.length === 0 && (
        <div className="p-8 text-center text-[13px] text-[#5B5B64]">
          No sessions match these filters.
        </div>
      )}
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onOpen(s.id)}
          className="w-full text-left grid grid-cols-[2fr_1.4fr_1fr_1fr_0.9fr_1fr_0.8fr_0.6fr] gap-3 px-4 py-3 border-b border-[#E6E6EA] last:border-b-0 hover:bg-[#F7F7F9] items-center"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#EFF0F3] text-[#0B0B0D] flex items-center justify-center font-mono text-[11px] shrink-0">
              {s.candidate.initials}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-[#0B0B0D] truncate">{s.candidate.name}</div>
              <div className="text-[11px] text-[#5B5B64] truncate">{s.candidate.email}</div>
            </div>
          </div>
          <div className="text-[12px] min-w-0">
            <div className="text-[#0B0B0D] truncate">{s.roleTemplate.roleName}</div>
            <div className="text-[#5B5B64]">{s.roleTemplate.track}</div>
          </div>
          <div>
            <div className="font-mono text-[13px] text-[#0B0B0D] mb-1">{s.compositeScore}</div>
            <div className="h-1 bg-[#EFF0F3] rounded">
              <div
                className="h-full bg-[#2F5CFF] rounded"
                style={{ width: `${s.compositeScore}%` }}
              />
            </div>
          </div>
          <div>
            <ScopeSpark data={s.sayDoTrace} />
          </div>
          <div className="flex items-center gap-1.5 text-[12px] font-mono">
            {s.integrityFlags.length === 0 ? (
              <span className="text-[#5B5B64]">—</span>
            ) : (
              <>
                <span className="text-[#0B0B0D]">{s.integrityFlags.length}</span>
                {s.integrityFlags.some((f) => f.severity === "critical") && (
                  <span className="w-2 h-2 rounded-full bg-[#E5484D]" title="critical" />
                )}
              </>
            )}
          </div>
          <div>
            <StatusPill status={s.status} />
          </div>
          <div className="font-mono text-[11px] text-[#5B5B64]">{s.submittedAt}</div>
          <div>
            {s.reviewer ? (
              <div className="w-7 h-7 rounded-full bg-[#EAF0FF] text-[#15308F] flex items-center justify-center font-mono text-[10px]">
                {s.reviewer.initials}
              </div>
            ) : (
              <span className="text-[#9C9CA5]">—</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function KanbanView({ sessions, onOpen }: { sessions: Session[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-5 gap-3 overflow-x-auto">
      {STATUS_ORDER.map((st) => {
        const items = sessions.filter((s) => s.status === st);
        return (
          <div key={st} className="bg-[#EFF0F3] rounded-[10px] p-2 min-h-[300px]">
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B5B64]">
                {STATUS_LABEL[st]}
              </div>
              <div className="text-[10px] font-mono text-[#5B5B64]">{items.length}</div>
            </div>
            <div className="space-y-2">
              {items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onOpen(s.id)}
                  className="w-full text-left bg-white border border-[#E6E6EA] rounded-md p-3 hover:border-[#2F5CFF] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-[#EFF0F3] text-[#0B0B0D] flex items-center justify-center font-mono text-[10px]">
                      {s.candidate.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-[#0B0B0D] truncate">{s.candidate.name}</div>
                      <div className="text-[10px] text-[#5B5B64] truncate">
                        {s.roleTemplate.roleName}
                      </div>
                    </div>
                    {s.integrityFlags.some((f) => f.severity === "critical") && (
                      <AlertTriangle size={12} className="text-[#E5484D] shrink-0" />
                    )}
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#5B5B64]">
                        composite
                      </div>
                      <div className="font-mono text-[16px] text-[#0B0B0D]">{s.compositeScore}</div>
                    </div>
                    <ScopeSpark data={s.sayDoTrace} width={64} height={22} />
                  </div>
                </button>
              ))}
              {items.length === 0 && (
                <div className="text-[11px] text-[#9C9CA5] text-center py-4">No sessions</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
