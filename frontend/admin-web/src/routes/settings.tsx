import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Users,
  Sliders,
  Settings2,
  ShieldCheck,
  FileText,
  List,
  Check,
  AlertCircle,
  Search,
  Plus,
  Trash2,
  UserPlus,
  X,
  Key,
  RefreshCw,
  Copy,
  Edit3,
  Lock,
  Unlock,
  Globe,
  Contact,
  AlarmClock,
  Plug,
  Cpu,
  GitFork,
} from "lucide-react";


import { AppShell } from "../components/app-shell";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type AuditLog } from "../lib/types";
import { getUserProfile } from "../lib/auth";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings & Administration — Proctora" },
      {
        name: "description",
        content:
          "Configure scoring thresholds, retention rules, staff permissions, partner integrations, and audit trails.",
      },
    ],
  }),
});

function SettingsPage() {
  const profile = getUserProfile();
  const isAdmin = profile?.role === "ADMIN";

  const fetchAuditLogs = useStore((s) => s.fetchAuditLogs);
  const [activeTab, setActiveTab] = useState<"profile" | "users" | "scoring" | "system" | "retention" | "audit" | "integrations" | "modules">("profile");


  // Assessment Modules Settings state
  const [moduleSettings, setModuleSettings] = useState<any[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [savingModule, setSavingModule] = useState<string | null>(null);

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

  // Partner Integrations state
  const [partners, setPartners] = useState<any[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [showCreatePartnerModal, setShowCreatePartnerModal] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newPartnerCallbackUrl, setNewPartnerCallbackUrl] = useState("");
  const [newPartnerRateLimit, setNewPartnerRateLimit] = useState(100);
  const [creatingPartner, setCreatingPartner] = useState(false);

  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{ partnerName: string; apiKey: string } | null>(null);
  const [editingPartner, setEditingPartner] = useState<any | null>(null);
  const [confirmRotatePartner, setConfirmRotatePartner] = useState<any | null>(null);
  const [confirmRevokePartner, setConfirmRevokePartner] = useState<any | null>(null);

  const loadPartnerList = async () => {
    setLoadingPartners(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/partners`, { headers });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setPartners(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load partners list:", err);
    } finally {
      setLoadingPartners(false);
    }
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartnerName.trim()) {
      toast.error("Partner Name is required");
      return;
    }
    setCreatingPartner(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/partners`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPartnerName.trim(),
          callbackUrl: newPartnerCallbackUrl.trim() || undefined,
          rateLimit: Number(newPartnerRateLimit) || 100,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create partner");
      }
      const data = await res.json();
      setShowCreatePartnerModal(false);
      setNewPartnerName("");
      setNewPartnerCallbackUrl("");
      setNewPartnerRateLimit(100);
      setNewlyCreatedKey({ partnerName: data.name, apiKey: data.apiKey });
      toast.success(`Partner "${data.name}" registered successfully`);
      loadPartnerList();
    } catch (err: any) {
      toast.error(err.message || "Failed to create partner");
    } finally {
      setCreatingPartner(false);
    }
  };

  const handleRotateKey = async () => {
    if (!confirmRotatePartner) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/partners/${confirmRotatePartner.id}/rotate-key`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to rotate API key");
      const data = await res.json();
      setConfirmRotatePartner(null);
      setNewlyCreatedKey({ partnerName: data.name, apiKey: data.apiKey });
      toast.success(`API key rotated for partner "${data.name}"`);
      loadPartnerList();
    } catch (err: any) {
      toast.error(err.message || "Failed to rotate API key");
    }
  };

  const handleRevokePartner = async () => {
    if (!confirmRevokePartner) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/partners/${confirmRevokePartner.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to revoke partner");
      setConfirmRevokePartner(null);
      toast.success(`Partner "${confirmRevokePartner.name}" revoked`);
      loadPartnerList();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke partner");
    }
  };

  const handleUpdatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartner) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/partners/${editingPartner.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingPartner.name,
          callbackUrl: editingPartner.callbackUrl || null,
          rateLimit: Number(editingPartner.rateLimit) || 100,
          isRevoked: editingPartner.isRevoked,
        }),
      });
      if (!res.ok) throw new Error("Failed to update partner");
      setEditingPartner(null);
      toast.success("Partner settings updated successfully");
      loadPartnerList();
    } catch (err: any) {
      toast.error(err.message || "Failed to update partner");
    }
  };

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

  const loadModuleSettings = async () => {
    setLoadingModules(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/modules`, { headers });
      if (!res.ok) throw new Error("Failed to load module settings");
      const data = await res.json();
      setModuleSettings(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load module settings");
    } finally {
      setLoadingModules(false);
    }
  };

  // Hover highlight state for matrix grid
  const [hoveredCell, setHoveredCell] = useState<{ dept: string; mod: string } | null>(null);

  const handleToggleModule = async (department: string, moduleType: string, currentVal: boolean) => {
    const key = `${department}-${moduleType}`;
    setSavingModule(key);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/modules`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          department,
          moduleType,
          isEnabled: !currentVal,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update module configuration");
      }

      toast.success(`Module ${moduleType} for ${department.replace("_", " ")} updated`);
      loadModuleSettings();
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle module setting");
    } finally {
      setSavingModule(null);
    }
  };

  const handleBulkDepartmentModules = async (department: string, isEnabled: boolean) => {
    setSavingModule(`bulk-${department}`);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/modules/bulk-department`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          department,
          isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to bulk update department modules");
      }

      toast.success(
        isEnabled
          ? `All modules enabled for ${department.replace("_", " ")}`
          : `All modules cleared for ${department.replace("_", " ")}`
      );
      loadModuleSettings();
    } catch (err: any) {
      toast.error(err.message || "Failed to update department modules");
    } finally {
      setSavingModule(null);
    }
  };

  useEffect(() => {
    if (activeTab === "users") loadStaffList();
    if (activeTab === "scoring") loadScoringConfig();
    if (activeTab === "system") loadSystemConfig();
    if (activeTab === "retention") loadRetentionConfig();
    if (activeTab === "audit") loadAuditLogs();
    if (activeTab === "integrations") loadPartnerList();
    if (activeTab === "modules") loadModuleSettings();
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

function AdminProfileIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="282 156 16 14" fill="none" className={className}>
      <path d="M292.667 161.667H294.001M292.667 164.334H294.001M286.113 165C286.251 164.609 286.506 164.271 286.844 164.032C287.182 163.792 287.586 163.664 288 163.664C288.414 163.664 288.818 163.792 289.156 164.032C289.494 164.271 289.749 164.609 289.887 165M289.333 162.333C289.333 163.07 288.736 163.667 288 163.667C287.264 163.667 286.667 163.07 286.667 162.333C286.667 161.597 287.264 161 288 161C288.736 161 289.333 161.597 289.333 162.333ZM284.666 158.333H295.334C296.07 158.333 296.667 158.93 296.667 159.666V166.334C296.667 167.07 296.07 167.667 295.334 167.667H284.666C283.93 167.667 283.333 167.07 283.333 166.334V159.666C283.333 158.93 283.93 158.333 284.666 158.333Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function StaffRolesIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="282 198 16 14" fill="none" className={className}>
      <path d="M292.667 211V209.667C292.667 208.959 292.386 208.281 291.886 207.781C291.386 207.281 290.708 207 290 207H286C285.293 207 284.614 207.281 284.114 207.781C283.614 208.281 283.333 208.959 283.333 209.667V211M292.667 199.085C293.239 199.234 293.745 199.567 294.107 200.035C294.469 200.502 294.665 201.076 294.665 201.667C294.665 202.257 294.469 202.831 294.107 203.299C293.745 203.766 293.239 204.1 292.667 204.248M296.667 211V209.667C296.667 209.076 296.47 208.502 296.108 208.035C295.746 207.568 295.239 207.234 294.667 207.087M290.667 201.667C290.667 203.139 289.473 204.333 288 204.333C286.527 204.333 285.333 203.139 285.333 201.667C285.333 200.194 286.527 199 288 199C289.473 199 290.667 200.194 290.667 201.667Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function AIScoringIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="282 239 16 16" fill="none" className={className}>
      <path d="M290 252.334V253.667M290 240.333V241.666M293.334 252.334V253.667M293.334 240.333V241.666M283.333 247H284.666M283.333 250.334H284.666M283.333 243.667H284.666M295.334 247H296.667M295.334 250.334H296.667M295.334 243.667H296.667M286.667 252.334V253.667M286.667 240.333V241.666M286 241.666H294.001C294.737 241.666 295.334 242.263 295.334 243V251.001C295.334 251.737 294.737 252.334 294.001 252.334H286C285.263 252.334 284.666 251.737 284.666 251.001V243C284.666 242.263 285.263 241.666 286 241.666ZM288 244.333H292C292.369 244.333 292.667 244.632 292.667 245V249C292.667 249.369 292.369 249.667 292 249.667H288C287.632 249.667 287.333 249.369 287.333 249V245C287.333 244.632 287.632 244.333 288 244.333Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function SystemTimingIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="282 281 16 16" fill="none" className={className}>
      <path d="M290 287V289.667L291.334 291M285.333 283L283.333 285M296.667 285L294.667 283M286.253 293.467L284.666 295M293.76 293.447L295.334 295M295.334 289.667C295.334 292.612 292.946 295 290 295C287.054 295 284.666 292.612 284.666 289.667C284.666 286.721 287.054 284.333 290 284.333C292.946 284.333 295.334 286.721 295.334 289.667Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function RetentionPolicyIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="282 323 16 16" fill="none" className={className}>
      <path d="M288 331L289.333 332.333L292 329.667M295.333 331.667C295.333 335 292.999 336.667 290.226 337.634C290.081 337.683 289.923 337.681 289.78 337.627C287 336.667 284.667 335 284.667 331.667V327C284.667 326.823 284.737 326.654 284.862 326.529C284.987 326.404 285.157 326.333 285.334 326.333C286.667 326.333 288.333 325.533 289.493 324.52C289.634 324.399 289.814 324.333 290 324.333C290.186 324.333 290.365 324.399 290.506 324.52C291.673 325.54 293.333 326.333 294.666 326.333C294.843 326.333 295.012 326.404 295.137 326.529C295.262 326.654 295.333 326.823 295.333 327V331.667Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IntegrationsIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 3v6a3 3 0 0 0 3 3h6" />
      <path d="M18 9l3 3-3 3" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
    </svg>
  );
}

  const TABS = [
    { id: "profile", label: "Admin Profile", icon: AdminProfileIcon },
    { id: "users", label: "Staff & Roles", icon: StaffRolesIcon },
    { id: "scoring", label: "AI & Scoring", icon: AIScoringIcon },
    { id: "system", label: "System Timing", icon: SystemTimingIcon },
    { id: "retention", label: "Data Retention", icon: RetentionPolicyIcon },
    { id: "audit", label: "Audit Logs", icon: List },
    { id: "integrations", label: "Integrations", icon: IntegrationsIcon },
  ] as const;



  return (
    <AppShell hideHeader={true}>
      <div className="max-w-[1300px] mx-auto w-full">
        {/* Main Header */}
        <h1 className="text-[32px] font-bold text-[#0d1424] tracking-tight mb-8">
          Settings &amp; Administration
        </h1>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Navigation Tabs Side */}
          <div className="w-full lg:w-[200px] shrink-0 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2.5 px-4 py-2 rounded-full text-left transition-all cursor-pointer whitespace-nowrap text-xs ${
                    active
                      ? "border border-[#2f68ff] bg-white text-[#2f68ff] font-medium shadow-xs"
                      : "text-[#64748b] hover:text-[#0d1424] hover:bg-white/40 font-normal"
                  }`}

                >
                  <Icon size={14} className={active ? "text-[#2f68ff]" : "text-[#708099]"} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Body Card */}
          <div className="flex-1 min-w-0 w-full bg-white rounded-[24px] p-8 md:p-10 border border-white/60 shadow-[0_10px_35px_rgba(0,0,0,0.03)] min-h-[480px]">
            {/* Tab 1: Admin Profile */}
            {activeTab === "profile" && (
              <div className="max-w-[620px] space-y-6">
                <div>
                  <h2 className="text-sm md:text-base font-bold text-[#0d1424]">Admin Account Details</h2>
                  <p className="text-xs text-[#94a3b8] mt-1">
                    Manage your administrator display name and email address.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#475569] mb-2">
                      Display Name
                    </label>
                    <input
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full h-11 px-4 border border-[#e2e8f0] rounded-xl text-xs text-[#0d1424] bg-white focus:border-[#2f68ff] focus:ring-1 focus:ring-[#2f68ff]/20 outline-none transition-all"
                      placeholder="Lead Proctor Admin"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#475569] mb-2">
                      Admin Email
                    </label>
                    <input
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full h-11 px-4 border border-[#e2e8f0] rounded-xl text-xs text-[#0d1424] bg-white focus:border-[#2f68ff] focus:ring-1 focus:ring-[#2f68ff]/20 outline-none transition-all"
                      placeholder="admin@proctora.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#475569] mb-2">
                      System Role
                    </label>
                    <input
                      disabled
                      value="ADMIN (Full Privileges & Governance)"
                      className="w-full h-11 px-4 border border-[#e8ecf4] rounded-xl text-xs text-[#64748b] bg-[#f8fafc] cursor-not-allowed select-none"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => toast.success("Admin Profile details updated successfully")}
                    className="px-6 py-2.5 text-xs font-semibold text-white bg-[#2f68ff] hover:bg-[#1e54ea] rounded-full shadow-sm transition-all cursor-pointer"
                  >
                    Save Profile
                  </button>
                </div>
              </div>
            )}


            {/* Tab 2: Staff & Roles */}
            {activeTab === "users" && (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-bold text-[#0d1424]">Manage Staff &amp; Team Permissions</h2>
                    <p className="text-xs text-[#8c9ba5] mt-1">
                      Add team members, assign operational roles, and manage system privileges.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddStaffModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2f68ff] hover:bg-[#1e54ea] rounded-full transition-all cursor-pointer shadow-sm shrink-0"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    <span>Add Staff Member</span>
                  </button>
                </div>

                {/* Roles Breakdown Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="p-3.5 bg-[#fff5f5] rounded-xl border-0">
                    <div className="text-[10px] font-bold text-[#e03137] tracking-wider uppercase">ADMIN</div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-1">
                      Full access to settings, system timing, staff roles &amp; audit logs.
                    </p>
                  </div>
                  <div className="p-3.5 bg-[#f0f6ff] rounded-xl border-0">
                    <div className="text-[10px] font-bold text-[#2f68ff] tracking-wider uppercase">RECRUITER</div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-1">
                      Drive creation, candidate invitations, and hiring decision log.
                    </p>
                  </div>
                  <div className="p-3.5 bg-[#fffbf0] rounded-xl border-0">
                    <div className="text-[10px] font-bold text-[#d97706] tracking-wider uppercase">PROCTOR</div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-1">
                      Real-time session monitoring, integrity flag review &amp; video evidence.
                    </p>
                  </div>
                  <div className="p-3.5 bg-[#f0fdf4] rounded-xl border-0">
                    <div className="text-[10px] font-bold text-[#16a34a] tracking-wider uppercase">EVALUATOR</div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-1">
                      Technical evaluation of code, SQL queries, and AI prompt traces.
                    </p>
                  </div>
                </div>

                {loadingStaff ? (
                  <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                    Loading staff roster…
                  </p>
                ) : (
                  <div className="border border-[#e2e8f0] rounded-xl divide-y divide-[#e2e8f0] overflow-hidden bg-white shadow-xs">
                    {staff.map((s, idx) => {
                      const isDemoAdmin = s.name?.toLowerCase().includes("admin") || s.role === "ADMIN";
                      const avatarBg = isDemoAdmin ? "bg-[#fee2e2] text-[#ef4444]" : "bg-[#dbeafe] text-[#2563eb]";
                      const badgeBg = isDemoAdmin
                        ? "text-[#ef4444] bg-[#fef2f2]"
                        : s.role === "PROCTOR"
                          ? "text-[#d97706] bg-[#fffbf0]"
                          : s.role === "EVALUATOR"
                            ? "text-[#16a34a] bg-[#f0fdf4]"
                            : "text-[#2563eb] bg-[#eff6ff]";

                      return (
                        <div key={s.id || idx} className="px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-[#fbfcfd] transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full ${avatarBg} font-bold text-xs flex items-center justify-center shrink-0`}>
                              {s.name ? s.name.charAt(0).toUpperCase() : "S"}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[#0d1424]">{s.name}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${badgeBg}`}>
                                  {s.role}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#64748b] mt-0.5">{s.email}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <select
                              value={s.role}
                              onChange={(e) => handleUpdateRole(s.id, e.target.value)}
                              className="px-3 py-1.5 text-xs text-[#334155] border border-[#e2e8f0] rounded-lg bg-white outline-none cursor-pointer hover:border-[#cbd5e1] focus:border-[#2f68ff]"
                            >
                              <option value="ADMIN">Admin</option>
                              <option value="RECRUITER">Recruiter</option>
                              <option value="PROCTOR">Proctor</option>
                              <option value="EVALUATOR">Evaluator</option>
                            </select>

                            <button
                              onClick={() => handleDeleteStaff(s.id, s.name)}
                              title="Remove staff member"
                              className="p-1.5 text-[#94a3b8] hover:text-[#ef4444] hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {staff.length === 0 && (
                      <div className="p-8 text-center text-ink-tertiary text-xs">
                        No staff members registered. Click "Add Staff Member" to grant access.
                      </div>
                    )}
                  </div>
                )}

                {/* Add Staff Modal */}
                {showAddStaffModal && (
                  <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white border border-line rounded-2xl max-w-[420px] w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
                      <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
                        <div className="flex items-center gap-2">
                          <UserPlus size={16} className="text-[#2f68ff]" />
                          <h3 className="text-sm font-bold text-[#0d1424]">Add New Staff Member</h3>
                        </div>
                        <button
                          onClick={() => setShowAddStaffModal(false)}
                          className="text-[#94a3b8] hover:text-ink cursor-pointer p-1 rounded-lg hover:bg-[#f1f5f9]"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
                        <div>
                          <label className="block font-semibold text-[#3d4b60] mb-1">Full Name</label>
                          <input
                            type="text"
                            required
                            value={newStaffName}
                            onChange={(e) => setNewStaffName(e.target.value)}
                            placeholder="e.g. Rachel Brooks"
                            className="w-full h-10 px-3 border border-[#e2e8f0] rounded-lg bg-white text-[#0d1424] text-xs outline-none focus:border-[#2f68ff]"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-[#3d4b60] mb-1">Email Address</label>
                          <input
                            type="email"
                            required
                            value={newStaffEmail}
                            onChange={(e) => setNewStaffEmail(e.target.value)}
                            placeholder="e.g. recruiter@example.com"
                            className="w-full h-10 px-3 border border-[#e2e8f0] rounded-lg bg-white text-[#0d1424] text-xs outline-none focus:border-[#2f68ff]"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-[#3d4b60] mb-1">Assigned Role</label>
                          <select
                            value={newStaffRole}
                            onChange={(e) => setNewStaffRole(e.target.value)}
                            className="w-full h-10 px-3 border border-[#e2e8f0] rounded-lg bg-white text-[#0d1424] text-xs outline-none focus:border-[#2f68ff]"
                          >
                            <option value="RECRUITER">Recruiter (Drives, Invites &amp; Hiring Decisions)</option>
                            <option value="ADMIN">Admin (Full System Governance &amp; Configuration)</option>
                            <option value="PROCTOR">Proctor (Live Monitoring &amp; Integrity Review)</option>
                            <option value="EVALUATOR">Evaluator (Technical Code &amp; Submission Grading)</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f1f5f9]">
                          <button
                            type="button"
                            onClick={() => setShowAddStaffModal(false)}
                            className="px-4 py-2 text-xs font-semibold text-[#64748b] hover:text-[#0d1424] rounded-full hover:bg-[#f1f5f9] cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={creatingStaff}
                            className="px-5 py-2 text-xs font-semibold text-white bg-[#2f68ff] hover:bg-[#1e54ea] disabled:opacity-50 rounded-full transition-all cursor-pointer shadow-xs"
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

            {/* Tab 3: Scoring & AI Intensity */}
            {activeTab === "scoring" && (
              <div className="max-w-[480px] space-y-6">
                <div>
                  <h2 className="text-sm font-bold text-[#0d1424]">
                    AI Proctoring Intensity &amp; Scoring Controls
                  </h2>
                  <p className="text-xs text-[#8c9ba5] mt-1">
                    Configure real-time monitoring strictness and score threshold levels.
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#3d4b60] mb-1.5">
                      AI Proctoring Intensity Level
                    </label>
                    <select
                      value={aiIntensity}
                      onChange={(e) => setAiIntensity(e.target.value)}
                      className="w-full h-11 px-4 border border-[#e2e8f0] rounded-lg text-xs text-[#0d1424] bg-white focus:border-[#2f68ff] outline-none shadow-xs"
                    >
                      <option value="HIGH">High (Strict — Flag multi-face &amp; tab switches quickly)</option>
                      <option value="MEDIUM">Medium (Balanced — Standard monitoring threshold)</option>
                      <option value="LOW">Low (Permissive — Minimum flags for minor shifts)</option>
                      <option value="STRICT">Strict (Maximum Enforcement — Instant alert triggers)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#3d4b60] mb-2">
                      AI Confidence Audit Level
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={aiThreshold}
                        onChange={(e) => setAiThreshold(parseFloat(e.target.value))}
                        className="flex-1 figma-slider"
                        style={{
                          background: `linear-gradient(to right, #2f68ff ${aiThreshold * 100}%, #e2e8f0 ${aiThreshold * 100}%)`,
                        }}
                      />
                      <span className="font-bold text-xs text-[#0d1424] w-12 text-right">
                        {Math.round(aiThreshold * 100)}%
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#3d4b60] mb-2">
                      Module Passing Score Threshold
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={passThreshold}
                        onChange={(e) => setPassThreshold(parseFloat(e.target.value))}
                        className="flex-1 figma-slider"
                        style={{
                          background: `linear-gradient(to right, #2f68ff ${passThreshold * 100}%, #e2e8f0 ${passThreshold * 100}%)`,
                        }}
                      />
                      <span className="font-bold text-xs text-[#0d1424] w-12 text-right">
                        {Math.round(passThreshold * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSaveScoring}
                    disabled={savingScoring}
                    className="px-6 py-2.5 text-xs font-semibold text-white bg-[#2f68ff] hover:bg-[#1e54ea] disabled:bg-blue-300 rounded-full shadow-sm transition-all cursor-pointer"
                  >
                    {savingScoring ? "Saving Scoring & AI Config…" : "Save Scoring & AI Config"}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 4: System Timing & Session Parameters */}
            {activeTab === "system" && (
              <div className="max-w-[480px] space-y-6">
                <div>
                  <h2 className="text-sm font-bold text-[#0d1424]">
                    System &amp; Session Integrity Parameters
                  </h2>
                  <p className="text-xs text-[#8c9ba5] mt-1">
                    Adjust session disconnect tolerances and heartbeat timeout thresholds.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#3d4b60] mb-1.5">
                      Heartbeat Stale Threshold (Seconds)
                    </label>
                    <input
                      type="number"
                      value={staleHeartbeat}
                      onChange={(e) => setStaleHeartbeat(parseInt(e.target.value) || 30)}
                      className="w-full h-11 px-4 border border-[#e2e8f0] rounded-lg text-sm text-[#0d1424] bg-white focus:border-[#2f68ff] outline-none shadow-xs"
                    />
                    <p className="text-[11px] text-[#8c9ba5] mt-1.5 leading-normal">
                      Time without heartbeat before session is marked connection degraded.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#3d4b60] mb-1.5">
                      Reconnection Grace Window (Seconds)
                    </label>
                    <input
                      type="number"
                      value={graceWindow}
                      onChange={(e) => setGraceWindow(parseInt(e.target.value) || 300)}
                      className="w-full h-11 px-4 border border-[#e2e8f0] rounded-lg text-sm text-[#0d1424] bg-white focus:border-[#2f68ff] outline-none shadow-xs"
                    />
                    <p className="text-[11px] text-[#8c9ba5] mt-1.5 leading-normal">
                      Allowed window for candidate to re-establish connection without termination.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#3d4b60] mb-1.5">
                      Maximum Disconnect Count Allowance
                    </label>
                    <input
                      type="number"
                      value={maxDisconnects}
                      onChange={(e) => setMaxDisconnects(parseInt(e.target.value) || 3)}
                      className="w-full h-11 px-4 border border-[#e2e8f0] rounded-lg text-sm text-[#0d1424] bg-white focus:border-[#2f68ff] outline-none shadow-xs"
                    />
                    <p className="text-[11px] text-[#8c9ba5] mt-1.5 leading-normal">
                      Max disconnects before requiring proctor manual review.
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSaveSystem}
                    disabled={savingSystem}
                    className="px-6 py-2.5 text-xs font-semibold text-white bg-[#2f68ff] hover:bg-[#1e54ea] disabled:bg-blue-300 rounded-full shadow-sm transition-all cursor-pointer"
                  >
                    {savingSystem ? "Saving System Parameters…" : "Save System Parameters"}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 5: Retention */}
            {activeTab === "retention" && (
              <div className="max-w-[480px] space-y-6">
                <div>
                  <h2 className="text-sm font-bold text-[#0d1424]">
                    Evidence &amp; Proctoring Retention Schedules
                  </h2>
                  <p className="text-xs text-[#8c9ba5] mt-1">
                    Define timelines for purging biometric clips and screenshots.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#3d4b60]">
                    Purge files after
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(parseInt(e.target.value) || 1)}
                      className="w-20 h-11 px-3 border border-[#e2e8f0] rounded-lg text-sm font-bold text-center text-[#0d1424] bg-white focus:border-[#2f68ff] outline-none shadow-xs"
                    />
                    <span className="text-xs font-medium text-[#64748b]">days</span>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleSaveRetention}
                    disabled={savingRetention}
                    className="px-6 py-2.5 text-xs font-semibold text-white bg-[#2f68ff] hover:bg-[#1e54ea] disabled:bg-blue-300 rounded-full shadow-sm transition-all cursor-pointer"
                  >
                    {savingRetention ? "Saving schedule…" : "Save Configurations"}
                  </button>
                </div>
              </div>
            )}


            {/* Tab 6: Audit Logs */}
            {activeTab === "audit" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-bold text-[#0d1424]">System Audit Logs</h2>
                    <p className="text-xs text-[#8c9ba5] mt-1">
                      Chronological record of all administrative operations.
                    </p>
                  </div>
                  <div className="relative w-64">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]"
                    />
                    <input
                      value={logsQuery}
                      onChange={(e) => setLogsQuery(e.target.value)}
                      placeholder="Search logs..."
                      className="w-full h-9 pl-9 pr-3 text-xs border border-[#e2e8f0] rounded-lg bg-white text-[#0d1424] outline-none focus:border-[#2f68ff] shadow-xs"
                    />
                  </div>
                </div>

                {loadingLogs ? (
                  <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                    Querying logs…
                  </p>
                ) : (
                  <div className="border border-[#e2e8f0] rounded-xl overflow-hidden bg-white shadow-xs">
                    <div className="grid grid-cols-[1.3fr_1.8fr_1fr_2.4fr_1.3fr] gap-3 px-4 py-2.5 border-b border-[#e2e8f0] bg-white font-sans text-[10px] uppercase tracking-wider font-bold text-[#64748b]">
                      <div>USER</div>
                      <div>ACTION</div>
                      <div>ENTITY</div>
                      <div>METADATA CONTEXT</div>
                      <div>TIMESTAMP</div>
                    </div>

                    <div className="divide-y divide-[#f1f5f9] max-h-[460px] overflow-y-auto">
                      {auditLogs.map((log) => (
                        <div
                          key={log.id}
                          className="grid grid-cols-[1.3fr_1.8fr_1fr_2.4fr_1.3fr] gap-3 px-4 py-3.5 items-center hover:bg-[#fbfcfd] transition-colors"
                        >
                          <div className="text-xs font-medium text-[#0d1424] truncate">
                            {log.staff?.name || "Demo Admin"}
                          </div>
                          <div className="text-xs font-bold text-[#2f68ff] font-mono truncate">
                            {log.action}
                          </div>
                          <div className="text-xs text-[#64748b] truncate">
                            {log.entityType}
                          </div>
                          <div
                            className="text-xs font-mono text-[#64748b] truncate"
                            title={typeof log.metadata === "object" ? JSON.stringify(log.metadata) : String(log.metadata || "")}
                          >
                            {typeof log.metadata === "object" ? JSON.stringify(log.metadata) : String(log.metadata || "—")}
                          </div>
                          <div className="text-xs font-mono text-[#64748b] whitespace-nowrap">
                            {log.occurredAt ? log.occurredAt.slice(0, 16).replace("T", " ") : "—"}
                          </div>
                        </div>
                      ))}
                      {auditLogs.length === 0 && (
                        <div className="p-8 text-center text-xs text-[#8c9ba5]">
                          No audit logs found matching search query.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 7: Integrations */}
            {activeTab === "integrations" && (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-bold text-[#0d1424]">Partner API Integrations</h2>
                    <p className="text-xs text-[#8c9ba5] mt-1">
                      Manage external ATS partner API credentials, rate limits, and callback configurations.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCreatePartnerModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2f68ff] hover:bg-[#1e54ea] rounded-full transition-all cursor-pointer shadow-sm shrink-0"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    <span>Register Partner</span>
                  </button>
                </div>

                {loadingPartners ? (
                  <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                    Loading partner integration records…
                  </p>
                ) : partners.length === 0 ? (
                  <div className="p-12 text-center border border-dashed border-[#e2e8f0] rounded-xl space-y-2 bg-white">
                    <Key className="w-8 h-8 text-[#94a3b8] mx-auto" />
                    <p className="text-sm font-bold text-[#0d1424]">No Partner API Keys Configured</p>
                    <p className="text-xs text-[#8c9ba5]">Register an external ATS partner to issue X-API-Key credentials.</p>
                  </div>
                ) : (
                  <div className="border border-[#e2e8f0] rounded-xl overflow-hidden bg-white shadow-xs">
                    <div className="grid grid-cols-[2fr_1.2fr_1fr_1.2fr_1fr_1.2fr_0.9fr] gap-3 px-4 py-2.5 border-b border-[#e2e8f0] bg-white font-sans text-[10px] uppercase tracking-wider font-bold text-[#64748b]">
                      <div>PARTNER NAME</div>
                      <div>RATE LIMIT</div>
                      <div>API HITS</div>
                      <div>CALLBACK URL</div>
                      <div>STATUS</div>
                      <div>CREATED</div>
                      <div className="text-center tracking-widest">ACTIONS</div>
                    </div>

                    <div className="divide-y divide-[#f1f5f9]">
                      {partners.map((p) => (
                        <div
                          key={p.id}
                          className="grid grid-cols-[2fr_1.2fr_1fr_1.2fr_1fr_1.2fr_0.9fr] gap-3 px-4 py-3.5 items-center hover:bg-[#fbfcfd] transition-colors"
                        >
                          <div>
                            <p className="text-xs font-bold text-[#0d1424]">{p.name}</p>
                            <p className="text-[10px] font-mono text-[#94a3b8] truncate">{p.id}</p>
                          </div>
                          <div className="text-xs text-[#64748b]">{p.rateLimit} req/min</div>
                          <div className="text-xs font-bold text-[#2f68ff]">
                            {(p as any).apiHitCount ?? 0} hits
                          </div>
                          <div
                            className="text-xs text-[#8c9ba5] italic truncate"
                            title={p.callbackUrl || "None"}
                          >
                            {p.callbackUrl || "None"}
                          </div>
                          <div>
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                p.isRevoked
                                  ? "bg-[#fef2f2] text-[#ef4444]"
                                  : "bg-[#f0fdf4] text-[#16a34a]"
                              }`}
                            >
                              {p.isRevoked ? "REVOKED" : "ACTIVE"}
                            </span>
                          </div>
                          <div className="text-xs text-[#64748b]">
                            {p.createdAt
                              ? new Date(p.createdAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "2-digit",
                                })
                              : "—"}
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setConfirmRotatePartner(p)}
                              className="p-1.5 text-[#94a3b8] hover:text-[#2f68ff] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Rotate API Key"
                            >
                              <RefreshCw size={13} />
                            </button>
                            <button
                              onClick={() => setEditingPartner({ ...p })}
                              className="p-1.5 text-[#94a3b8] hover:text-[#2f68ff] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Partner Config"
                            >
                              <Edit3 size={13} />
                            </button>
                            {!p.isRevoked && (
                              <button
                                onClick={() => setConfirmRevokePartner(p)}
                                className="p-1.5 text-[#94a3b8] hover:text-[#ef4444] hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Revoke Partner Key"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 8: Assessment Modules */}
            {activeTab === "modules" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-bold text-[#0d1424]">Assessment Modules</h2>
                  <p className="text-xs text-[#8c9ba5] mt-1">
                    Configure the global availability of assessment modules per department. Enabling a module makes it available for Drive configurations.
                  </p>
                </div>

                {loadingModules ? (
                  <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                    Loading assessment module configurations…
                  </p>
                ) : (
                  <div className="border border-[#e2e8f0] rounded-xl overflow-x-auto shadow-xs bg-white text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[#e2e8f0] bg-white font-sans text-[10px] uppercase tracking-wider font-bold text-[#64748b]">
                          <th className="px-4 py-3 text-left min-w-[200px]">Department</th>
                          {[
                            { key: "MCQ", label: "MCQ" },
                            { key: "SQL", label: "SQL" },
                            { key: "NOSQL", label: "NoSQL" },
                            { key: "CODING", label: "Coding" },
                            { key: "DEBUGGING", label: "Debugging" },
                            { key: "AI_PROMPTING", label: "AI Prompt" },
                            { key: "SIMULATION", label: "Simulation" },
                            { key: "TEST_SCENARIOS", label: "Test Scenarios" },
                          ].map((m) => (
                            <th
                              key={m.key}
                              className={`px-3 py-3 text-center transition-colors whitespace-nowrap min-w-[85px] ${
                                hoveredCell?.mod === m.key ? "bg-blue-50/60 text-[#2f68ff]" : ""
                              }`}
                            >
                              {m.label}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-right whitespace-nowrap min-w-[130px]">Bulk Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f1f5f9] text-xs">
                        {[
                          { key: "SOFTWARE_ENGINEERING", label: "Software Engineering" },
                          { key: "DATA_ENGINEERING", label: "Data Engineering" },
                          { key: "QA", label: "QA & Testing" },
                          { key: "SRE", label: "Site Reliability (SRE)" },
                          { key: "SYSOPS", label: "System Operations" },
                          { key: "ITOPS", label: "IT Operations" },
                          { key: "SECOPS", label: "Security Operations" },
                          { key: "PMO", label: "PMO / Management" },
                        ].map((d) => {
                          const modulesList = [
                            "MCQ",
                            "SQL",
                            "NOSQL",
                            "CODING",
                            "DEBUGGING",
                            "AI_PROMPTING",
                            "SIMULATION",
                            "TEST_SCENARIOS",
                          ];
                          const isRowHovered = hoveredCell?.dept === d.key;
                          const enabledCount = modulesList.filter((mod) => {
                            const s = moduleSettings.find(
                              (item) => item.department === d.key && item.moduleType === mod
                            );
                            return s ? s.isEnabled : false;
                          }).length;
                          const isBulkSaving = savingModule === `bulk-${d.key}`;

                          return (
                            <tr
                              key={d.key}
                              className={`transition-colors ${
                                isRowHovered ? "bg-blue-50/40" : "hover:bg-[#fbfcfd]"
                              }`}
                            >
                              <td className="px-4 py-3 font-bold text-[#0d1424]">
                                <div className="flex items-center gap-2">
                                  <span>{d.label}</span>
                                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded-full bg-[#f8fafc] text-[#64748b] border border-[#e2e8f0]">
                                    {enabledCount}/{modulesList.length}
                                  </span>
                                </div>
                              </td>

                              {modulesList.map((mod) => {
                                const setting = moduleSettings.find(
                                  (s) => s.department === d.key && s.moduleType === mod
                                );
                                const isEnabled = setting ? setting.isEnabled : false;
                                const cellKey = `${d.key}-${mod}`;
                                const isSaving = savingModule === cellKey || isBulkSaving;
                                const isCellHovered =
                                  hoveredCell?.dept === d.key && hoveredCell?.mod === mod;
                                const isColHovered = hoveredCell?.mod === mod;

                                return (
                                  <td
                                    key={mod}
                                    onMouseEnter={() => setHoveredCell({ dept: d.key, mod })}
                                    onMouseLeave={() => setHoveredCell(null)}
                                    className={`px-3 py-3 text-center transition-colors ${
                                      isCellHovered
                                        ? "bg-blue-50"
                                        : isColHovered
                                          ? "bg-blue-50/50"
                                          : isRowHovered
                                            ? "bg-blue-50/30"
                                            : ""
                                    }`}
                                  >
                                    <label className="inline-flex items-center justify-center p-1 rounded-md hover:bg-black/5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isEnabled}
                                        disabled={isSaving || !isAdmin}
                                        onChange={() => handleToggleModule(d.key, mod, isEnabled)}
                                        className="rounded border-[#cbd5e1] text-[#2f68ff] focus:ring-[#2f68ff]/30 w-4 h-4 cursor-pointer disabled:opacity-50"
                                      />
                                    </label>
                                  </td>
                                );
                              })}

                              <td className="px-4 py-3 text-right font-medium">
                                <div className="flex items-center justify-end gap-2 text-xs">
                                  <button
                                    onClick={() => handleBulkDepartmentModules(d.key, true)}
                                    disabled={isBulkSaving || !isAdmin || enabledCount === modulesList.length}
                                    className="text-[#2f68ff] hover:underline disabled:opacity-30 disabled:no-underline cursor-pointer font-semibold"
                                    title="Enable all modules for this department"
                                  >
                                    Select All
                                  </button>
                                  <span className="text-[#cbd5e1]">|</span>
                                  <button
                                    onClick={() => handleBulkDepartmentModules(d.key, false)}
                                    disabled={isBulkSaving || !isAdmin || enabledCount === 0}
                                    className="text-rose-500 hover:underline disabled:opacity-30 disabled:no-underline cursor-pointer font-semibold"
                                    title="Clear all modules for this department"
                                  >
                                    Clear All
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Create Partner */}
      {showCreatePartnerModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-[#e2e8f0] space-y-4">
            <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
              <div className="flex items-center gap-2">
                <Key size={16} className="text-[#2f68ff]" />
                <h3 className="text-sm font-bold text-[#0d1424]">Register Partner API Key</h3>
              </div>
              <button onClick={() => setShowCreatePartnerModal(false)} className="text-[#94a3b8] hover:text-[#0d1424] cursor-pointer p-1 rounded-lg hover:bg-[#f1f5f9]">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreatePartner} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3d4b60] mb-1">Partner Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Greenhouse ATS"
                  value={newPartnerName}
                  onChange={(e) => setNewPartnerName(e.target.value)}
                  className="w-full h-10 px-3 border border-[#e2e8f0] rounded-lg bg-white text-[#0d1424] text-xs outline-none focus:border-[#2f68ff]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3d4b60] mb-1">Rate Limit (requests / min)</label>
                <input
                  type="number"
                  min={1}
                  value={newPartnerRateLimit}
                  onChange={(e) => setNewPartnerRateLimit(parseInt(e.target.value) || 100)}
                  className="w-full h-10 px-3 border border-[#e2e8f0] rounded-lg bg-white text-[#0d1424] text-xs outline-none focus:border-[#2f68ff]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3d4b60] mb-1">Callback URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://ats.partner.com/webhooks/cd-recruit"
                  value={newPartnerCallbackUrl}
                  onChange={(e) => setNewPartnerCallbackUrl(e.target.value)}
                  className="w-full h-10 px-3 border border-[#e2e8f0] rounded-lg bg-white text-[#0d1424] text-xs outline-none focus:border-[#2f68ff]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f1f5f9]">
                <button
                  type="button"
                  onClick={() => setShowCreatePartnerModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#64748b] hover:text-[#0d1424] rounded-full hover:bg-[#f1f5f9] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPartner}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#2f68ff] hover:bg-[#1e54ea] disabled:opacity-50 rounded-full transition-all cursor-pointer shadow-xs"
                >
                  {creatingPartner ? "Generating Key…" : "Generate API Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Display Raw API Key */}
      {newlyCreatedKey && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-[#e2e8f0] space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <Check className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-[#0d1424]">API Key Issued for {newlyCreatedKey.partnerName}</h3>
            </div>
            <p className="text-xs text-amber-800 bg-[#fffbf0] border border-[#fde68a] p-3 rounded-xl leading-relaxed">
              <strong>Copy this API key now.</strong> For security reasons, you will not be able to view it again.
            </p>
            <div className="p-3 bg-[#0d1424] rounded-xl font-mono text-xs text-emerald-400 break-all flex items-center justify-between gap-2">
              <span>{newlyCreatedKey.apiKey}</span>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(newlyCreatedKey.apiKey);
                  toast.success("API key copied to clipboard!");
                }}
                className="px-3 py-1 text-xs font-sans font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-full cursor-pointer shrink-0"
              >
                Copy
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setNewlyCreatedKey(null)}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#2f68ff] hover:bg-[#1e54ea] rounded-full cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Rotate Key */}
      {confirmRotatePartner && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-[#e2e8f0] space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <RefreshCw className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-[#0d1424]">Rotate API Key for {confirmRotatePartner.name}?</h3>
            </div>
            <p className="text-xs text-[#64748b] leading-relaxed">
              Rotating this API key will immediately invalidate the active key for <strong>{confirmRotatePartner.name}</strong>. Existing integration calls using the old key will fail. This action will be logged in the Audit Log.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f1f5f9]">
              <button
                onClick={() => setConfirmRotatePartner(null)}
                className="px-4 py-2 text-xs font-semibold text-[#64748b] hover:text-[#0d1424] rounded-full hover:bg-[#f1f5f9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRotateKey}
                className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-full shadow-xs cursor-pointer"
              >
                Confirm Rotate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Revoke Partner */}
      {confirmRevokePartner && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-[#e2e8f0] space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <Lock className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-[#0d1424]">Revoke Partner Access for {confirmRevokePartner.name}?</h3>
            </div>
            <p className="text-xs text-[#64748b] leading-relaxed">
              Revoking access will immediately block all API requests from <strong>{confirmRevokePartner.name}</strong>. This action will be recorded in the Audit Log.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f1f5f9]">
              <button
                onClick={() => setConfirmRevokePartner(null)}
                className="px-4 py-2 text-xs font-semibold text-[#64748b] hover:text-[#0d1424] rounded-full hover:bg-[#f1f5f9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRevokePartner}
                className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-full shadow-xs cursor-pointer"
              >
                Confirm Revoke
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Partner */}
      {editingPartner && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-[#e2e8f0] space-y-4">
            <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
              <h3 className="text-sm font-bold text-[#0d1424]">Edit Partner: {editingPartner.name}</h3>
              <button onClick={() => setEditingPartner(null)} className="text-[#94a3b8] hover:text-[#0d1424] cursor-pointer p-1 rounded-lg hover:bg-[#f1f5f9]">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleUpdatePartner} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3d4b60] mb-1">Partner Name</label>
                <input
                  type="text"
                  required
                  value={editingPartner.name}
                  onChange={(e) => setEditingPartner({ ...editingPartner, name: e.target.value })}
                  className="w-full h-10 px-3 border border-[#e2e8f0] rounded-lg bg-white text-[#0d1424] text-xs outline-none focus:border-[#2f68ff]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3d4b60] mb-1">Rate Limit (requests / min)</label>
                <input
                  type="number"
                  min={1}
                  value={editingPartner.rateLimit}
                  onChange={(e) => setEditingPartner({ ...editingPartner, rateLimit: parseInt(e.target.value) || 100 })}
                  className="w-full h-10 px-3 border border-[#e2e8f0] rounded-lg bg-white text-[#0d1424] text-xs outline-none focus:border-[#2f68ff]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3d4b60] mb-1">Callback URL</label>
                <input
                  type="url"
                  placeholder="https://ats.partner.com/webhooks/cd-recruit"
                  value={editingPartner.callbackUrl || ""}
                  onChange={(e) => setEditingPartner({ ...editingPartner, callbackUrl: e.target.value })}
                  className="w-full h-10 px-3 border border-[#e2e8f0] rounded-lg bg-white text-[#0d1424] text-xs outline-none focus:border-[#2f68ff]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f1f5f9]">
                <button
                  type="button"
                  onClick={() => setEditingPartner(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#64748b] hover:text-[#0d1424] rounded-full hover:bg-[#f1f5f9] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#2f68ff] hover:bg-[#1e54ea] rounded-full shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

