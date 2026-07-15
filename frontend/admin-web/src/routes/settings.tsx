import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Users, Sliders, Shield, FileText, Check, AlertCircle, Search } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore } from "../lib/store";
import { type AuditLog } from "../lib/types";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings & Administration — CD-Recruit" },
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
  const getScoringConfig = useStore((s) => s.fetchQuestions); // reuse or load local configs
  const [activeTab, setActiveTab] = useState<"users" | "scoring" | "retention" | "audit">("users");

  // Staff state
  const [staff, setStaff] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Scoring configuration state
  const [aiThreshold, setAiThreshold] = useState(0.8);
  const [passThreshold, setPassThreshold] = useState(0.7);
  const [savingScoring, setSavingScoring] = useState(false);

  // Retention configuration state
  const [retentionDays, setRetentionDays] = useState(30);
  const [savingRetention, setSavingRetention] = useState(false);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsQuery, setLogsQuery] = useState("");

  const loadStaffList = async () => {
    setLoadingStaff(true);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("http://localhost:3001/api/v1/admin/settings/staff", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setStaff(data);
      setLoadingStaff(false);
    } catch (err) {
      console.error(err);
      setLoadingStaff(false);
    }
  };

  const loadScoringConfig = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("http://localhost:3001/api/v1/admin/settings/scoring", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAiThreshold(data.aiConfidenceThreshold);
      setPassThreshold(data.passRateThreshold);
    } catch (err) {
      console.error(err);
    }
  };

  const loadRetentionConfig = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("http://localhost:3001/api/v1/admin/settings/retention", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRetentionDays(data.biometricRetentionDays);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const data = await fetchAuditLogs({ search: logsQuery || undefined });
      setAuditLogs(data.items);
      setLoadingLogs(false);
    } catch (err) {
      console.error(err);
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users") loadStaffList();
    if (activeTab === "scoring") loadScoringConfig();
    if (activeTab === "retention") loadRetentionConfig();
    if (activeTab === "audit") loadAuditLogs();
  }, [activeTab, logsQuery]);

  const handleUpdateRole = async (staffId: string, newRole: string) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`http://localhost:3001/api/v1/admin/settings/staff/${staffId}/role`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      loadStaffList();
    } catch (err) {
      alert("Error updating role");
    }
  };

  const handleSaveScoring = async () => {
    setSavingScoring(true);
    try {
      const token = localStorage.getItem("admin_token");
      await fetch("http://localhost:3001/api/v1/admin/settings/scoring", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aiConfidenceThreshold: aiThreshold,
          passRateThreshold: passThreshold,
        }),
      });
      setSavingScoring(false);
      alert("Scoring thresholds saved successfully");
    } catch (err) {
      alert("Error saving config");
      setSavingScoring(false);
    }
  };

  const handleSaveRetention = async () => {
    setSavingRetention(true);
    try {
      const token = localStorage.getItem("admin_token");
      await fetch("http://localhost:3001/api/v1/admin/settings/retention", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ biometricRetentionDays: retentionDays }),
      });
      setSavingRetention(false);
      alert("Retention schedule saved successfully");
    } catch (err) {
      alert("Error saving config");
      setSavingRetention(false);
    }
  };

  return (
    <AppShell title="Settings & Administration">
      <div className="flex gap-8">
        {/* Navigation Tabs Side */}
        <div className="w-[180px] shrink-0 flex flex-col gap-1 text-[13px]">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "users"
                ? "bg-white border border-[#E6E6EA] text-[#2F5CFF] shadow-sm"
                : "text-[#5B5B64] hover:text-[#0B0B0D]"
            }`}
          >
            <Users size={14} />
            Users & Roles
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
            Scoring Config
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
          {/* Tab 1: Users */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[14px] font-semibold text-[#0B0B0D]">
                  Manage Staff & Recruiter Roles
                </h3>
                <p className="text-[11px] text-[#8B8B93] mt-0.5">
                  Toggle admin overrides and update role templates below:
                </p>
              </div>

              {loadingStaff ? (
                <p className="text-center font-mono text-[12px] text-[#8B8B93] py-4">
                  Loading staff roster…
                </p>
              ) : (
                <div className="border border-[#E6E6EA] rounded-md divide-y divide-[#EFF0F3] overflow-hidden">
                  {staff.map((s) => (
                    <div key={s.id} className="p-3.5 flex items-center justify-between">
                      <div>
                        <div className="text-[13px] font-medium text-[#0B0B0D]">{s.name}</div>
                        <div className="text-[11px] text-[#5B5B64]">{s.email}</div>
                      </div>
                      <select
                        value={s.role}
                        onChange={(e) => handleUpdateRole(s.id, e.target.value)}
                        className="px-2 py-1 text-[12px] border border-[#E6E6EA] rounded bg-white text-[#5B5B64] outline-none"
                      >
                        <option value="RECRUITER">Recruiter</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Scoring */}
          {activeTab === "scoring" && (
            <div className="max-w-[420px] space-y-5">
              <div>
                <h3 className="text-[14px] font-semibold text-[#0B0B0D]">
                  AI Threshold & Scoring Controls
                </h3>
                <p className="text-[11px] text-[#8B8B93] mt-0.5">
                  Set the trigger levels for manual auditor reviews:
                </p>
              </div>

              <div className="space-y-3 text-[13px]">
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
                className="px-4 py-2 text-[12px] font-medium text-white bg-[#2F5CFF] rounded hover:bg-[#1E4DDF] disabled:bg-[#B3C5FF] shadow-sm transition-colors cursor-pointer"
              >
                {savingScoring ? "Saving Config…" : "Save Configurations"}
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
                className="px-4 py-2 text-[12px] font-medium text-white bg-[#2F5CFF] rounded hover:bg-[#1E4DDF] disabled:bg-[#B3C5FF] shadow-sm transition-colors cursor-pointer"
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
