import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Copy,
  Check,
  X,
  Plus,
  CalendarDays,
  RefreshCw,
  XCircle,
  ChevronDown,
  Search,
  Eye,
  Trash2,
  Upload,
  ShieldCheck,
  AlertCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { BulkActionBar } from "../components/ui/bulk-action-bar";
import { useStore } from "../lib/store";
import { type Invite } from "../lib/types";
import { formatDriveName } from "../lib/utils";

export const Route = createFileRoute("/invites")({
  component: InvitesPage,
  head: () => ({
    meta: [
      { title: "Invites — Proctora" },
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
  const uploadIdProofAction = useStore((s) => s.uploadIdProof);
  const revokeInvite = useStore((s) => s.revokeInvite);
  const deleteInvite = useStore((s) => s.deleteInvite);
  const extendExpiry = useStore((s) => s.extendExpiry);
  const regenerateToken = useStore((s) => s.regenerateToken);
  const bulkRevoke = useStore((s) => s.bulkRevoke);
  const bulkDelete = useStore((s) => s.bulkDelete);
  const bulkResend = useStore((s) => s.bulkResend);

  const [open, setOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState<Invite | null>(null);
  const [confirmBulkRevoke, setConfirmBulkRevoke] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedDriveId, setSelectedDriveId] = useState<string>("");
  const [created, setCreated] = useState<Invite | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ID Proof Upload State for Creation Modal
  const [idProofFile, setIdProofFile] = useState<File | null>(null);
  const [idProofError, setIdProofError] = useState<string | null>(null);
  const [uploadingIdProof, setUploadingIdProof] = useState(false);
  const [idProofStatus, setIdProofStatus] = useState<{ success: boolean; error?: string } | null>(null);

  // Direct ID Proof Upload Modal state (for existing table rows)
  const [directUploadInvite, setDirectUploadInvite] = useState<Invite | null>(null);
  const [directFile, setDirectFile] = useState<File | null>(null);
  const [directError, setDirectError] = useState<string | null>(null);
  const [directUploading, setDirectUploading] = useState(false);

  const [driveFilter, setDriveFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const invitesTotal = useStore((s) => s.invitesTotal);
  const invitesTotalPages = useStore((s) => s.invitesTotalPages);

  // Bulk action state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Extend Modal State
  const [extendInviteId, setExtendInviteId] = useState<string | null>(null);
  const [extendExpiryDate, setExtendExpiryDate] = useState("");

  useEffect(() => {
    fetchDrives();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [driveFilter, searchFilter]);

  useEffect(() => {
    fetchInvites({
      driveId: driveFilter !== "all" ? driveFilter : undefined,
      search: searchFilter || undefined,
      page,
      pageSize,
    });
  }, [driveFilter, searchFilter, page, pageSize]);

  const copy = async (link: string, id: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIdProofError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setIdProofFile(null);
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setIdProofError("Please select a JPG, PNG, or WEBP image.");
      setIdProofFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setIdProofError("File size must be under 5MB.");
      setIdProofFile(null);
      return;
    }
    setIdProofFile(file);
  };

  const handleDirectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDirectError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setDirectFile(null);
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setDirectError("Please select a JPG, PNG, or WEBP image.");
      setDirectFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setDirectError("File size must be under 5MB.");
      setDirectFile(null);
      return;
    }
    setDirectFile(file);
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

      if (idProofFile) {
        setUploadingIdProof(true);
        try {
          await uploadIdProofAction(inv.id, idProofFile);
          setIdProofStatus({ success: true });
          toast.success("ID proof uploaded and enrolled!");
        } catch (err: any) {
          const errMsg = err.message || "Failed to enroll ID proof";
          setIdProofStatus({ success: false, error: errMsg });
          toast.error(`Invite created, but ID proof failed: ${errMsg}`);
        } finally {
          setUploadingIdProof(false);
        }
      }

      setCreated(inv);
    } catch (err: any) {
      toast.error(err.message || "Failed creating invite");
    }
  };

  const retryModalUpload = async () => {
    if (!created || !idProofFile) return;
    setUploadingIdProof(true);
    try {
      await uploadIdProofAction(created.id, idProofFile);
      setIdProofStatus({ success: true });
      toast.success("ID proof enrolled successfully!");
    } catch (err: any) {
      const errMsg = err.message || "Failed to enroll ID proof";
      setIdProofStatus({ success: false, error: errMsg });
      toast.error(`ID proof retry failed: ${errMsg}`);
    } finally {
      setUploadingIdProof(false);
    }
  };

  const submitDirectUpload = async () => {
    if (!directUploadInvite || !directFile) return;
    setDirectUploading(true);
    setDirectError(null);
    try {
      await uploadIdProofAction(directUploadInvite.id, directFile);
      toast.success("ID proof uploaded and enrolled!");
      setDirectUploadInvite(null);
      setDirectFile(null);
    } catch (err: any) {
      setDirectError(err.message || "Failed to upload ID proof");
      toast.error(err.message || "Failed to upload ID proof");
    } finally {
      setDirectUploading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setSelectedDriveId("");
    setIdProofFile(null);
    setIdProofError(null);
    setIdProofStatus(null);
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
    setConfirmBulkRevoke(true);
  };

  const confirmBulkRevokeAction = async () => {
    await bulkRevoke(selectedIds);
    setSelectedIds([]);
    setConfirmBulkRevoke(false);
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

  const handleDeleteSingle = async () => {
    if (!confirmDeleteInvite) return;
    try {
      await deleteInvite(confirmDeleteInvite.id);
      toast.success(`Deleted invite for ${confirmDeleteInvite.candidateName}`);
      setConfirmDeleteInvite(null);
    } catch (err: any) {
      toast.error("Failed to delete invite: " + (err.message || err));
    }
  };

  const handleBulkDeleteAction = async () => {
    try {
      await bulkDelete(selectedIds);
      toast.success(`Deleted ${selectedIds.length} invite(s)`);
      setSelectedIds([]);
      setConfirmBulkDelete(false);
    } catch (err: any) {
      toast.error("Failed to bulk delete invites: " + (err.message || err));
    }
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
          <select
            value={driveFilter}
            onChange={(e) => setDriveFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] focus:outline-none"
          >
            <option value="all">All Drives</option>
            {drives.map((d) => (
              <option key={d.id} value={d.id}>
                {formatDriveName(d.name)}
              </option>
            ))}
          </select>

          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#2F5CFF] hover:bg-[#0037FF] text-white rounded-md text-[13px] font-medium cursor-pointer shadow-sm transition-colors"
          >
            <Plus size={14} /> Create Invite
          </button>
        </div>
      }
    >
      {/* Bulk actions bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        itemLabel="candidate(s)"
        actions={[
          { label: "Resend selected", icon: <RefreshCw size={12} />, onClick: handleBulkResend },
          { label: "Revoke selected", icon: <XCircle size={12} />, variant: "danger", onClick: handleBulkRevoke },
          { label: "Delete selected", icon: <Trash2 size={12} />, variant: "danger", onClick: () => setConfirmBulkDelete(true) },
        ]}
        onClearSelection={() => setSelectedIds([])}
      />

      <div className="bg-white border border-line rounded-xl overflow-hidden shadow-xs">
        <div className="grid grid-cols-[0.3fr_2.2fr_1.6fr_2fr_1.1fr_1.1fr_1.6fr] gap-3 px-4 py-2.5 border-b border-line bg-canvas text-2xs font-mono uppercase tracking-wider text-ink-secondary items-center">
          <div>
            <input
              type="checkbox"
              checked={invites.length > 0 && selectedIds.length === invites.length}
              onChange={toggleSelectAll}
              className="w-3.5 h-3.5 text-brand border-line rounded"
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
            className="grid grid-cols-[0.3fr_2.2fr_1.6fr_2fr_1.1fr_1.1fr_1.6fr] gap-3 px-4 py-3 border-b border-line last:border-b-0 hover:bg-canvas/50 transition-colors items-center"
          >
            <div>
              <input
                type="checkbox"
                checked={selectedIds.includes(inv.id)}
                onChange={() => toggleSelect(inv.id)}
                className="w-3.5 h-3.5 text-brand border-line rounded"
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink truncate">{inv.candidateName}</div>
              <div className="text-xs text-ink-secondary truncate">{inv.candidateEmail}</div>
            </div>
            <div className="text-xs">
              <div className="text-ink font-medium">{inv.roleTemplate.roleName}</div>
              <div className="text-ink-tertiary">{inv.roleTemplate.track}</div>
            </div>
            <StatusStepper status={inv.status} />
            <div className="font-mono text-xs text-ink-secondary">{inv.createdAt}</div>
            <div className="font-mono text-xs text-ink-secondary">
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
              {inv.sessionId && (
                <Link
                  to="/results/$id"
                  params={{ id: inv.sessionId }}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-[#EAF0FF] text-[#2F5CFF] border border-[#B3C5FF] rounded hover:bg-[#D6E4FF] cursor-pointer"
                  title="View Candidate Results"
                >
                  <Eye size={11} /> Results
                </Link>
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
              <button
                onClick={() => setConfirmDeleteInvite(inv)}
                className="p-1 border border-red-200 bg-red-50 text-red-600 rounded hover:bg-red-100 cursor-pointer"
                title="Delete Invite"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {invites.length === 0 && (
          <div className="p-8 text-center text-[13px] text-[#8B8B93]">No invitations found.</div>
        )}

        {/* Pagination Bar */}
        <div className="px-4 py-3 bg-[#F7F7F9] border-t border-[#E6E6EA] flex flex-wrap items-center justify-between gap-3 text-xs text-[#5B5B64]">
          <div className="flex items-center gap-3">
            <span>
              Showing{" "}
              <strong className="text-[#0B0B0D]">
                {invitesTotal === 0 ? 0 : (page - 1) * pageSize + 1}
              </strong>{" "}
              to{" "}
              <strong className="text-[#0B0B0D]">
                {Math.min(page * pageSize, invitesTotal)}
              </strong>{" "}
              of <strong className="text-[#0B0B0D]">{invitesTotal}</strong> candidates
            </span>

            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[11px] text-[#8B8B93]">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 text-xs font-medium border border-[#E6E6EA] rounded-md bg-white text-[#0B0B0D] focus:outline-none focus:border-[#2F5CFF] cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="p-1.5 rounded-md border border-[#E6E6EA] bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="First Page"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-md border border-[#E6E6EA] bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft size={14} />
            </button>

            <span className="px-2 text-xs font-semibold text-[#0B0B0D]">
              Page {page} of {Math.max(1, invitesTotalPages)}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(invitesTotalPages, p + 1))}
              disabled={page >= invitesTotalPages}
              className="p-1.5 rounded-md border border-[#E6E6EA] bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Next Page"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setPage(invitesTotalPages)}
              disabled={page >= invitesTotalPages}
              className="p-1.5 rounded-md border border-[#E6E6EA] bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Last Page"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Direct ID Proof Upload Modal */}
      {directUploadInvite && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            setDirectUploadInvite(null);
            setDirectFile(null);
            setDirectError(null);
          }}
        >
          <div
            className="bg-white rounded-[12px] max-w-md w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
              <div className="text-[15px] font-semibold text-[#0B0B0D]">
                Upload ID Proof for {directUploadInvite.candidateName}
              </div>
              <button
                onClick={() => {
                  setDirectUploadInvite(null);
                  setDirectFile(null);
                  setDirectError(null);
                }}
                className="p-1 hover:bg-[#EFF0F3] rounded cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="text-[12px] text-[#5B5B64]">
              Select a clear face photo from the candidate's ID proof (JPG, PNG, WEBP &lt; 5MB). ArcFace / RetinaFace will automatically extract the face embedding vector.
            </div>
            <div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleDirectFileChange}
                className="w-full border border-[#E6E6EA] rounded-md px-3 py-2 text-[12px] bg-white cursor-pointer file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:font-medium file:bg-[#EFF0F3] file:text-[#0B0B0D]"
              />
              {directError && (
                <div className="text-[11px] text-[#E5484D] mt-1.5 flex items-center gap-1">
                  <AlertCircle size={13} /> {directError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setDirectUploadInvite(null);
                  setDirectFile(null);
                  setDirectError(null);
                }}
                className="px-3 py-2 text-[12px] border border-[#E6E6EA] rounded-md hover:bg-[#F7F7F9] cursor-pointer text-[#5B5B64]"
              >
                Cancel
              </button>
              <button
                onClick={submitDirectUpload}
                disabled={!directFile || directUploading}
                className="px-4 py-2 text-[12px] font-medium bg-[#2F5CFF] hover:bg-[#0037FF] disabled:bg-[#D6D7DC] disabled:cursor-not-allowed text-white rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                {directUploading && <RefreshCw size={13} className="animate-spin" />}
                {directUploading ? "Enrolling face..." : "Upload & Enroll"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                          {formatDriveName(d.name)}
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

                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-[#5B5B64] mb-1.5 flex items-center justify-between">
                      <span>Upload ID Proof (Optional)</span>
                      <span className="text-[10px] text-[#8B8B93] lowercase font-normal">jpg, png, webp &lt;5mb</span>
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="w-full border border-[#E6E6EA] rounded-md px-3 py-2 text-[12px] text-[#0B0B0D] bg-white file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:font-medium file:bg-[#EFF0F3] file:text-[#0B0B0D] hover:file:bg-[#E6E6EA] cursor-pointer"
                    />
                    {idProofError && (
                      <div className="text-[11px] text-[#E5484D] mt-1 flex items-center gap-1">
                        <AlertCircle size={12} /> {idProofError}
                      </div>
                    )}
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
                    disabled={!name || !email || !selectedDriveId || uploadingIdProof}
                    className="mt-6 w-full py-2.5 bg-[#2F5CFF] hover:bg-[#0037FF] disabled:bg-[#D6D7DC] disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-md cursor-pointer transition-colors flex items-center justify-center gap-2"
                  >
                    {uploadingIdProof && <RefreshCw size={14} className="animate-spin" />}
                    {uploadingIdProof ? "Enrolling ID proof..." : "Generate invite link"}
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2F5CFF] hover:bg-[#0037FF] text-white text-[12px] rounded cursor-pointer transition-colors"
                    >
                      {copiedId === created.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedId === created.id ? "Copied to clipboard" : "Copy link"}
                    </button>
                  </div>

                  {idProofFile && (
                    <div className="mt-4">
                      {uploadingIdProof ? (
                        <div className="p-3 rounded-md bg-[#EFF0F3] text-[12px] text-[#5B5B64] flex items-center gap-2">
                          <RefreshCw size={14} className="animate-spin text-[#2F5CFF]" />
                          Processing ArcFace facial embedding...
                        </div>
                      ) : idProofStatus?.success ? (
                        <div className="p-3 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-700 text-[12px] flex items-center gap-2">
                          <ShieldCheck size={16} /> ID proof enrolled successfully
                        </div>
                      ) : idProofStatus?.success === false ? (
                        <div className="p-3.5 rounded-md bg-rose-50 border border-[#E5484D]/30 text-[#E5484D] text-[12px] space-y-2">
                          <div className="font-semibold flex items-center gap-1.5">
                            <XCircle size={15} /> ID proof upload failed
                          </div>
                          <div>{idProofStatus.error}</div>
                          <div className="text-[11px] text-[#5B5B64]">
                            Invite created successfully, but ID proof failed. You can retry below or from the invites table.
                          </div>
                          <button
                            onClick={retryModalUpload}
                            disabled={uploadingIdProof}
                            className="mt-1 px-3 py-1.5 bg-[#E5484D] hover:bg-[#c33e42] text-white text-[11px] font-medium rounded flex items-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw size={12} className={uploadingIdProof ? "animate-spin" : ""} />
                            Retry ID Proof Upload
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}

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
                className="px-3 py-2 text-[13px] border border-[#E6E6EA] rounded-md hover:bg-[#F7F7F9] text-[#5B5B64]"
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
                className="px-3.5 py-1.5 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64]"
              >
                Cancel
              </button>
              <button
                onClick={handleExtend}
                className="px-3.5 py-1.5 text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] cursor-pointer transition-colors"
              >
                Save Extensions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Revoke Confirmation Modal */}
      {confirmBulkRevoke && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#E6E6EA] pb-3">
              <div className="p-2 bg-red-50 text-red-500 rounded-full">
                <XCircle size={18} />
              </div>
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Revoke Multiple Invites?</h3>
            </div>
            
            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to revoke <span className="font-semibold text-[#0B0B0D]">{selectedIds.length} invite(s)</span>? The invite links will no longer be valid and the candidates will not be able to access the assessment.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-[13px]">
              <button
                onClick={() => setConfirmBulkRevoke(false)}
                className="px-3.5 py-2 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkRevokeAction}
                className="px-4 py-2 text-white bg-red-500 hover:bg-red-600 font-semibold cursor-pointer shadow-sm transition-colors rounded"
              >
                Revoke {selectedIds.length} Invite(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Delete Confirmation Modal */}
      {confirmDeleteInvite && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#E6E6EA] pb-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-full">
                <Trash2 size={18} />
              </div>
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Delete Invite?</h3>
            </div>

            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to permanently delete the invite for{" "}
              <span className="font-semibold text-[#0B0B0D]">{confirmDeleteInvite.candidateName}</span> ({confirmDeleteInvite.candidateEmail})?
              This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-[13px]">
              <button
                onClick={() => setConfirmDeleteInvite(null)}
                className="px-3.5 py-2 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSingle}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 font-semibold cursor-pointer shadow-sm transition-colors rounded"
              >
                Delete Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#E6E6EA] pb-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-full">
                <Trash2 size={18} />
              </div>
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Delete Multiple Invites?</h3>
            </div>

            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to permanently delete <span className="font-semibold text-[#0B0B0D]">{selectedIds.length} invite(s)</span>?
              All selected invitation records will be deleted permanently.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-[13px]">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="px-3.5 py-2 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteAction}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 font-semibold cursor-pointer shadow-sm transition-colors rounded"
              >
                Delete {selectedIds.length} Invite(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
