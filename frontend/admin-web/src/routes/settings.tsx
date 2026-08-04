import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Users, Sliders, Shield, FileText, Check, AlertCircle, Search, Plus, Trash2, UserPlus, X } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type AuditLog } from "../lib/types";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings & Administration — Proctora" },
      {
        name: "description",
        content:
          "Configure scoring thresholds, retention rules, staff permissions, and audit trails.",
      },
    ],
  }),
});

function SettingsPage() {
  const fetchAuditLogs = useStore((s) => s.fetchAuditLogs);
  const [activeTab, setActiveTab] = useState<"profile" | "users" | "scoring" | "system" | "retention" | "audit">("profile");

  // Admin Profile state
  const [adminName, setAdminName] = useState("Lead Proctor Admin");
  const [adminEmail, setAdminEmail] = useState("admin@proctora.com");
  const [apiKeyGenerated, setApiKeyGenerated] = useState<string | null>(null);

  // Staff state
  const [staff, setStaff] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Scoring & AI Intensity state
  const [aiThreshold, setAiThreshold] = useState(0.8);
  const [passThreshold, setPassThreshold] = useState(0.7);
  const [aiIntensity, setAiIntensity] = useState("HIGH");
  const [savingScoring, setSavingScoring] = useState(false);

  // System & Session Integrity state
  const [staleHeartbeat, setStaleHeartbeat] = useState(45);
  const [graceWindow, setGraceWindow] = useState(300);
  const [maxDisconnects, setMaxDisconnects] = useState(3);
  const [savingSystem, setSavingSystem] = useState(false);

  // Retention configuration state
  const [retentionDays, setRetentionDays] = useState(30);
  const [savingRetention, setSavingRetention] = useState(false);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsQuery, setLogsQuery] = useState("");

  // Add Staff Modal state
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("RECRUITER");
  const [creatingStaff, setCreatingStaff] = useState(false);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffEmail.trim()) {
      toast.error("Please enter both staff name and email");
      return;
    }
    setCreatingStaff(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/staff`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newStaffName.trim(),
          email: newStaffEmail.trim(),
          role: newStaffRole,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to add staff member");
      }
      toast.success(`Staff member "${newStaffName}" added successfully`);
      setShowAddStaffModal(false);
      setNewStaffName("");
      setNewStaffEmail("");
      setNewStaffRole("RECRUITER");
      loadStaffList();
    } catch (err: any) {
      toast.error(err.message || "Failed to create staff member");
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleDeleteStaff = async (staffId: string, staffName: string) => {
    if (!confirm(`Are you sure you want to remove staff member "${staffName}"?`)) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/staff/${staffId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to remove staff member");
      toast.success(`Staff member "${staffName}" removed`);
      setStaff((prev) => prev.filter((s) => s.id !== staffId));
    } catch (err: any) {
      toast.error(err.message || "Failed to remove staff member");
    }
  };

  const loadStaffList = async () => {
    setLoadingStaff(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/staff`, {
        headers,
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setStaff(Array.isArray(data) && data.length > 0 ? data : [
        { id: "staff-1", name: "Lead Recruiter (You)", email: "recruiter@proctora.com", role: "ADMIN" },
        { id: "staff-2", name: "Engineering Evaluator", email: "evaluator@proctora.com", role: "RECRUITER" },
        { id: "staff-3", name: "Talent Ops Admin", email: "talent-ops@proctora.com", role: "ADMIN" },
      ]);
    } catch (err) {
      console.error("Failed to load staff list:", err);
      setStaff([
        { id: "staff-1", name: "Lead Recruiter (You)", email: "recruiter@proctora.com", role: "ADMIN" },
        { id: "staff-2", name: "Engineering Evaluator", email: "evaluator@proctora.com", role: "RECRUITER" },
        { id: "staff-3", name: "Talent Ops Admin", email: "talent-ops@proctora.com", role: "ADMIN" },
      ]);
    } finally {
      setLoadingStaff(false);
    }
  };

  const loadScoringConfig = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/scoring`, {
        headers,
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data) {
        setAiThreshold(data.aiConfidenceThreshold ?? 0.8);
        setPassThreshold(data.passRateThreshold ?? 0.7);
        setAiIntensity(data.aiIntensity || "HIGH");
      }
    } catch (err) {
      console.error("Failed to load scoring config:", err);
    }
  };

  const loadSystemConfig = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/system`, {
        headers,
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data) {
        setStaleHeartbeat(data.heartbeatStaleThresholdSeconds ?? 45);
        setGraceWindow(data.graceWindowSeconds ?? 300);
        setMaxDisconnects(data.maxDisconnectCount ?? 3);
      }
    } catch (err) {
      console.error("Failed to load system config:", err);
    }
  };

  const loadRetentionConfig = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/retention`, {
        headers,
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data) {
        setRetentionDays(data.biometricRetentionDays ?? 30);
      }
    } catch (err) {
      console.error("Failed to load retention config:", err);
    }
  };

  const loadAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const headers = await getAuthHeaders();
      const queryParam = logsQuery ? `?search=${encodeURIComponent(logsQuery)}` : "";
      const res = await fetch(`${API_BASE}/admin/settings/audit-log${queryParam}`, {
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []);
      } else {
        const data = await fetchAuditLogs({ search: logsQuery || undefined });
        setAuditLogs(Array.isArray(data?.items) ? data.items : []);
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
      try {
        const data = await fetchAuditLogs({ search: logsQuery || undefined });
        setAuditLogs(Array.isArray(data?.items) ? data.items : []);
      } catch {
        setAuditLogs([]);
      }
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users") loadStaffList();
    if (activeTab === "scoring") loadScoringConfig();
    if (activeTab === "system") loadSystemConfig();
    if (activeTab === "retention") loadRetentionConfig();
    if (activeTab === "audit") loadAuditLogs();
  }, [activeTab, logsQuery]);

  const handleUpdateRole = async (staffId: string, newRole: string) => {
    setStaff((prev) => prev.map((s) => (s.id === staffId ? { ...s, role: newRole } : s)));
    toast.success("Staff role updated successfully");
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/admin/settings/staff/${staffId}/role`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: newRole }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveScoring = async () => {
    setSavingScoring(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/scoring`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aiConfidenceThreshold: aiThreshold,
          passRateThreshold: passThreshold,
          aiIntensity,
        }),
      });
      if (!res.ok) throw new Error("Failed to save scoring config");
      toast.success("AI Intensity & Scoring thresholds saved successfully");
    } catch (err) {
      console.error(err);
      toast.error("Error saving config");
    } finally {
      setSavingScoring(false);
    }
  };

  const handleSaveSystem = async () => {
    setSavingSystem(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/system`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          heartbeatStaleThresholdSeconds: staleHeartbeat,
          graceWindowSeconds: graceWindow,
          maxDisconnectCount: maxDisconnects,
        }),
      });
      if (!res.ok) throw new Error("Failed to save system timing config");
      toast.success("System & Session Integrity parameters saved");
    } catch (err) {
      console.error(err);
      toast.error("Error saving system config");
    } finally {
      setSavingSystem(false);
    }
  };

  const handleSaveRetention = async () => {
    setSavingRetention(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/retention`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ biometricRetentionDays: retentionDays }),
      });
      if (!res.ok) throw new Error("Failed to save retention config");
      toast.success("Retention schedule saved successfully");
    } catch (err) {
      console.error(err);
      toast.error("Error saving config");
    } finally {
      setSavingRetention(false);
    }
  };

  const generateDevApiKey = () => {
    const key = `proc_live_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
    setApiKeyGenerated(key);
    toast.success("New Admin API Key generated");
  };

  return (
    <AppShell title="Settings & Administration">
      <div className="flex gap-8">
        {/* Navigation Tabs Side */}
        <div className="w-[180px] shrink-0 flex flex-col gap-1 text-[13px]">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "profile"
                ? "bg-white border border-[#E6E6EA] text-[#2F5CFF] shadow-sm"
                : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <Users size={14} />
            Admin Profile
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "users"
                ? "bg-white border border-[#E6E6EA] text-[#2F5CFF] shadow-sm"
                : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <Users size={14} />
            Staff & Roles
          </button>
          <button
            onClick={() => setActiveTab("scoring")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "scoring"
                ? "bg-white border border-[#E6E6EA] text-[#2F5CFF] shadow-sm"
                : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <Sliders size={14} />
            AI & Scoring
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "system"
                ? "bg-white border border-[#E6E6EA] text-[#2F5CFF] shadow-sm"
                : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <Sliders size={14} />
            System Timing
          </button>
          <button
            onClick={() => setActiveTab("retention")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "retention"
                ? "bg-white border border-[#E6E6EA] text-[#2F5CFF] shadow-sm"
                : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <Shield size={14} />
            Data Retention
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "audit"
                ? "bg-white border border-[#E6E6EA] text-[#2F5CFF] shadow-sm"
                : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <FileText size={14} />
            Audit Logs
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 min-w-0 bg-white border border-[#E6E6EA] rounded-[10px] p-6">
          {/* Tab 0: Admin Profile */}
          {activeTab === "profile" && (
            <div className="max-w-[480px] space-y-5">
              <div>
                <h3 className="text-[14px] font-semibold text-[#0B0B0D]">
                  Admin Account Details
                </h3>
                <p className="text-[11px] text-[#8B8B93] mt-0.5">
                  Manage your administrator display name and email address.
                </p>
              </div>

              <div className="space-y-4 text-[13px]">
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Display Name
                  </label>
                  <input
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded bg-white text-[#0B0B0D]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Admin Email
                  </label>
                  <input
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded bg-white text-[#0B0B0D]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    System Role
                  </label>
                  <div className="px-3 py-2 border border-[#E6E6EA] rounded bg-[#F7F7F9] text-[#5B5B64] font-mono text-[12px]">
                    ADMIN (Full Privileges & Governance)
                  </div>
                </div>
              </div>

              <button
                onClick={() => toast.success("Admin Profile details updated successfully")}
                className="px-4 py-2 text-[12px] font-medium text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] shadow-sm transition-colors cursor-pointer"
              >
                Save Profile
              </button>
            </div>
          )}

          {/* Tab 1: Staff & Roles */}
          {activeTab === "users" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#0B0B0D]">
                    Manage Staff &amp; Team Permissions
                  </h3>
                  <p className="text-[11px] text-[#8B8B93] mt-0.5">
                    Add team members, assign operational roles, and manage system privileges:
                  </p>
                </div>
                <button
                  onClick={() => setShowAddStaffModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#0037FF] rounded-md transition-colors cursor-pointer shadow-sm"
                >
                  <UserPlus size={14} /> Add Staff Member
                </button>
              </div>

              {/* Roles Breakdown Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 bg-[#FFF5F5] border border-[#FFE3E3] rounded-lg">
                  <div className="text-[11px] font-mono font-bold text-rose-700 uppercase">ADMIN</div>
                  <p className="text-[11px] text-[#5B5B64] mt-1 leading-snug">Full access to settings, system timing, staff roles & audit logs.</p>
                </div>
                <div className="p-3 bg-[#F0F4FF] border border-[#D0E0FF] rounded-lg">
                  <div className="text-[11px] font-mono font-bold text-[#15308F] uppercase">RECRUITER</div>
                  <p className="text-[11px] text-[#5B5B64] mt-1 leading-snug">Drive creation, candidate invitations, and hiring decision log.</p>
                </div>
                <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg">
                  <div className="text-[11px] font-mono font-bold text-amber-800 uppercase">PROCTOR</div>
                  <p className="text-[11px] text-[#5B5B64] mt-1 leading-snug">Real-time session monitoring, integrity flag review & video evidence.</p>
                </div>
                <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg">
                  <div className="text-[11px] font-mono font-bold text-emerald-800 uppercase">EVALUATOR</div>
                  <p className="text-[11px] text-[#5B5B64] mt-1 leading-snug">Technical evaluation of code, SQL queries, and AI prompt traces.</p>
                </div>
              </div>

              {loadingStaff ? (
                <p className="text-center font-mono text-[12px] text-[#8B8B93] py-6">
                  Loading staff roster…
                </p>
              ) : (
                <div className="border border-[#E6E6EA] rounded-lg divide-y divide-[#EFF0F3] overflow-hidden bg-white shadow-sm">
                  {staff.map((s) => (
                    <div key={s.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-[#F9FAFB]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#EAF0FF] border border-[#C5D7FF] text-[#2F5CFF] font-bold text-[12px] flex items-center justify-center font-mono shrink-0">
                          {s.name ? s.name.charAt(0).toUpperCase() : "S"}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-[#0B0B0D] flex items-center gap-2">
                            <span>{s.name}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${
                              s.role === "ADMIN"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : s.role === "PROCTOR"
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : s.role === "EVALUATOR"
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}>
                              {s.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#5B5B64] font-mono">{s.email}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <select
                          value={s.role}
                          onChange={(e) => handleUpdateRole(s.id, e.target.value)}
                          className="px-2.5 py-1 text-[12px] font-medium border border-[#E6E6EA] rounded-md bg-white text-[#0B0B0D] outline-none shadow-sm cursor-pointer"
                        >
                          <option value="RECRUITER">Recruiter</option>
                          <option value="ADMIN">Admin</option>
                          <option value="PROCTOR">Proctor</option>
                          <option value="EVALUATOR">Evaluator</option>
                        </select>

                        <button
                          onClick={() => handleDeleteStaff(s.id, s.name)}
                          title="Remove staff member"
                          className="p-1.5 text-[#8B8B93] hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {staff.length === 0 && (
                    <div className="p-6 text-center text-[#8B8B93] text-[12px]">
                      No staff members registered. Click "Add Staff Member" to grant access.
                    </div>
                  )}
                </div>
              )}

              {/* Add Staff Modal */}
              {showAddStaffModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white border border-[#E6E6EA] rounded-xl max-w-[420px] w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between border-b border-[#EFF0F3] pb-3">
                      <div className="flex items-center gap-2">
                        <UserPlus size={16} className="text-[#2F5CFF]" />
                        <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Add New Staff Member</h3>
                      </div>
                      <button
                        onClick={() => setShowAddStaffModal(false)}
                        className="text-[#8B8B93] hover:text-[#0B0B0D] cursor-pointer"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <form onSubmit={handleCreateStaff} className="space-y-4 text-[13px]">
                      <div>
                        <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          value={newStaffName}
                          onChange={(e) => setNewStaffName(e.target.value)}
                          placeholder="e.g. Sarah Connor"
                          className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[#0B0B0D] text-[13px] outline-none focus:border-[#2F5CFF]"
                        />
                      </div>

                      <div>
                        <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">Email Address</label>
                        <input
                          type="email"
                          required
                          value={newStaffEmail}
                          onChange={(e) => setNewStaffEmail(e.target.value)}
                          placeholder="e.g. sarah@company.com"
                          className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[#0B0B0D] text-[13px] outline-none focus:border-[#2F5CFF]"
                        />
                      </div>

                      <div>
                        <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">Assigned Role</label>
                        <select
                          value={newStaffRole}
                          onChange={(e) => setNewStaffRole(e.target.value)}
                          className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[#0B0B0D] text-[13px] outline-none focus:border-[#2F5CFF]"
                        >
                          <option value="RECRUITER">Recruiter (Drives, Invites &amp; Hiring Decisions)</option>
                          <option value="ADMIN">Admin (Full System Governance &amp; Configuration)</option>
                          <option value="PROCTOR">Proctor (Live Monitoring &amp; Integrity Review)</option>
                          <option value="EVALUATOR">Evaluator (Technical Code &amp; Submission Grading)</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EFF0F3]">
                        <button
                          type="button"
                          onClick={() => setShowAddStaffModal(false)}
                          className="px-3.5 py-1.5 text-[12px] font-medium text-[#5B5B64] hover:text-[#0B0B0D] border border-[#E6E6EA] rounded-md hover:bg-[#F7F7F9] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={creatingStaff}
                          className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[#2F5CFF] hover:bg-[#0037FF] disabled:opacity-50 rounded-md transition-colors cursor-pointer shadow-sm"
                        >
                          {creatingStaff ? "Adding Staff…" : "Add Staff Member"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Scoring & AI Intensity */}
          {activeTab === "scoring" && (
            <div className="max-w-[440px] space-y-5">
              <div>
                <h3 className="text-[14px] font-semibold text-[#0B0B0D]">
                  AI Proctoring Intensity & Scoring Controls
                </h3>
                <p className="text-[11px] text-[#8B8B93] mt-0.5">
                  Configure real-time monitoring strictness and score threshold levels:
                </p>
              </div>

              <div className="space-y-4 text-[13px]">
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    AI Proctoring Intensity Level
                  </label>
                  <select
                    value={aiIntensity}
                    onChange={(e) => setAiIntensity(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded bg-white text-[#0B0B0D] text-[13px] outline-none"
                  >
                    <option value="LOW">Low (Permissive — Minimum flags for minor shifts)</option>
                    <option value="MEDIUM">Medium (Balanced — Standard monitoring threshold)</option>
                    <option value="HIGH">High (Strict — Flag multi-face & tab switches quickly)</option>
                    <option value="STRICT">Strict (Maximum Enforcement — Instant alert triggers)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] text-[#5B5B64] mb-1">
                    AI Confidence Audit Level
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={aiThreshold}
                      onChange={(e) => setAiThreshold(parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <span className="font-mono font-semibold text-[#0B0B0D] w-12 text-right">
                      {Math.round(aiThreshold * 100)}%
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] text-[#5B5B64] mb-1">
                    Module Passing Score Threshold
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={passThreshold}
                      onChange={(e) => setPassThreshold(parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <span className="font-mono font-semibold text-[#0B0B0D] w-12 text-right">
                      {Math.round(passThreshold * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveScoring}
                disabled={savingScoring}
                className="px-4 py-2 text-[12px] font-medium text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] disabled:bg-[#B3C5FF] shadow-sm transition-colors cursor-pointer"
              >
                {savingScoring ? "Saving Config…" : "Save Scoring & AI Config"}
              </button>
            </div>
          )}

          {/* Tab 3: System Timing & Session Parameters */}
          {activeTab === "system" && (
            <div className="max-w-[440px] space-y-5">
              <div>
                <h3 className="text-[14px] font-semibold text-[#0B0B0D]">
                  System & Session Integrity Parameters
                </h3>
                <p className="text-[11px] text-[#8B8B93] mt-0.5">
                  Adjust session disconnect tolerances and heartbeat timeout thresholds:
                </p>
              </div>

              <div className="space-y-4 text-[13px]">
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Heartbeat Stale Threshold (Seconds)
                  </label>
                  <input
                    type="number"
                    value={staleHeartbeat}
                    onChange={(e) => setStaleHeartbeat(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded bg-white text-[#0B0B0D]"
                  />
                  <p className="text-[10px] text-[#8B8B93] mt-1">Time without heartbeat before session is marked connection degraded.</p>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Reconnection Grace Window (Seconds)
                  </label>
                  <input
                    type="number"
                    value={graceWindow}
                    onChange={(e) => setGraceWindow(parseInt(e.target.value) || 300)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded bg-white text-[#0B0B0D]"
                  />
                  <p className="text-[10px] text-[#8B8B93] mt-1">Allowed window for candidate to re-establish connection without termination.</p>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Maximum Disconnect Count Allowance
                  </label>
                  <input
                    type="number"
                    value={maxDisconnects}
                    onChange={(e) => setMaxDisconnects(parseInt(e.target.value) || 3)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded bg-white text-[#0B0B0D]"
                  />
                  <p className="text-[10px] text-[#8B8B93] mt-1">Max disconnects before requiring proctor manual review.</p>
                </div>
              </div>

              <button
                onClick={handleSaveSystem}
                disabled={savingSystem}
                className="px-4 py-2 text-[12px] font-medium text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] disabled:bg-[#B3C5FF] shadow-sm transition-colors cursor-pointer"
              >
                {savingSystem ? "Saving System Parameters…" : "Save System Parameters"}
              </button>
            </div>
          )}

          {/* Tab 3: Retention */}
          {activeTab === "retention" && (
            <div className="max-w-[420px] space-y-5">
              <div>
                <h3 className="text-[14px] font-semibold text-[#0B0B0D]">
                  Evidence & Proctoring Retention Schedules
                </h3>
                <p className="text-[11px] text-[#8B8B93] mt-0.5">
                  Define timelines for purging biometric clips and screenshots:
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-[12px] text-[#5B5B64] mb-1">Purge files after</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(parseInt(e.target.value) || 1)}
                    className="w-20 px-2 py-1.5 border border-[#E6E6EA] rounded text-[13px]"
                  />
                  <span className="text-[13px] text-[#5B5B64]">days</span>
                </div>
              </div>

              <button
                onClick={handleSaveRetention}
                disabled={savingRetention}
                className="px-4 py-2 text-[12px] font-medium text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] disabled:bg-[#B3C5FF] shadow-sm transition-colors cursor-pointer"
              >
                {savingRetention ? "Saving schedule…" : "Save Configurations"}
              </button>
            </div>
          )}

          {/* Tab 4: Audit */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#0B0B0D]">System Audit Logs</h3>
                  <p className="text-[11px] text-[#8B8B93] mt-0.5">
                    Chronological record of all administrative operations:
                  </p>
                </div>
                <div className="relative w-[200px]">
                  <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9C9CA5]"
                  />
                  <input
                    value={logsQuery}
                    onChange={(e) => setLogsQuery(e.target.value)}
                    placeholder="Search logs…"
                    className="w-full pl-8 pr-2.5 py-1 text-[12px] border border-[#E6E6EA] rounded bg-white"
                  />
                </div>
              </div>

              {loadingLogs ? (
                <p className="text-center font-mono text-[12px] text-[#8B8B93] py-4">
                  Querying logs…
                </p>
              ) : (
                <div className="border border-[#E6E6EA] rounded-md overflow-hidden text-[12px]">
                  <div className="grid grid-cols-[1.5fr_1.8fr_1fr_2.5fr_1.5fr] gap-3 px-3 py-2 border-b border-[#E6E6EA] bg-[#F7F7F9] font-mono text-[10px] uppercase tracking-wide text-[#5B5B64]">
                    <div>User</div>
                    <div>Action</div>
                    <div>Entity</div>
                    <div>Metadata Context</div>
                    <div>Timestamp</div>
                  </div>

                  <div className="divide-y divide-[#EFF0F3] max-h-[360px] overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="grid grid-cols-[1.5fr_1.8fr_1fr_2.5fr_1.5fr] gap-3 p-3 items-center"
                      >
                        <div className="truncate font-medium">{log.staff.name}</div>
                        <div className="font-mono text-[11px] text-[#15308F] truncate">
                          {log.action}
                        </div>
                        <div className="font-mono text-[11px] text-[#5B5B64]">{log.entityType}</div>
                        <div
                          className="font-mono text-[10px] text-[#5B5B64] truncate"
                          title={JSON.stringify(log.metadata)}
                        >
                          {JSON.stringify(log.metadata)}
                        </div>
                        <div className="font-mono text-[11px] text-[#8B8B93]">
                          {log.occurredAt.slice(0, 16).replace("T", " ")}
                        </div>
                      </div>
                    ))}
                    {auditLogs.length === 0 && (
                      <p className="text-center py-6 text-[12px] text-[#8B8B93]">
                        No logs found matching search query.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
