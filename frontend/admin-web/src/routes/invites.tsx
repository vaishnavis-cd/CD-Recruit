import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Copy, Check, X, Plus, CalendarDays, RefreshCw, XCircle, ChevronDown, Search } from "lucide-react";
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
  const drives = useStore((s) => s.drives);
  const fetchInvites = useStore((s) => s.fetchInvites);
  const fetchDrives = useStore((s) => s.fetchDrives);
  const createInvite = useStore((s) => s.createInvite);
  const revokeInvite = useStore((s) => s.revokeInvite);
  const extendExpiry = useStore((s) => s.extendExpiry);
  const regenerateToken = useStore((s) => s.regenerateToken);
  const bulkRevoke = useStore((s) => s.bulkRevoke);
  const bulkResend = useStore((s) => s.bulkResend);

  const [open, setOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(ROLE_TEMPLATES[0].id);
  const [selectedDriveId, setSelectedDriveId] = useState<string>("");
  const [created, setCreated] = useState<Invite | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters State
  const [driveFilter, setDriveFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState("");

  // Bulk action state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Extend Modal State
  const [extendInviteId, setExtendInviteId] = useState<string | null>(null);
  const [extendExpiryDate, setExtendExpiryDate] = useState("");

  useEffect(() => {
    fetchDrives();
  }, []);

  useEffect(() => {
    fetchInvites({
      driveId: driveFilter !== "all" ? driveFilter : undefined,
      search: searchFilter || undefined,
    });
  }, [driveFilter, searchFilter]);

  const copy = async (link: string, id: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const submit = async () => {
    if (!name || !email || !selectedDriveId) return;
    const drive = drives.find((d) => d.id === selectedDriveId);
    if (!drive) return;
    try {
      const inv = await createInvite({
        candidateName: name,
        candidateEmail: email,
        roleTemplate: {
          id: drive.roleTemplateId,
          roleName: drive.roleTemplateName,
          track: "Mid",
        },
        driveId: selectedDriveId,
      });
      setCreated(inv);
    } catch (err: any) {
      alert(err.message || "Failed creating invite");
    }
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setRoleId(ROLE_TEMPLATES[0].id);
    setSelectedDriveId("");
    setCreated(null);
    setOpen(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === invites.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(invites.map((i) => i.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkRevoke = async () => {
    if (selectedIds.length === 0) return;
    if (confirm(`Are you sure you want to revoke ${selectedIds.length} invite(s)?`)) {
      await bulkRevoke(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleBulkResend = async () => {
    if (selectedIds.length === 0) return;
    await bulkResend(selectedIds);
    setSelectedIds([]);
  };

  const handleExtend = async () => {
    if (!extendInviteId) return;
    await extendExpiry(extendInviteId, new Date(extendExpiryDate).toISOString());
    setExtendInviteId(null);
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
      search={
        <div className="relative w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9CA5]" />
          <input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search candidate name or email…"
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF]"
          />
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          {/* Drive Filter */}
          <select
            value={driveFilter}
            onChange={(e) => setDriveFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] focus:outline-none"
          >
            <option value="all">All Drives</option>
            {drives.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#2F5CFF] hover:bg-[#2448D9] text-white rounded-md text-[13px] font-medium cursor-pointer shadow-sm"
          >
            <Plus size={14} /> Create Invite
          </button>
        </div>
      }
    >
      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <div className="mb-4 p-3 bg-[#EAF0FF] border border-[#B3C5FF] rounded-[10px] flex items-center justify-between animate-fade-in text-[13px]">
          <span className="font-medium text-[#15308F]">
            {selectedIds.length} candidate(s) selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkResend}
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium bg-white text-[#15308F] border border-[#B3C5FF] rounded hover:bg-[#F0F4FF] cursor-pointer"
            >
              <RefreshCw size={12} />
              Resend selected
            </button>
            <button
              onClick={handleBulkRevoke}
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium bg-[#FEF2F2] text-[#EF4444] border border-[#FCA5A5] rounded hover:bg-[#FEE2E2] cursor-pointer"
            >
              <XCircle size={12} />
              Revoke selected
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#E6E6EA] rounded-[10px] overflow-hidden">
        <div className="grid grid-cols-[0.3fr_2fr_1.4fr_2fr_1fr_1fr_1.5fr] gap-3 px-4 py-2.5 border-b border-[#E6E6EA] bg-[#F7F7F9] text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] items-center">
          <div>
            <input
              type="checkbox"
              checked={invites.length > 0 && selectedIds.length === invites.length}
              onChange={toggleSelectAll}
              className="w-3.5 h-3.5 text-[#2F5CFF] border-[#E6E6EA]"
            />
          </div>
          <div>Candidate</div>
          <div>Role</div>
          <div>Status</div>
          <div>Created</div>
          <div>Expires</div>
          <div className="text-right">Actions</div>
        </div>
        {invites.map((inv) => (
          <div
            key={inv.id}
            className="grid grid-cols-[0.3fr_2fr_1.4fr_2fr_1fr_1fr_1.5fr] gap-3 px-4 py-3 border-b border-[#E6E6EA] last:border-b-0 items-center"
          >
            <div>
              <input
                type="checkbox"
                checked={selectedIds.includes(inv.id)}
                onChange={() => toggleSelect(inv.id)}
                className="w-3.5 h-3.5 text-[#2F5CFF] border-[#E6E6EA]"
              />
            </div>
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
            <div className="flex gap-1.5 justify-end">
              {inv.status === "PENDING" && (
                <>
                  <button
                    onClick={() => copy(inv.link, inv.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] cursor-pointer"
                  >
                    {copiedId === inv.id ? (
                      <Check size={12} className="text-[#17C964]" />
                    ) : (
                      <Copy size={12} />
                    )}
                    {copiedId === inv.id ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={() => setConfirmRevoke(inv.id)}
                    className="p-1 border border-[#FEE2E2] bg-[#FEF2F2] text-[#EF4444] rounded hover:bg-[#FEE2E2] cursor-pointer"
                    title="Revoke Invite"
                  >
                    <XCircle size={12} />
                  </button>
                </>
              )}
              {(inv.status === "PENDING" || inv.status === "EXPIRED") && (
                <button
                  onClick={() => {
                    setExtendInviteId(inv.id);
                    setExtendExpiryDate(
                      new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 16),
                    );
                  }}
                  className="p-1 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] cursor-pointer"
                  title="Extend Expiry"
                >
                  <CalendarDays size={12} />
                </button>
              )}
              {inv.status !== "REDEEMED" && (
                <button
                  onClick={() => regenerateToken(inv.id)}
                  className="p-1 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] cursor-pointer"
                  title="Regenerate Token / Resend"
                >
                  <RefreshCw size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
        {invites.length === 0 && (
          <div className="p-8 text-center text-[13px] text-[#8B8B93]">No invitations found.</div>
        )}
      </div>

      {/* Create slide-over */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={resetForm} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[12px] w-full max-w-[480px] shadow-2xl flex flex-col max-h-[90vh]">
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
                <div className="p-6 flex-1 overflow-y-auto space-y-4">
                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
                      Target recruiting Drive
                    </label>
                    <select
                      value={selectedDriveId}
                      onChange={(e) => setSelectedDriveId(e.target.value)}
                      className="w-full border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-[#2F5CFF]"
                    >
                      <option value="">Select a Drive...</option>
                      {drives.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
                      Candidate name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                      placeholder="Jane Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
                      Email
                    </label>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      className="w-full border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                      placeholder="jane@example.com"
                    />
                  </div>

                  {selectedDriveId && (
                    <div>
                      <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5">
                        Role template (derived from Drive)
                      </label>
                      <div className="w-full border border-[#E6E6EA] rounded-md px-3 py-2 text-[13px] bg-[#F7F7F9] text-[#5B5B64]">
                        {drives.find((d) => d.id === selectedDriveId)?.roleTemplateName}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={submit}
                    disabled={!name || !email || !selectedDriveId}
                    className="mt-6 w-full py-2.5 bg-[#2F5CFF] hover:bg-[#2448D9] disabled:bg-[#D6D7DC] disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-md cursor-pointer"
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2F5CFF] hover:bg-[#2448D9] text-white text-[12px] rounded cursor-pointer"
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
                    className="mt-6 w-full py-2.5 border border-[#E6E6EA] text-[#0B0B0D] text-[13px] rounded-md hover:bg-[#F7F7F9] cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
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
            className="bg-white rounded-[10px] p-6 max-w-sm w-full shadow-2xl"
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
                className="px-3 py-2 text-[13px] bg-[#E5484D] hover:bg-[#c33e42] text-white rounded-md cursor-pointer"
              >
                Revoke invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Modal */}
      {extendInviteId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-[10px] w-full max-w-[400px] p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-[#0B0B0D]">Extend Invite Expiration</h3>
              <p className="text-[11px] text-[#8B8B93] mt-0.5">
                Select a new date and time for expiration:
              </p>
            </div>
            <div>
              <input
                type="datetime-local"
                value={extendExpiryDate}
                onChange={(e) => setExtendExpiryDate(e.target.value)}
                className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
              />
            </div>
            <div className="flex justify-end gap-2 text-[12px]">
              <button
                onClick={() => setExtendInviteId(null)}
                className="px-3 py-1.5 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9]"
              >
                Cancel
              </button>
              <button
                onClick={handleExtend}
                className="px-3.5 py-1.5 text-white bg-[#2F5CFF] rounded hover:bg-[#1E4DDF] cursor-pointer"
              >
                Save Extensions
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
