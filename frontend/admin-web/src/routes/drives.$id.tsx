import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Copy,
  Calendar,
  User,
  Check,
  Trash2,
  Mail,
  ExternalLink,
  CalendarDays,
  RefreshCw,
  XCircle,
  X,
  Edit,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type DriveDetail } from "../lib/types";

export const Route = createFileRoute("/drives/$id")({
  component: DriveDetailPage,
  head: () => ({
    meta: [
      { title: "Drive Details — CD-Recruit" },
      {
        name: "description",
        content: "Review candidate rosters, invite logs, and scores for this assessment drive.",
      },
    ],
  }),
});

function DriveDetailPage() {
  const { id: driveId } = Route.useParams();
  const fetchDriveDetail = useStore((s) => s.fetchDriveDetail);
  const revokeInvite = useStore((s) => s.revokeInvite);
  const extendExpiry = useStore((s) => s.extendExpiry);
  const regenerateToken = useStore((s) => s.regenerateToken);

  const [drive, setDrive] = useState<DriveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Extend Modal State
  const [extendInviteId, setExtendInviteId] = useState<string | null>(null);
  const [extendExpiryDate, setExtendExpiryDate] = useState("");

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editStatus, setEditStatus] = useState<string>("DRAFT");

  const loadData = async () => {
    try {
      const data = await fetchDriveDetail(driveId);
      setDrive(data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [driveId]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExtend = async () => {
    if (!extendInviteId) return;
    try {
      await extendExpiry(extendInviteId, new Date(extendExpiryDate).toISOString());
      setExtendInviteId(null);
      loadData();
    } catch (err) {
      alert("Failed extending invite");
    }
  };

  const handleRegenerate = async (id: string) => {
    try {
      await regenerateToken(id);
      loadData();
    } catch (err) {
      alert("Failed regenerating token");
    }
  };

  const handleOpenEdit = () => {
    if (!drive) return;
    setEditName(drive.name);
    setEditStart(drive.scheduleStart ? drive.scheduleStart.slice(0, 16) : "");
    setEditEnd(drive.scheduleEnd ? drive.scheduleEnd.slice(0, 16) : "");
    setEditStatus(drive.status);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: editName,
          scheduleStart: editStart ? new Date(editStart).toISOString() : null,
          scheduleEnd: editEnd ? new Date(editEnd).toISOString() : null,
          status: editStatus,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to update drive");
      }
      setShowEditModal(false);
      loadData();
    } catch (err: any) {
      alert("Failed to update drive: " + err.message);
    }
  };

  if (loading) {
    return (
      <AppShell title="Drive Details">
        <div className="p-8 text-center text-[#5B5B64] font-mono text-[13px]">
          Loading drive details…
        </div>
      </AppShell>
    );
  }

  if (!drive) {
    return (
      <AppShell title="Drive Details">
        <div className="p-8 text-center text-[#EF4444] font-mono text-[13px]">Drive not found.</div>
      </AppShell>
    );
  }

  const isLocked = drive.invitedCount > 0;

  return (
    <AppShell
      title={drive.name}
      count={`${drive.invitedCount} Candidates`}
      actions={
        !isLocked && (
          <button
            onClick={handleOpenEdit}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[#2F5CFF] rounded-md hover:bg-[#1E4DDF] shadow-sm transition-colors cursor-pointer"
          >
            <Edit size={14} /> Edit Drive Details
          </button>
        )
      }
    >
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-[12px] text-[#5B5B64] mb-5 font-medium">
        <Link to="/drives" className="hover:text-[#2F5CFF] hover:underline transition-colors">
          Drives
        </Link>
        <span className="text-[#9C9CA5]">/</span>
        <span className="text-[#0B0B0D] truncate max-w-[200px]">{drive.name}</span>
      </div>

      {/* Invite Token Banner Notice */}
      {isLocked && (
        <div className="mb-6 p-4 bg-[#EFF4FF] border border-[#BFDBFE] rounded-[10px] text-[#15308F] text-[13px] flex items-center gap-2">
          <span className="font-semibold">⚠️ Locked:</span> Candidate invite links (tokens) have been generated for this drive. Details are locked and cannot be edited.
        </div>
      )}

      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93]">
            Status
          </span>
          <div className="text-[15px] font-semibold mt-1 text-[#0B0B0D]">{drive.status}</div>
        </div>
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93]">
            Role
          </span>
          <div className="text-[15px] font-semibold mt-1 text-[#0B0B0D] truncate">
            {drive.roleTemplateName}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93]">
            Start Date
          </span>
          <div className="text-[15px] font-semibold mt-1 text-[#0B0B0D]">
            {drive.scheduleStart
              ? drive.scheduleStart.slice(0, 16).replace("T", " ")
              : "Instant Start"}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EA] rounded-[10px] p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B8B93]">
            End Date
          </span>
          <div className="text-[15px] font-semibold mt-1 text-[#0B0B0D]">
            {drive.scheduleEnd ? drive.scheduleEnd.slice(0, 16).replace("T", " ") : "No deadline"}
          </div>
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-white border border-[#E6E6EA] rounded-[10px] overflow-hidden">
        <div className="grid grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_2.2fr] gap-3 px-4 py-2.5 border-b border-[#E6E6EA] bg-[#F7F7F9] text-[10px] font-mono uppercase tracking-[0.14em] text-[#5B5B64]">
          <div>Candidate Name</div>
          <div>Email</div>
          <div>Invite Status</div>
          <div>Assessment</div>
          <div>Score</div>
          <div className="text-right">Actions</div>
        </div>

        {drive.roster.length === 0 && (
          <div className="p-8 text-center text-[13px] text-[#8B8B93]">
            No candidates added to this drive.
          </div>
        )}

        {drive.roster.map((c) => (
          <div
            key={c.candidateId}
            className="grid grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_2.2fr] gap-3 px-4 py-3 border-b border-[#E6E6EA] last:border-b-0 items-center"
          >
            <div className="text-[13px] font-medium text-[#0B0B0D] truncate">{c.candidateName}</div>
            <div className="text-[12px] text-[#5B5B64] truncate">{c.candidateEmail}</div>
            <div>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                  c.inviteStatus === "PENDING"
                    ? "bg-[#EAF0FF] text-[#15308F]"
                    : c.inviteStatus === "REDEEMED"
                      ? "bg-[#E3F9F2] text-[#0C6B58]"
                      : c.inviteStatus === "EXPIRED"
                        ? "bg-[#FDF2E9] text-[#AD5B0B]"
                        : "bg-[#EFF0F3] text-[#5B5B64]"
                }`}
              >
                {c.inviteStatus}
              </span>
            </div>
            <div>
              <span className="text-[12px] font-mono text-[#5B5B64]">
                {c.sessionStatus || "Not Started"}
              </span>
            </div>
            <div>
              {c.compositeScore !== null ? (
                <span className="text-[13px] font-mono font-semibold text-[#0B0B0D]">
                  {c.compositeScore}%
                </span>
              ) : (
                <span className="text-[#9C9CA5]">—</span>
              )}
            </div>
            <div className="flex items-center justify-end gap-1.5">
              {c.inviteStatus === "PENDING" && (
                <button
                  onClick={() => copyToClipboard(c.inviteLink, c.inviteId)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] cursor-pointer"
                >
                  {copiedId === c.inviteId ? (
                    <Check size={11} className="text-[#0C6B58]" />
                  ) : (
                    <Copy size={11} />
                  )}
                  Link
                </button>
              )}
              {c.inviteStatus === "PENDING" && (
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to revoke this invite?")) {
                      revokeInvite(c.inviteId).then(() => loadData());
                    }
                  }}
                  className="p-1 border border-[#FEE2E2] bg-[#FEF2F2] text-[#EF4444] rounded hover:bg-[#FEE2E2] cursor-pointer"
                  title="Revoke Invite"
                >
                  <XCircle size={12} />
                </button>
              )}
              {(c.inviteStatus === "PENDING" || c.inviteStatus === "EXPIRED") && (
                <button
                  onClick={() => {
                    setExtendInviteId(c.inviteId);
                    setExtendExpiryDate(
                      new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 16)
                    );
                  }}
                  className="p-1 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] cursor-pointer"
                  title="Extend Expiration"
                >
                  <CalendarDays size={12} />
                </button>
              )}
              {c.inviteStatus !== "REDEEMED" && (
                <button
                  onClick={() => handleRegenerate(c.inviteId)}
                  className="p-1 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] cursor-pointer"
                  title="Regenerate Token / Resend"
                >
                  <RefreshCw size={12} />
                </button>
              )}
              {c.sessionId && (
                <Link
                  to="/reports"
                  className="p-1 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#2F5CFF]"
                  title="View Assessment Report"
                >
                  <ExternalLink size={12} />
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Drive details modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[460px] p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-[#E6E6EA]">
              <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Edit Drive Details</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-[#8B8B93] hover:text-[#0B0B0D]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                  Drive Name
                </label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                  Start Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                  End Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 text-[13px]">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-3.5 py-2 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 text-white bg-[#2F5CFF] rounded hover:bg-[#1E4DDF] font-semibold cursor-pointer shadow-sm"
              >
                Save Changes
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
                className="px-3.5 py-1.5 text-white bg-[#2F5CFF] rounded hover:bg-[#1E4DDF]"
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
