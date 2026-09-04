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

const STEPS = ["SENT", "OPENED", "REDEEMED"] as const;

function StatusStepper({ status }: { status: Invite["status"] }) {
  const terminal = status === "EXPIRED" || status === "REVOKED";
  const activeIdx = status === "REDEEMED" ? 2 : status === "PENDING" ? 0 : terminal ? -1 : 0;

  if (terminal) {
    return (
      <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
        {status}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0 max-w-full">
      {STEPS.map((s, i) => {
        const done = i <= activeIdx;
        return (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <span
              className={`inline-block w-[5px] h-[5px] rounded-full shrink-0 ${
                done ? "bg-[#2563EB]" : "bg-[#CBD5E1]"
              }`}
            />
            <span
              style={{
                fontFamily: "Instrument Sans, sans-serif",
                fontWeight: done ? 700 : 500,
                fontSize: "11px",
                lineHeight: "100%",
                letterSpacing: "0.02em",
                color: done ? "#2563EB" : "#94A3B8",
                textTransform: "uppercase",
              }}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={`inline-block w-3 h-[1.5px] shrink-0 ${
                  done && i < activeIdx ? "bg-[#2563EB]" : "bg-[#CBD5E1]"
                }`}
              />
            )}
          </div>
        );
      })}
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
  const [driveDropdownOpen, setDriveDropdownOpen] = useState(false);
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
    <AppShell hideHeader={true}>
      <div
        className="w-full max-w-[1269px] min-h-[944px] flex flex-col mx-auto opacity-100 rotate-0 transition-opacity gap-6"
        style={{
          maxWidth: "1269px",
          minHeight: "944px",
          opacity: 1,
          transform: "rotate(0deg)",
        }}
      >
        {/* TopBar (1269x49) */}
        <div
          className="relative z-30 w-full max-w-[1269px] h-[49px] flex items-center justify-between opacity-100 rotate-0 shrink-0"
          style={{
            height: "49px",
            justifyContent: "space-between",
            transform: "rotate(0deg)",
            opacity: 1,
          }}
        >
          {/* Header Title Section: Invites */}
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-[#0d1424]">Invites</h1>
          </div>

          {/* Header Actions Container (606x34, gap 16px) */}
          <div
            className="w-[606px] h-[34px] gap-[16px] flex items-center shrink-0 opacity-100 rotate-0"
            style={{
              width: "606px",
              height: "34px",
              gap: "16px",
              transform: "rotate(0deg)",
              opacity: 1,
            }}
          >
            {/* Search Bar Container (280x32, rounded-99px) */}
            <div
              className="w-[280px] h-[32px] pt-[8px] pb-[8px] px-[16px] gap-[8px] rounded-[99px] flex items-center shrink-0 opacity-100 rotate-0 shadow-xs"
              style={{
                width: "280px",
                height: "32px",
                paddingTop: "8px",
                paddingBottom: "8px",
                paddingLeft: "16px",
                paddingRight: "16px",
                gap: "8px",
                borderRadius: "99px",
                border: "1px solid #D5DAEC",
                background: "#FFFFFF",
                transform: "rotate(0deg)",
                opacity: 1,
              }}
            >
              <Search
                size={14}
                className="w-[14px] h-[14px] text-[#94a3b8] shrink-0 opacity-100 rotate-0"
                style={{
                  width: "14px",
                  height: "14px",
                  transform: "rotate(0deg)",
                  opacity: 1,
                }}
              />
              <input
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search candidate name or email..."
                className="w-[226px] h-[16px] text-xs bg-transparent border-none text-[#0d1424] placeholder:text-[#9CA3AF] focus:outline-none p-0 leading-none opacity-100 rotate-0"
                style={{
                  width: "226px",
                  height: "16px",
                  fontFamily: "Instrument Sans, sans-serif",
                  fontWeight: 400,
                  fontSize: "13px",
                  transform: "rotate(0deg)",
                  opacity: 1,
                }}
              />
            </div>

            {/* All Drives Dropdown (160x32, rounded-16px) */}
            <div className="relative z-50 shrink-0">
              <button
                type="button"
                onClick={() => setDriveDropdownOpen(!driveDropdownOpen)}
                className="w-[160px] h-[32px] pt-[8px] pb-[8px] px-[16px] rounded-[16px] flex items-center justify-between cursor-pointer opacity-100 rotate-0 shadow-xs hover:border-[#2E5DE0] transition-colors"
                style={{
                  width: "160px",
                  height: "32px",
                  paddingTop: "8px",
                  paddingBottom: "8px",
                  paddingLeft: "16px",
                  paddingRight: "16px",
                  justifyContent: "space-between",
                  borderRadius: "16px",
                  border: "1px solid #D5DAEC",
                  background: "#FFFFFF",
                  transform: "rotate(0deg)",
                  opacity: 1,
                }}
              >
                <span
                  className="truncate"
                  style={{
                    maxWidth: "110px",
                    fontFamily: "Instrument Sans, sans-serif",
                    fontWeight: 400,
                    fontSize: "13px",
                    lineHeight: "100%",
                    letterSpacing: "0%",
                    color: "#6B7280",
                    transform: "rotate(0deg)",
                    opacity: 1,
                  }}
                >
                  {driveFilter === "all"
                    ? "All Drives"
                    : drives.find((d) => d.id === driveFilter)
                    ? formatDriveName(drives.find((d) => d.id === driveFilter)!.name)
                    : "All Drives"}
                </span>
                <ChevronDown
                  size={12}
                  className={`w-[12px] h-[12px] text-[#6B7280] transition-transform duration-150 shrink-0 ${
                    driveDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {driveDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[90]"
                    onClick={() => setDriveDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-[38px] z-[100] w-[200px] max-h-[260px] overflow-y-auto bg-white border border-[#D5DAEC] rounded-xl shadow-2xl py-1">
                    <button
                      onClick={() => {
                        setDriveFilter("all");
                        setDriveDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between ${
                        driveFilter === "all"
                          ? "bg-[#eff6ff] text-[#2E5DE0] font-semibold"
                          : "text-[#6B7280] hover:bg-slate-50 font-medium"
                      }`}
                    >
                      <span>All Drives</span>
                    </button>
                    {drives.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => {
                          setDriveFilter(d.id);
                          setDriveDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between ${
                          driveFilter === d.id
                            ? "bg-[#eff6ff] text-[#2E5DE0] font-semibold"
                            : "text-[#6B7280] hover:bg-slate-50 font-medium"
                        }`}
                      >
                        <span className="truncate">{formatDriveName(d.name)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Create Invite Button (134x34, rounded-24px) */}
            <button
              onClick={() => setOpen(true)}
              className="w-[134px] h-[34px] pt-[9px] pb-[9px] px-[18px] gap-[7px] text-white text-xs font-semibold rounded-[24px] flex items-center justify-center cursor-pointer shrink-0 opacity-100 rotate-0 transition-none"
              style={{
                width: "134px",
                height: "34px",
                paddingTop: "9px",
                paddingBottom: "9px",
                paddingLeft: "18px",
                paddingRight: "18px",
                gap: "7px",
                borderRadius: "24px",
                transform: "rotate(0deg)",
                opacity: 1,
                background: "linear-gradient(135deg, #3A91ED 0%, #2E5DE0 100%)",
                boxShadow: "0px 4px 14px 0px #2E5DE0BF",
                animationDuration: "0ms",
              }}
            >
              <Plus size={14} className="shrink-0" />
              <span>Create Invite</span>
            </button>
          </div>
        </div>

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

        {/* Table Card (1269px, rounded-16px, shadow) */}
        <div
          className="w-full max-w-[1269px] rounded-[16px] bg-white overflow-hidden shadow-[-4px_4px_15px_0px_rgba(156,163,175,0.2)] border border-[#EDE9FE]"
          style={{
            transform: "rotate(0deg)",
            opacity: 1,
          }}
        >
          {/* Table Header (bg-#F8FAFC across 100% width, border-bottom 1px solid #EDE9FE) */}
          <div
            className="w-full h-[40px] px-5 py-3 bg-[#F8FAFC] border-b border-[#EDE9FE] grid grid-cols-[30px_minmax(140px,1.6fr)_minmax(120px,1.2fr)_75px_240px_95px_95px_50px] gap-2 items-center text-[11px] font-bold text-[#6B7280] tracking-wider uppercase opacity-100 rotate-0"
            style={{
              fontFamily: "Instrument Sans, sans-serif",
            }}
          >
            <div>
              <input
                type="checkbox"
                checked={invites.length > 0 && selectedIds.length === invites.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-[#2E5DE0] border-[#D5DAEC] rounded cursor-pointer"
              />
            </div>
            <div>CANDIDATE</div>
            <div>ROLE</div>
            <div>SOURCE</div>
            <div>STATUS</div>
            <div>CREATED</div>
            <div>EXPIRES</div>
            <div className="text-center">ACTIONS</div>
          </div>

          {/* Table Body */}
          <div className="w-full divide-y divide-[#EDE9FE]">
            {invites.map((inv) => {
              const isPartner =
                (inv as any).originChannel === "PARTNER_API" ||
                (inv as any).source === "PARTNER_API";
              return (
                <div
                  key={inv.id}
                  className="w-full h-[66px] px-5 grid grid-cols-[30px_minmax(140px,1.6fr)_minmax(120px,1.2fr)_75px_240px_95px_95px_50px] gap-2 items-center hover:bg-slate-50/70 transition-colors opacity-100 rotate-0"
                >
                  {/* Checkbox */}
                  <div>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(inv.id)}
                      onChange={() => toggleSelect(inv.id)}
                      className="w-4 h-4 text-[#2E5DE0] border-[#D5DAEC] rounded cursor-pointer"
                    />
                  </div>

                  {/* Candidate (col-candidate - 327px) */}
                  <div className="min-w-0 pr-2">
                    <div
                      className="truncate text-[14px] font-semibold text-[#1E1B4B]"
                      style={{ fontFamily: "Instrument Sans, sans-serif" }}
                    >
                      {inv.candidateName}
                    </div>
                    <div
                      className="truncate text-[12px] font-normal text-[#6B7280]"
                      style={{ fontFamily: "Instrument Sans, sans-serif" }}
                    >
                      {inv.candidateEmail}
                    </div>
                  </div>

                  {/* Role (col-role) */}
                  <div className="min-w-0 pr-2">
                    <div
                      className="truncate text-[13px] font-semibold text-[#1E1B4B]"
                      style={{ fontFamily: "Instrument Sans, sans-serif" }}
                    >
                      {inv.roleTemplate?.roleName || "Software Developer"}
                    </div>
                    <div
                      className="truncate text-[11px] font-normal text-[#6B7280]"
                      style={{ fontFamily: "Instrument Sans, sans-serif" }}
                    >
                      {inv.roleTemplate?.track || "Mid"}
                    </div>
                  </div>

                  {/* Source (col-source - 110px) */}
                  <div>
                    <div
                      className="h-[18px] px-[8px] py-[3px] rounded-[9px] inline-flex items-center justify-center opacity-100 rotate-0"
                      style={{
                        background: isPartner ? "#EDE9FE" : "#F3F4F6",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "Instrument Sans, sans-serif",
                          fontWeight: 700,
                          fontSize: "10px",
                          lineHeight: "100%",
                          letterSpacing: "0%",
                          color: isPartner ? "#8B5CF6" : "#6B7280",
                          textTransform: "uppercase",
                        }}
                      >
                        {isPartner ? "PARTNER API" : "DIRECT"}
                      </span>
                    </div>
                  </div>

                  {/* Status (col-status - 280px) */}
                  <div>
                    <StatusStepper status={inv.status} />
                  </div>

                  {/* Created */}
                  <div
                    className="text-[13px] text-[#475569] whitespace-nowrap"
                    style={{ fontFamily: "Instrument Sans, sans-serif" }}
                  >
                    {inv.createdAt.slice(0, 10)}
                  </div>

                  {/* Expires */}
                  <div
                    className="text-[13px] text-[#475569] whitespace-nowrap"
                    style={{ fontFamily: "Instrument Sans, sans-serif" }}
                  >
                    {inv.expiresAt.slice(0, 10)}
                  </div>

                  {/* Actions (col-actions - 45px) */}
                  <div className="flex items-center justify-center gap-1.5">
                    {inv.status === "PENDING" && (
                      <button
                        onClick={() => copy(inv.link, inv.id)}
                        title="Copy Link"
                        className="p-1.5 text-[#9CA3AF] hover:text-[#2E5DE0] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      >
                        {copiedId === inv.id ? (
                          <Check size={13} className="text-emerald-600" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    )}
                    {inv.sessionId && (
                      <Link
                        to="/results/$id"
                        params={{ id: inv.sessionId }}
                        className="p-1.5 text-[#2E5DE0] hover:bg-blue-50 rounded-lg transition-colors"
                        title="View Candidate Results"
                      >
                        <Eye size={13} />
                      </Link>
                    )}
                    <button
                      onClick={() => setConfirmDeleteInvite(inv)}
                      title="Delete Invite"
                      className="w-[30px] h-[30px] p-[8px] rounded-[15px] border border-[#E9EEFE] bg-white flex items-center justify-center text-[#9CA3AF] hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all cursor-pointer shrink-0 opacity-100 rotate-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
            {invites.length === 0 && (
              <div className="p-8 text-center text-sm-minus text-ink-tertiary">
                No invitations found.
              </div>
            )}
          </div>

        {/* Pagination Bar */}
        <div className="px-4 py-3 bg-canvas border-t border-line flex flex-wrap items-center justify-between gap-3 text-xs text-ink-secondary">
          <div className="flex items-center gap-3">
            <span>
              Showing{" "}
              <strong className="text-ink">
                {invitesTotal === 0 ? 0 : (page - 1) * pageSize + 1}
              </strong>{" "}
              to{" "}
              <strong className="text-ink">
                {Math.min(page * pageSize, invitesTotal)}
              </strong>{" "}
              of <strong className="text-ink">{invitesTotal}</strong> candidates
            </span>

            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-xs-plus text-ink-tertiary">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 text-xs font-medium border border-line rounded-md bg-white text-ink focus:outline-none focus:border-brand cursor-pointer"
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
              className="p-1.5 rounded-md border border-line bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="First Page"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-md border border-line bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft size={14} />
            </button>

            <span className="px-2 text-xs font-semibold text-ink">
              Page {page} of {Math.max(1, invitesTotalPages)}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(invitesTotalPages, p + 1))}
              disabled={page >= invitesTotalPages}
              className="p-1.5 rounded-md border border-line bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Next Page"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setPage(invitesTotalPages)}
              disabled={page >= invitesTotalPages}
              className="p-1.5 rounded-md border border-line bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Last Page"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
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
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="text-md font-semibold text-ink">
                Upload ID Proof for {directUploadInvite.candidateName}
              </div>
              <button
                onClick={() => {
                  setDirectUploadInvite(null);
                  setDirectFile(null);
                  setDirectError(null);
                }}
                className="p-1 hover:bg-surface-inset rounded cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="text-xs text-ink-secondary">
              Select a clear face photo from the candidate's ID proof (JPG, PNG, WEBP &lt; 5MB). ArcFace / RetinaFace will automatically extract the face embedding vector.
            </div>
            <div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleDirectFileChange}
                className="w-full border border-line rounded-md px-3 py-2 text-xs bg-white cursor-pointer file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs-plus file:font-medium file:bg-surface-inset file:text-ink"
              />
              {directError && (
                <div className="text-xs-plus text-danger mt-1.5 flex items-center gap-1">
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
                className="px-3 py-2 text-xs border border-line rounded-md hover:bg-canvas cursor-pointer text-ink-secondary"
              >
                Cancel
              </button>
              <button
                onClick={submitDirectUpload}
                disabled={!directFile || directUploading}
                className="px-4 py-2 text-xs font-medium bg-brand hover:bg-brand-hover disabled:bg-line-strong disabled:cursor-not-allowed text-white rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                {directUploading && <RefreshCw size={13} className="animate-spin" />}
                {directUploading ? "Enrolling face..." : "Upload & Enroll"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Invite Modal (matching ModalContainer.svg) */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          style={{ fontFamily: "Instrument Sans, sans-serif" }}
          onClick={resetForm}
        >
          <div
            className="bg-white rounded-[16px] w-full max-w-[520px] shadow-[0px_20px_60px_0px_rgba(0,0,0,0.18)] p-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Title + Subtitle + Close Icon */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[20px] font-bold text-[#1E1B4B] leading-tight">
                  {created ? "Invite ready" : "Create invite"}
                </h3>
                <p className="text-[11px] font-bold text-[#64748B] tracking-[0.14em] uppercase mt-1">
                  {created ? "SHARE THE LINK BELOW" : "EXPIRES IN 48 HOURS"}
                </p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="w-7 h-7 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer shrink-0"
                title="Close"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9.66736 5.66704L5.66704 9.66736M5.66704 5.66704L9.66736 9.66736M14.3344 7.6672C14.3344 11.3494 11.3494 14.3344 7.6672 14.3344C3.98501 14.3344 1 11.3494 1 7.6672C1 3.98501 3.98501 1 7.6672 1C11.3494 1 14.3344 3.98501 14.3344 7.6672Z" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-[#E2E8F0] my-5" />

            {!created ? (
              <div className="space-y-4">
                {/* Field 1: Target Recruiting Drive */}
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-[0.05em] mb-2">
                    TARGET RECRUITING DRIVE
                  </label>
                  <div className="relative">
                    <select
                      value={selectedDriveId}
                      onChange={(e) => setSelectedDriveId(e.target.value)}
                      className="w-full h-[42px] rounded-[8px] border border-[#CBD5E1] bg-white pl-3.5 pr-10 text-[13.5px] text-[#1E1B4B] focus:outline-none focus:border-[#2E5DE0] transition-colors cursor-pointer"
                      style={{
                        appearance: "none",
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                        backgroundImage: "none",
                      }}
                    >
                      <option value="">Select a Drive...</option>
                      {drives.map((d) => (
                        <option key={d.id} value={d.id}>
                          {formatDriveName(d.name)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" strokeWidth={2} />
                  </div>
                </div>

                {/* Field 2: Candidate Name */}
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-[0.05em] mb-2">
                    CANDIDATE NAME
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-[42px] rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 text-[13.5px] text-[#1E1B4B] placeholder:text-[#64748B] focus:outline-none focus:border-[#2E5DE0] transition-colors"
                    placeholder="Jane Doe"
                  />
                </div>

                {/* Field 3: Email */}
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-[0.05em] mb-2">
                    EMAIL
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    className="w-full h-[42px] rounded-[8px] border border-[#CBD5E1] bg-white px-3.5 text-[13.5px] text-[#1E1B4B] placeholder:text-[#64748B] focus:outline-none focus:border-[#2E5DE0] transition-colors"
                    placeholder="jane@example.com"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={submit}
                  disabled={!name || !email || !selectedDriveId}
                  className={`w-full h-[42px] rounded-[8px] text-[13.5px] font-bold flex items-center justify-center gap-2 transition-all mt-6 ${
                    !name || !email || !selectedDriveId
                      ? "bg-[#DBE4F0] text-[#64748B] cursor-not-allowed"
                      : "bg-[#2E5DE0] hover:bg-[#254ec4] text-white shadow-md cursor-pointer"
                  }`}
                >
                  Generate invite link
                </button>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] p-4 space-y-3">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-[0.05em]">
                    Invite Link
                  </div>
                  <div className="font-mono text-[12px] text-[#1E1B4B] break-all bg-white p-3 rounded-[8px] border border-[#CBD5E1]">
                    {created.link}
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(created.link, created.id)}
                    className="h-[36px] px-4 rounded-[8px] bg-[#2E5DE0] hover:bg-[#254ec4] text-white text-[12.5px] font-semibold inline-flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
                  >
                    {copiedId === created.id ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedId === created.id ? "Copied to clipboard" : "Copy link"}</span>
                  </button>
                </div>

                {idProofFile && (
                  <div className="mt-2">
                    {uploadingIdProof ? (
                      <div className="p-3 rounded-[8px] bg-slate-50 border border-slate-200 text-[12px] text-[#64748B] flex items-center gap-2">
                        <RefreshCw size={14} className="animate-spin text-[#2E5DE0]" />
                        Processing ArcFace facial embedding...
                      </div>
                    ) : idProofStatus?.success ? (
                      <div className="p-3 rounded-[8px] bg-emerald-50 border border-emerald-300 text-emerald-700 text-[12px] font-medium flex items-center gap-2">
                        <ShieldCheck size={16} /> ID proof enrolled successfully
                      </div>
                    ) : idProofStatus?.success === false ? (
                      <div className="p-3.5 rounded-[8px] bg-rose-50 border border-rose-200 text-rose-700 text-[12px] space-y-2">
                        <div className="font-semibold flex items-center gap-1.5">
                          <XCircle size={15} /> ID proof upload failed
                        </div>
                        <div>{idProofStatus.error}</div>
                        <button
                          type="button"
                          onClick={retryModalUpload}
                          disabled={uploadingIdProof}
                          className="mt-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-semibold rounded-[6px] flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw size={12} className={uploadingIdProof ? "animate-spin" : ""} />
                          Retry ID Proof Upload
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="text-[12px] text-[#64748B]">
                  Invited <span className="font-semibold text-[#1E1B4B]">{created.candidateName}</span> for{" "}
                  <span className="font-semibold text-[#1E1B4B]">
                    {created.roleTemplate.roleName} · {created.roleTemplate.track}
                  </span>
                  . Expires {fmtExpires(created.expiresAt)}.
                </div>

                <button
                  type="button"
                  onClick={resetForm}
                  className="mt-4 w-full h-[40px] rounded-[8px] bg-slate-100 hover:bg-slate-200 text-[#1E1B4B] text-[13px] font-bold cursor-pointer transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revoke confirmation */}
      {confirmRevoke && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
          onClick={() => setConfirmRevoke(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-md font-semibold text-ink mb-2">Revoke this invite?</div>
            <div className="text-sm-minus text-ink-secondary mb-5">
              The candidate will no longer be able to redeem the link. This can't be undone.
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmRevoke(null)}
                className="px-3 py-2 text-sm-minus border border-line rounded-md hover:bg-canvas text-ink-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  revokeInvite(confirmRevoke);
                  setConfirmRevoke(null);
                }}
                className="px-3 py-2 text-sm-minus bg-danger hover:bg-danger-hover text-white rounded-md cursor-pointer"
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
          <div className="bg-white rounded-lg w-full max-w-[400px] p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Extend Invite Expiration</h3>
              <p className="text-xs-plus text-ink-tertiary mt-0.5">
                Select a new date and time for expiration:
              </p>
            </div>
            <div>
              <input
                type="datetime-local"
                value={extendExpiryDate}
                onChange={(e) => setExtendExpiryDate(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-md bg-white text-sm-minus"
              />
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setExtendInviteId(null)}
                className="px-3.5 py-1.5 border border-line rounded hover:bg-canvas text-ink-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleExtend}
                className="px-3.5 py-1.5 text-white bg-brand rounded hover:bg-brand-hover cursor-pointer transition-colors"
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
          <div className="bg-white rounded-xl w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-line pb-3">
              <div className="p-2 bg-red-50 text-red-500 rounded-full">
                <XCircle size={18} />
              </div>
              <h3 className="text-base font-semibold text-ink">Revoke Multiple Invites?</h3>
            </div>
            
            <p className="text-sm-minus text-ink-secondary leading-relaxed">
              Are you sure you want to revoke <span className="font-semibold text-ink">{selectedIds.length} invite(s)</span>? The invite links will no longer be valid and the candidates will not be able to access the assessment.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-sm-minus">
              <button
                onClick={() => setConfirmBulkRevoke(false)}
                className="px-3.5 py-2 border border-line rounded hover:bg-canvas text-ink-secondary transition-colors cursor-pointer"
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
          <div className="bg-white rounded-xl w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-line pb-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-full">
                <Trash2 size={18} />
              </div>
              <h3 className="text-base font-semibold text-ink">Delete Invite?</h3>
            </div>

            <p className="text-sm-minus text-ink-secondary leading-relaxed">
              Are you sure you want to permanently delete the invite for{" "}
              <span className="font-semibold text-ink">{confirmDeleteInvite.candidateName}</span> ({confirmDeleteInvite.candidateEmail})?
              This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-sm-minus">
              <button
                onClick={() => setConfirmDeleteInvite(null)}
                className="px-3.5 py-2 border border-line rounded hover:bg-canvas text-ink-secondary transition-colors cursor-pointer"
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
          <div className="bg-white rounded-xl w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-line pb-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-full">
                <Trash2 size={18} />
              </div>
              <h3 className="text-base font-semibold text-ink">Delete Multiple Invites?</h3>
            </div>

            <p className="text-sm-minus text-ink-secondary leading-relaxed">
              Are you sure you want to permanently delete <span className="font-semibold text-ink">{selectedIds.length} invite(s)</span>?
              All selected invitation records will be deleted permanently.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-sm-minus">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="px-3.5 py-2 border border-line rounded hover:bg-canvas text-ink-secondary transition-colors cursor-pointer"
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
