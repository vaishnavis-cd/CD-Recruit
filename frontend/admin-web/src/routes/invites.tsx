import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Check, X, Plus } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore } from "../lib/store";
import { ROLE_TEMPLATES, type Invite } from "../lib/mock-data";

export const Route = createFileRoute("/invites")({
  component: InvitesPage,
  head: () => ({
    meta: [
      { title: "Invites — CD-Recruit" },
      { name: "description", content: "Create and manage candidate assessment invites." },
    ],
  }),
});

const STEPS = ["Sent", "Opened", "Redeemed"] as const;

function StatusStepper({ status }: { status: Invite["status"] }) {
  const terminal = status === "EXPIRED" || status === "REVOKED";
  const activeIdx = status === "REDEEMED" ? 2 : status === "PENDING" ? 0 : terminal ? -1 : 0;
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = i <= activeIdx;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                terminal ? "bg-[#D6D7DC]" : done ? "bg-[#2F5CFF]" : "bg-[#D6D7DC]"
              }`}
            />
            <span
              className={`text-[10px] font-mono uppercase tracking-[0.14em] ${
                terminal ? "text-[#9C9CA5]" : done ? "text-[#0B0B0D]" : "text-[#9C9CA5]"
              }`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={`inline-block w-4 h-px ${terminal ? "bg-[#D6D7DC]" : done && i < activeIdx ? "bg-[#2F5CFF]" : "bg-[#D6D7DC]"}`}
              />
            )}
          </div>
        );
      })}
      {terminal && (
        <span className="ml-2 text-[10px] font-mono uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-[#EFF0F3] text-[#5B5B64]">
          {status}
        </span>
      )}
    </div>
  );
}

function InvitesPage() {
  const invites = useStore((s) => s.invites);
  const createInvite = useStore((s) => s.createInvite);
  const revokeInvite = useStore((s) => s.revokeInvite);

  const [open, setOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(ROLE_TEMPLATES[0].id);
  const [created, setCreated] = useState<Invite | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = async (link: string, id: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const submit = () => {
    if (!name || !email) return;
    const rt = ROLE_TEMPLATES.find((r) => r.id === roleId)!;
    const inv = createInvite({ candidateName: name, candidateEmail: email, roleTemplate: rt });
    setCreated(inv);
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setRoleId(ROLE_TEMPLATES[0].id);
    setCreated(null);
    setOpen(false);
  };

  const fmtExpires = (iso: string) => {
    const d = new Date(iso);
    const now = Date.now();
    const ms = d.getTime() - now;
    if (ms < 0) return "expired";
    const hrs = Math.floor(ms / 3600000);
    return hrs >= 24
      ? `in ${Math.floor(hrs / 24)}d ${hrs % 24}h`
      : `in ${hrs}h ${Math.floor((ms % 3600000) / 60000)}m`;
  };

  return (
    <AppShell
      title="Invites"
      count={invites.length}
      actions={
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#2F5CFF] hover:bg-[#2448D9] text-white rounded-md text-[13px] font-medium"
        >
          <Plus size={14} /> Create Invite
        </button>
      }
    >
      <div className="bg-white border border-[#E6E6EA] rounded-[10px] overflow-hidden">
        <div className="grid grid-cols-[2fr_1.4fr_2fr_1fr_1fr_1.2fr] gap-3 px-4 py-2.5 border-b border-[#E6E6EA] bg-[#F7F7F9] text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B5B64]">
          <div>Candidate</div>
          <div>Role</div>
          <div>Status</div>
          <div>Created</div>
          <div>Expires</div>
          <div>Actions</div>
        </div>
        {invites.map((inv) => (
          <div
            key={inv.id}
            className="grid grid-cols-[2fr_1.4fr_2fr_1fr_1fr_1.2fr] gap-3 px-4 py-3 border-b border-[#E6E6EA] last:border-b-0 items-center"
          >
            <div className="min-w-0">
              <div className="text-[13px] text-[#0B0B0D] truncate">{inv.candidateName}</div>
              <div className="text-[11px] text-[#5B5B64] truncate">{inv.candidateEmail}</div>
            </div>
            <div className="text-[12px]">
              <div className="text-[#0B0B0D]">{inv.roleTemplate.roleName}</div>
              <div className="text-[#5B5B64]">{inv.roleTemplate.track}</div>
            </div>
            <StatusStepper status={inv.status} />
            <div className="font-mono text-[11px] text-[#5B5B64]">{inv.createdAt}</div>
            <div className="font-mono text-[11px] text-[#5B5B64]">
              {inv.status === "PENDING" ? fmtExpires(inv.expiresAt) : inv.expiresAt.slice(0, 10)}
            </div>
            <div className="flex gap-2">
              {inv.status === "PENDING" && (
                <>
                  <button
                    onClick={() => copy(inv.link, inv.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-[#E6E6EA] rounded hover:bg-[#F7F7F9]"
                  >
                    {copiedId === inv.id ? (
                      <Check size={12} className="text-[#17C964]" />
                    ) : (
                      <Copy size={12} />
                    )}
                    {copiedId === inv.id ? "Copied" : "Copy link"}
                  </button>
                  <button
                    onClick={() => setConfirmRevoke(inv.id)}
                    className="inline-flex items-center px-2 py-1 text-[11px] border border-[#E6E6EA] rounded hover:bg-[#FDECEC] hover:text-[#9A2A2E] hover:border-[#F5C4C6]"
                  >
                    Revoke
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create slide-over */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={resetForm} />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[460px] bg-white shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-[#E6E6EA] flex items-center justify-between">
              <div>
                <div className="text-[16px] font-semibold text-[#0B0B0D]">
                  {created ? "Invite ready" : "Create invite"}
                </div>
                <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mt-0.5">
                  {created ? "share the link below" : "expires in 48 hours"}
                </div>
              </div>
              <button onClick={resetForm} className="p-1.5 hover:bg-[#EFF0F3] rounded">
                <X size={16} />
              </button>
            </div>

            {!created ? (
              <div className="p-6 flex-1 overflow-y-auto">
                <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
                  Candidate name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] mb-4 focus:outline-none focus:border-[#2F5CFF]"
                  placeholder="Jane Doe"
                />
                <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
                  Email
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  className="w-full border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] mb-4 focus:outline-none focus:border-[#2F5CFF]"
                  placeholder="jane@example.com"
                />
                <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
                  Role template
                </label>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-[#2F5CFF]"
                >
                  {ROLE_TEMPLATES.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.roleName} · {rt.track}
                    </option>
                  ))}
                </select>
                <button
                  onClick={submit}
                  disabled={!name || !email}
                  className="mt-6 w-full py-2.5 bg-[#2F5CFF] hover:bg-[#2448D9] disabled:bg-[#D6D7DC] disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-md"
                >
                  Generate invite link
                </button>
              </div>
            ) : (
              <div className="p-6 flex-1 overflow-y-auto">
                <div className="rounded-[10px] bg-[#0B0B0D] p-4 text-[#EDEDEF]">
                  <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#8B8B93] mb-2">
                    invite link
                  </div>
                  <div className="font-mono text-[12px] break-all text-[#EDEDEF] mb-3">
                    {created.link}
                  </div>
                  <button
                    onClick={() => copy(created.link, created.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2F5CFF] hover:bg-[#2448D9] text-white text-[12px] rounded"
                  >
                    {copiedId === created.id ? <Check size={13} /> : <Copy size={13} />}
                    {copiedId === created.id ? "Copied to clipboard" : "Copy link"}
                  </button>
                </div>
                <div className="mt-4 text-[12px] text-[#5B5B64]">
                  Invited <span className="text-[#0B0B0D]">{created.candidateName}</span> for{" "}
                  <span className="text-[#0B0B0D]">
                    {created.roleTemplate.roleName} · {created.roleTemplate.track}
                  </span>
                  . Expires {fmtExpires(created.expiresAt)}.
                </div>
                <button
                  onClick={resetForm}
                  className="mt-6 w-full py-2.5 border border-[#E6E6EA] text-[#0B0B0D] text-[13px] rounded-md hover:bg-[#F7F7F9]"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Revoke confirmation */}
      {confirmRevoke && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
          onClick={() => setConfirmRevoke(null)}
        >
          <div
            className="bg-white rounded-[10px] p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold text-[#0B0B0D] mb-2">Revoke this invite?</div>
            <div className="text-[13px] text-[#5B5B64] mb-5">
              The candidate will no longer be able to redeem the link. This can't be undone.
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmRevoke(null)}
                className="px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md hover:bg-[#F7F7F9]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  revokeInvite(confirmRevoke);
                  setConfirmRevoke(null);
                }}
                className="px-3 py-2 text-[13px] bg-[#E5484D] hover:bg-[#c33e42] text-white rounded-md"
              >
                Revoke invite
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
