import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Users,
  Sliders,
  Shield,
  ShieldCheck,
  FileText,
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
  RotateCcw,
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
  const [activeTab, setActiveTab] = useState<"profile" | "users" | "permissions" | "scoring" | "system" | "retention" | "audit" | "integrations" | "modules">("profile");

  // Dynamic Role Permissions state
  const [permissionsMatrix, setPermissionsMatrix] = useState<Record<string, string[]>>({});
  const [permissionDescriptors, setPermissionDescriptors] = useState<any[]>([]);
  const [matrixRoles, setMatrixRoles] = useState<string[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [savingPermissionKey, setSavingPermissionKey] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resettingPermissions, setResettingPermissions] = useState(false);

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

  const loadPermissions = async () => {
    setLoadingPermissions(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/permissions`, { headers });
      if (!res.ok) throw new Error("Failed to load permissions matrix");
      const data = await res.json();
      if (data?.matrix) {
        setPermissionsMatrix(data.matrix);
        setPermissionDescriptors(data.descriptors || []);
        setMatrixRoles(data.roles || []);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load permissions");
    } finally {
      setLoadingPermissions(false);
    }
  };

  const handleTogglePermission = async (role: string, permissionKey: string, currentVal: boolean) => {
    if (role === "ADMIN") {
      toast.error("Superadmin permissions cannot be modified");
      return;
    }

    const cellKey = `${role}-${permissionKey}`;
    setSavingPermissionKey(cellKey);

    // Optimistic UI update
    setPermissionsMatrix((prev) => {
      const perms = new Set(prev[role] || []);
      if (!currentVal) {
        perms.add(permissionKey);
      } else {
        perms.delete(permissionKey);
      }
      return {
        ...prev,
        [role]: Array.from(perms),
      };
    });

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/permissions`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role,
          permission: permissionKey,
          isEnabled: !currentVal,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update role permission");
      }

      toast.success(
        !currentVal
          ? `Granted ${permissionKey} to ${role.replace("_", " ")}`
          : `Revoked ${permissionKey} from ${role.replace("_", " ")}`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update permission");
      loadPermissions(); // rollback
    } finally {
      setSavingPermissionKey(null);
    }
  };

  const handleResetPermissions = async () => {
    setResettingPermissions(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/permissions/reset`, {
        method: "POST",
        headers,
      });

      if (!res.ok) throw new Error("Failed to reset permissions");
      const data = await res.json();
      if (data?.matrix) {
        setPermissionsMatrix(data.matrix);
      }
      toast.success("Role permissions restored to system defaults");
      setShowResetModal(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset permissions");
    } finally {
      setResettingPermissions(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users") loadStaffList();
    if (activeTab === "permissions") loadPermissions();
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

  return (
    <AppShell title="Settings & Administration">
      <div className="flex gap-8">
        {/* Navigation Tabs Side */}
        <div className="w-[180px] shrink-0 flex flex-col gap-1 text-sm-minus">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "profile"
                ? "bg-white border border-line text-brand shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Users size={14} />
            Admin Profile
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "users"
                ? "bg-white border border-line text-brand shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Users size={14} />
            Staff & Roles
          </button>
          <button
            onClick={() => setActiveTab("permissions")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "permissions"
                ? "bg-white border border-line text-brand shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <ShieldCheck size={14} />
            Roles &amp; Permissions
          </button>
          <button
            onClick={() => setActiveTab("scoring")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "scoring"
                ? "bg-white border border-line text-brand shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Sliders size={14} />
            AI & Scoring
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "system"
                ? "bg-white border border-line text-brand shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Sliders size={14} />
            System Timing
          </button>
          <button
            onClick={() => setActiveTab("retention")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "retention"
                ? "bg-white border border-line text-brand shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Shield size={14} />
            Data Retention
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "audit"
                ? "bg-white border border-line text-brand shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <FileText size={14} />
            Audit Logs
          </button>
          <button
            onClick={() => setActiveTab("integrations")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "integrations"
                ? "bg-white border border-line text-brand shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Key size={14} />
            Integrations
          </button>
          <button
            onClick={() => setActiveTab("modules")}
            className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-left cursor-pointer ${
              activeTab === "modules"
                ? "bg-white border border-line text-brand shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Sliders size={14} />
            Assessment Modules
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 min-w-0 bg-white border border-line rounded-lg p-6">
          {/* Tab 0: Admin Profile */}
          {activeTab === "profile" && (
            <div className="max-w-[480px] space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Admin Account Details
                </h3>
                <p className="text-xs-plus text-ink-tertiary mt-0.5">
                  Manage your administrator display name and email address.
                </p>
              </div>

              <div className="space-y-4 text-sm-minus">
                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1">
                    Display Name
                  </label>
                  <input
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded bg-white text-ink"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1">
                    Admin Email
                  </label>
                  <input
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded bg-white text-ink"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1">
                    System Role
                  </label>
                  <div className="px-3 py-2 border border-line rounded bg-canvas text-ink-secondary font-mono text-xs">
                    ADMIN (Full Privileges & Governance)
                  </div>
                </div>
              </div>

              <button
                onClick={() => toast.success("Admin Profile details updated successfully")}
                className="px-4 py-2 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover shadow-sm transition-colors cursor-pointer"
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
                  <h3 className="text-sm font-semibold text-ink">
                    Manage Staff &amp; Team Permissions
                  </h3>
                  <p className="text-xs-plus text-ink-tertiary mt-0.5">
                    Add team members, assign operational roles, and manage system privileges:
                  </p>
                </div>
                <button
                  onClick={() => setShowAddStaffModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-md transition-colors cursor-pointer shadow-sm"
                >
                  <UserPlus size={14} /> Add Staff Member
                </button>
              </div>

              {/* Roles Breakdown Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <div className="text-xs-plus font-mono font-bold text-rose-700 uppercase">ADMIN</div>
                  <p className="text-xs-plus text-ink-secondary mt-1 leading-snug">Full access to settings, system timing, staff roles & audit logs.</p>
                </div>
                <div className="p-3 bg-brand-subtle border border-brand-border rounded-lg">
                  <div className="text-xs-plus font-mono font-bold text-brand-ink uppercase">RECRUITER</div>
                  <p className="text-xs-plus text-ink-secondary mt-1 leading-snug">Drive creation, candidate invitations, and hiring decision log.</p>
                </div>
                <div className="p-3 bg-warning-subtle border border-warning-border rounded-lg">
                  <div className="text-xs-plus font-mono font-bold text-amber-800 uppercase">PROCTOR</div>
                  <p className="text-xs-plus text-ink-secondary mt-1 leading-snug">Real-time session monitoring, integrity flag review & video evidence.</p>
                </div>
                <div className="p-3 bg-success-subtle border border-success-border rounded-lg">
                  <div className="text-xs-plus font-mono font-bold text-emerald-800 uppercase">EVALUATOR</div>
                  <p className="text-xs-plus text-ink-secondary mt-1 leading-snug">Technical evaluation of code, SQL queries, and AI prompt traces.</p>
                </div>
              </div>

              {loadingStaff ? (
                <p className="text-center font-mono text-xs text-ink-tertiary py-6">
                  Loading staff roster…
                </p>
              ) : (
                <div className="border border-line rounded-lg divide-y divide-surface-inset overflow-hidden bg-white shadow-sm">
                  {staff.map((s) => (
                    <div key={s.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-canvas">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-subtle border border-brand-border text-brand font-bold text-xs flex items-center justify-center font-mono shrink-0">
                          {s.name ? s.name.charAt(0).toUpperCase() : "S"}
                        </div>
                        <div>
                          <div className="text-sm-minus font-semibold text-ink flex items-center gap-2">
                            <span>{s.name}</span>
                            <span className={`px-2 py-0.5 rounded text-2xs font-mono font-bold border uppercase ${
                              s.role === "ADMIN"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : s.role === "HR_LEAD"
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  : s.role === "HR_ASSOCIATE"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : s.role === "REVIEWER"
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                      : "bg-slate-50 text-slate-700 border-slate-200"
                            }`}>
                              {s.role}
                            </span>
                          </div>
                          <div className="text-xs-plus text-ink-secondary font-mono">{s.email}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <select
                          value={s.role}
                          onChange={(e) => handleUpdateRole(s.id, e.target.value)}
                          className="px-2.5 py-1 text-xs font-medium border border-line rounded-md bg-white text-ink outline-none shadow-sm cursor-pointer"
                        >
                          <option value="ADMIN">Admin (Superadmin)</option>
                          <option value="HR_LEAD">HR Lead / Manager</option>
                          <option value="HR_ASSOCIATE">HR Associate / Recruiter</option>
                          <option value="REVIEWER">Technical Evaluator</option>
                          <option value="RECRUITER">Recruiter (Legacy)</option>
                        </select>

                        <button
                          onClick={() => handleDeleteStaff(s.id, s.name)}
                          title="Remove staff member"
                          className="p-1.5 text-ink-tertiary hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {staff.length === 0 && (
                    <div className="p-6 text-center text-ink-tertiary text-xs">
                      No staff members registered. Click "Add Staff Member" to grant access.
                    </div>
                  )}
                </div>
              )}

              {/* Add Staff Modal */}
              {showAddStaffModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white border border-line rounded-xl max-w-[420px] w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between border-b border-surface-inset pb-3">
                      <div className="flex items-center gap-2">
                        <UserPlus size={16} className="text-brand" />
                        <h3 className="text-md font-semibold text-ink">Add New Staff Member</h3>
                      </div>
                      <button
                        onClick={() => setShowAddStaffModal(false)}
                        className="text-ink-tertiary hover:text-ink cursor-pointer"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <form onSubmit={handleCreateStaff} className="space-y-4 text-sm-minus">
                      <div>
                        <label className="block text-xs font-medium text-ink-secondary mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          value={newStaffName}
                          onChange={(e) => setNewStaffName(e.target.value)}
                          placeholder="e.g. Sarah Connor"
                          className="w-full px-3 py-2 border border-line rounded-md bg-white text-ink text-sm-minus outline-none focus:border-brand"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-ink-secondary mb-1">Email Address</label>
                        <input
                          type="email"
                          required
                          value={newStaffEmail}
                          onChange={(e) => setNewStaffEmail(e.target.value)}
                          placeholder="e.g. sarah@company.com"
                          className="w-full px-3 py-2 border border-line rounded-md bg-white text-ink text-sm-minus outline-none focus:border-brand"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-ink-secondary mb-1">Assigned Role</label>
                        <select
                          value={newStaffRole}
                          onChange={(e) => setNewStaffRole(e.target.value)}
                          className="w-full px-3 py-2 border border-line rounded-md bg-white text-ink text-sm-minus outline-none focus:border-brand"
                        >
                          <option value="HR_LEAD">HR Lead / Manager (Decisions, Evaluations &amp; Governance)</option>
                          <option value="HR_ASSOCIATE">HR Associate (Drives &amp; Candidate Ingestion)</option>
                          <option value="ADMIN">Admin (Superadmin — Full Platform Access)</option>
                          <option value="REVIEWER">Technical Evaluator (Submission Scoring)</option>
                          <option value="RECRUITER">Recruiter (Legacy Full Access)</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-inset">
                        <button
                          type="button"
                          onClick={() => setShowAddStaffModal(false)}
                          className="px-3.5 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink border border-line rounded-md hover:bg-canvas cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={creatingStaff}
                          className="px-4 py-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-hover disabled:opacity-50 rounded-md transition-colors cursor-pointer shadow-sm"
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

          {/* Tab: Dynamic Roles & Permissions Matrix */}
          {activeTab === "permissions" && (
            <div className="space-y-6">
              <div className="flex items-start justify-between border-b border-line pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-brand" />
                    <h3 className="text-md font-semibold text-ink">
                      Dynamic Role-Based Access Control (RBAC)
                    </h3>
                  </div>
                  <p className="text-xs-plus text-ink-tertiary mt-1 max-w-2xl">
                    Configure platform action permissions for each role dynamically.
                    Toggle capabilities ON or OFF to grant or restrict access instantly without code changes.
                  </p>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => setShowResetModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink border border-line rounded-md hover:bg-canvas transition-colors cursor-pointer shadow-sm"
                  >
                    <RotateCcw size={13} />
                    Reset to Defaults
                  </button>
                )}
              </div>

              {loadingPermissions ? (
                <div className="py-12 text-center text-ink-tertiary text-xs">
                  Loading role permissions matrix…
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Iterate by Category */}
                  {Array.from(new Set(permissionDescriptors.map((d) => d.category))).map((category) => {
                    const descriptorsInCategory = permissionDescriptors.filter((d) => d.category === category);
                    return (
                      <div key={category} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                            {category}
                          </h4>
                          <div className="h-px flex-1 bg-surface-inset" />
                        </div>

                        <div className="border border-line rounded-lg overflow-hidden bg-white shadow-xs">
                          <table className="w-full text-left text-xs-plus border-collapse">
                            <thead>
                              <tr className="bg-canvas border-b border-line text-xs font-semibold text-ink-secondary">
                                <th className="py-3 px-4 w-2/5">Capability / Action</th>
                                <th className="py-3 px-3 text-center w-[15%]">
                                  <div className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-2xs font-bold tracking-wide">
                                    <Lock size={10} /> ADMIN
                                  </div>
                                </th>
                                <th className="py-3 px-3 text-center w-[15%]">
                                  <div className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-2xs font-bold tracking-wide">
                                    HR LEAD
                                  </div>
                                </th>
                                <th className="py-3 px-3 text-center w-[15%]">
                                  <div className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-2xs font-bold tracking-wide">
                                    HR ASSOCIATE
                                  </div>
                                </th>
                                <th className="py-3 px-3 text-center w-[15%]">
                                  <div className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-2xs font-bold tracking-wide">
                                    REVIEWER
                                  </div>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {descriptorsInCategory.map((desc) => {
                                return (
                                  <tr key={desc.key} className="hover:bg-canvas/50 transition-colors">
                                    <td className="py-3 px-4">
                                      <div className="font-medium text-ink">{desc.name}</div>
                                      <div className="text-2xs text-ink-tertiary mt-0.5">{desc.description}</div>
                                      <div className="text-3xs font-mono text-ink-quaternary mt-0.5">{desc.key}</div>
                                    </td>

                                    {/* ADMIN Column (Always ON, locked) */}
                                    <td className="py-3 px-3 text-center">
                                      <div className="inline-flex items-center justify-center">
                                        <div className="relative inline-flex h-5 w-9 shrink-0 cursor-not-allowed rounded-full bg-brand/80 border-2 border-transparent transition-colors duration-200 ease-in-out opacity-75">
                                          <span className="translate-x-4 pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out" />
                                        </div>
                                      </div>
                                    </td>

                                    {/* Configurable Roles Columns */}
                                    {["HR_LEAD", "HR_ASSOCIATE", "REVIEWER"].map((roleKey) => {
                                      const isEnabled = (permissionsMatrix[roleKey] || []).includes(desc.key);
                                      const isSaving = savingPermissionKey === `${roleKey}-${desc.key}`;

                                      return (
                                        <td key={roleKey} className="py-3 px-3 text-center">
                                          <div className="inline-flex items-center justify-center">
                                            <button
                                              type="button"
                                              disabled={!isAdmin || isSaving}
                                              onClick={() => handleTogglePermission(roleKey, desc.key, isEnabled)}
                                              title={
                                                !isAdmin
                                                  ? "Only Admins can change role permissions"
                                                  : `Toggle ${desc.name} for ${roleKey}`
                                              }
                                              className={`relative inline-flex h-5 w-9 shrink-0 ${
                                                !isAdmin ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                                              } rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                isEnabled ? "bg-brand" : "bg-line hover:bg-line-strong"
                                              }`}
                                            >
                                              <span
                                                className={`${
                                                  isEnabled ? "translate-x-4" : "translate-x-0"
                                                } pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out`}
                                              />
                                            </button>
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Reset to Defaults Confirmation Modal */}
              {showResetModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white border border-line rounded-xl max-w-[400px] w-full p-6 shadow-xl space-y-4">
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertCircle size={20} />
                      <h3 className="text-md font-semibold text-ink">Reset Role Permissions?</h3>
                    </div>
                    <p className="text-xs text-ink-secondary">
                      This will restore all capabilities for <strong>HR Lead</strong>, <strong>HR Associate</strong>, and <strong>Reviewer</strong> back to their factory default settings.
                    </p>
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-inset">
                      <button
                        type="button"
                        onClick={() => setShowResetModal(false)}
                        className="px-3.5 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink border border-line rounded-md hover:bg-canvas cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={resettingPermissions}
                        onClick={handleResetPermissions}
                        className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-md transition-colors cursor-pointer shadow-sm"
                      >
                        {resettingPermissions ? "Resetting…" : "Confirm Reset"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Scoring & AI Intensity */}
          {activeTab === "scoring" && (
            <div className="max-w-[440px] space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  AI Proctoring Intensity &amp; Scoring Controls
                </h3>
                <p className="text-xs-plus text-ink-tertiary mt-0.5">
                  Configure real-time monitoring strictness and score threshold levels:
                </p>
              </div>

              <div className="space-y-4 text-sm-minus">
                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1">
                    AI Proctoring Intensity Level
                  </label>
                  <select
                    value={aiIntensity}
                    onChange={(e) => setAiIntensity(e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded bg-white text-ink text-sm-minus outline-none"
                  >
                    <option value="LOW">Low (Permissive — Minimum flags for minor shifts)</option>
                    <option value="MEDIUM">Medium (Balanced — Standard monitoring threshold)</option>
                    <option value="HIGH">High (Strict — Flag multi-face & tab switches quickly)</option>
                    <option value="STRICT">Strict (Maximum Enforcement — Instant alert triggers)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-ink-secondary mb-1">
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
                    <span className="font-mono font-semibold text-ink w-12 text-right">
                      {Math.round(aiThreshold * 100)}%
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-ink-secondary mb-1">
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
                    <span className="font-mono font-semibold text-ink w-12 text-right">
                      {Math.round(passThreshold * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveScoring}
                disabled={savingScoring}
                className="px-4 py-2 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover disabled:bg-brand-border shadow-sm transition-colors cursor-pointer"
              >
                {savingScoring ? "Saving Config…" : "Save Scoring & AI Config"}
              </button>
            </div>
          )}

          {/* Tab 3: System Timing & Session Parameters */}
          {activeTab === "system" && (
            <div className="max-w-[440px] space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  System &amp; Session Integrity Parameters
                </h3>
                <p className="text-xs-plus text-ink-tertiary mt-0.5">
                  Adjust session disconnect tolerances and heartbeat timeout thresholds:
                </p>
              </div>

              <div className="space-y-4 text-sm-minus">
                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1">
                    Heartbeat Stale Threshold (Seconds)
                  </label>
                  <input
                    type="number"
                    value={staleHeartbeat}
                    onChange={(e) => setStaleHeartbeat(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2 border border-line rounded bg-white text-ink"
                  />
                  <p className="text-2xs text-ink-tertiary mt-1">Time without heartbeat before session is marked connection degraded.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1">
                    Reconnection Grace Window (Seconds)
                  </label>
                  <input
                    type="number"
                    value={graceWindow}
                    onChange={(e) => setGraceWindow(parseInt(e.target.value) || 300)}
                    className="w-full px-3 py-2 border border-line rounded bg-white text-ink"
                  />
                  <p className="text-2xs text-ink-tertiary mt-1">Allowed window for candidate to re-establish connection without termination.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1">
                    Maximum Disconnect Count Allowance
                  </label>
                  <input
                    type="number"
                    value={maxDisconnects}
                    onChange={(e) => setMaxDisconnects(parseInt(e.target.value) || 3)}
                    className="w-full px-3 py-2 border border-line rounded bg-white text-ink"
                  />
                  <p className="text-2xs text-ink-tertiary mt-1">Max disconnects before requiring proctor manual review.</p>
                </div>
              </div>

              <button
                onClick={handleSaveSystem}
                disabled={savingSystem}
                className="px-4 py-2 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover disabled:bg-brand-border shadow-sm transition-colors cursor-pointer"
              >
                {savingSystem ? "Saving System Parameters…" : "Save System Parameters"}
              </button>
            </div>
          )}

          {/* Tab 4: Retention */}
          {activeTab === "retention" && (
            <div className="max-w-[420px] space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Evidence &amp; Proctoring Retention Schedules
                </h3>
                <p className="text-xs-plus text-ink-tertiary mt-0.5">
                  Define timelines for purging biometric clips and screenshots:
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs text-ink-secondary mb-1">Purge files after</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(parseInt(e.target.value) || 1)}
                    className="w-20 px-2 py-1.5 border border-line rounded text-sm-minus"
                  />
                  <span className="text-sm-minus text-ink-secondary">days</span>
                </div>
              </div>

              <button
                onClick={handleSaveRetention}
                disabled={savingRetention}
                className="px-4 py-2 text-xs font-medium text-white bg-brand rounded hover:bg-brand-hover disabled:bg-brand-border shadow-sm transition-colors cursor-pointer"
              >
                {savingRetention ? "Saving schedule…" : "Save Configurations"}
              </button>
            </div>
          )}

          {/* Tab 5: Audit */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink">System Audit Logs</h3>
                  <p className="text-xs-plus text-ink-tertiary mt-0.5">
                    Chronological record of all administrative operations:
                  </p>
                </div>
                <div className="relative w-[200px]">
                  <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
                  />
                  <input
                    value={logsQuery}
                    onChange={(e) => setLogsQuery(e.target.value)}
                    placeholder="Search logs…"
                    className="w-full pl-8 pr-2.5 py-1 text-xs border border-line rounded bg-white"
                  />
                </div>
              </div>

              {loadingLogs ? (
                <p className="text-center font-mono text-xs text-ink-tertiary py-4">
                  Querying logs…
                </p>
              ) : (
                <div className="border border-line rounded-md overflow-hidden text-xs">
                  <div className="grid grid-cols-[1.5fr_1.8fr_1fr_2.5fr_1.5fr] gap-3 px-3 py-2 border-b border-line bg-canvas font-mono text-2xs uppercase tracking-wide text-ink-secondary">
                    <div>User</div>
                    <div>Action</div>
                    <div>Entity</div>
                    <div>Metadata Context</div>
                    <div>Timestamp</div>
                  </div>

                  <div className="divide-y divide-surface-inset max-h-[360px] overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="grid grid-cols-[1.5fr_1.8fr_1fr_2.5fr_1.5fr] gap-3 p-3 items-center"
                      >
                        <div className="truncate font-medium">{log.staff.name}</div>
                        <div className="font-mono text-xs-plus text-brand-ink truncate">
                          {log.action}
                        </div>
                        <div className="font-mono text-xs-plus text-ink-secondary">{log.entityType}</div>
                        <div
                          className="font-mono text-2xs text-ink-secondary truncate"
                          title={JSON.stringify(log.metadata)}
                        >
                          {JSON.stringify(log.metadata)}
                        </div>
                        <div className="font-mono text-xs-plus text-ink-tertiary">
                          {log.occurredAt.slice(0, 16).replace("T", " ")}
                        </div>
                      </div>
                    ))}
                    {auditLogs.length === 0 && (
                      <p className="text-center py-6 text-xs text-ink-tertiary">
                        No logs found matching search query.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 6: Integrations */}
          {activeTab === "integrations" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-ink">Partner API Integrations</h3>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Manage external ATS partner API credentials, rate limits, and callback configurations.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreatePartnerModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-brand rounded-md hover:bg-brand-hover shadow-sm transition-colors cursor-pointer"
                >
                  <Plus size={14} /> Register Partner
                </button>
              </div>

              {loadingPartners ? (
                <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                  Loading partner integration records…
                </p>
              ) : partners.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-line rounded-xl space-y-2">
                  <Key className="w-8 h-8 text-ink-tertiary mx-auto" />
                  <p className="text-sm font-semibold text-ink">No Partner API Keys Configured</p>
                  <p className="text-xs text-ink-secondary">Register an external ATS partner to issue X-API-Key credentials.</p>
                </div>
              ) : (
                <div className="border border-line rounded-xl overflow-hidden shadow-xs bg-white text-xs">
                  <div className="grid grid-cols-[1.6fr_1fr_1fr_1.6fr_1fr_1fr_1.2fr] gap-3 px-4 py-2.5 border-b border-line bg-canvas font-mono text-2xs uppercase tracking-wide font-semibold text-ink-secondary">
                    <div>Partner Name</div>
                    <div>Rate Limit</div>
                    <div>API Hits</div>
                    <div>Callback URL</div>
                    <div>Status</div>
                    <div>Created</div>
                    <div className="text-right">Actions</div>
                  </div>

                  <div className="divide-y divide-surface-inset">
                    {partners.map((p) => (
                      <div key={p.id} className="grid grid-cols-[1.6fr_1fr_1fr_1.6fr_1fr_1fr_1.2fr] gap-3 px-4 py-3.5 items-center hover:bg-canvas transition-colors">
                        <div>
                          <p className="font-bold text-ink">{p.name}</p>
                          <p className="text-2xs font-mono text-ink-tertiary truncate">{p.id}</p>
                        </div>
                        <div className="font-mono text-xs text-ink-secondary">{p.rateLimit} req/min</div>
                        <div className="font-mono text-xs font-semibold text-brand">{(p as any).apiHitCount ?? 0} hits</div>
                        <div className="font-mono text-xs text-ink-secondary truncate" title={p.callbackUrl || "Not configured"}>
                          {p.callbackUrl ? (
                            <span className="flex items-center gap-1 text-brand">
                              <Globe size={12} /> {p.callbackUrl}
                            </span>
                          ) : (
                            <span className="text-ink-tertiary italic">None</span>
                          )}
                        </div>
                        <div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-2xs font-mono font-bold uppercase ${
                              p.isRevoked ? "bg-rose-100 text-rose-800 border border-rose-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}
                          >
                            {p.isRevoked ? "Revoked" : "Active"}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-ink-tertiary">
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setConfirmRotatePartner(p)}
                            className="p-1.5 text-ink-secondary hover:text-brand hover:bg-brand-subtle border border-line rounded-md transition-all cursor-pointer"
                            title="Rotate API Key"
                          >
                            <RefreshCw size={13} />
                          </button>
                          <button
                            onClick={() => setEditingPartner({ ...p })}
                            className="p-1.5 text-ink-secondary hover:text-brand hover:bg-brand-subtle border border-line rounded-md transition-all cursor-pointer"
                            title="Edit Partner Config"
                          >
                            <Edit3 size={13} />
                          </button>
                          {!p.isRevoked && (
                            <button
                              onClick={() => setConfirmRevokePartner(p)}
                              className="p-1.5 text-ink-secondary hover:text-rose-700 hover:bg-rose-50 border border-line rounded-md transition-all cursor-pointer"
                              title="Revoke Partner Key"
                            >
                              <Lock size={13} />
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

          {/* Tab 7: Assessment Modules */}
          {activeTab === "modules" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-ink">Assessment Modules</h3>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Configure the global availability of assessment modules per department. Enabling a module makes it available for Drive configurations.
                </p>
              </div>

              {loadingModules ? (
                <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                  Loading assessment module configurations…
                </p>
              ) : (
                <div className="border border-line rounded-xl overflow-x-auto shadow-xs bg-white text-xs">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-line bg-canvas font-mono text-2xs uppercase tracking-wider font-semibold text-ink-secondary">
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
                              hoveredCell?.mod === m.key ? "bg-brand-subtle text-brand" : ""
                            }`}
                          >
                            {m.label}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right whitespace-nowrap min-w-[130px]">Bulk Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line text-xs">
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
                              isRowHovered ? "bg-brand-subtle/60" : "hover:bg-canvas/70"
                            }`}
                          >
                            <td className="px-4 py-3 font-semibold text-ink">
                              <div className="flex items-center gap-2">
                                <span>{d.label}</span>
                                <span className="px-1.5 py-0.5 text-2xs font-mono font-medium rounded-full bg-canvas text-ink-secondary border border-line">
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
                                      ? "bg-brand-subtle"
                                      : isColHovered
                                        ? "bg-brand-subtle/50"
                                        : isRowHovered
                                          ? "bg-brand-subtle/60"
                                          : ""
                                  }`}
                                >
                                  <label className="inline-flex items-center justify-center p-1 rounded-md hover:bg-black/5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isEnabled}
                                      disabled={isSaving || !isAdmin}
                                      onChange={() => handleToggleModule(d.key, mod, isEnabled)}
                                      className="rounded border-brand-border text-brand focus:ring-brand/30 w-4 h-4 cursor-pointer disabled:opacity-50"
                                    />
                                  </label>
                                </td>
                              );
                            })}

                            <td className="px-4 py-3 text-right font-medium">
                              <div className="flex items-center justify-end gap-2 text-xs-plus">
                                <button
                                  onClick={() => handleBulkDepartmentModules(d.key, true)}
                                  disabled={isBulkSaving || !isAdmin || enabledCount === modulesList.length}
                                  className="text-brand hover:underline disabled:opacity-30 disabled:no-underline cursor-pointer"
                                  title="Enable all modules for this department"
                                >
                                  Select All
                                </button>
                                <span className="text-ink-tertiary">|</span>
                                <button
                                  onClick={() => handleBulkDepartmentModules(d.key, false)}
                                  disabled={isBulkSaving || !isAdmin || enabledCount === 0}
                                  className="text-rose-500 hover:underline disabled:opacity-30 disabled:no-underline cursor-pointer"
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

      {/* Modal: Create Partner */}
      {showCreatePartnerModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Register Partner API Key</h3>
              <button onClick={() => setShowCreatePartnerModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreatePartner} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Partner Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Greenhouse ATS"
                  value={newPartnerName}
                  onChange={(e) => setNewPartnerName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Rate Limit (requests / min)</label>
                <input
                  type="number"
                  min={1}
                  value={newPartnerRateLimit}
                  onChange={(e) => setNewPartnerRateLimit(parseInt(e.target.value) || 100)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Callback URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://ats.partner.com/webhooks/cd-recruit"
                  value={newPartnerCallbackUrl}
                  onChange={(e) => setNewPartnerCallbackUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-brand"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreatePartnerModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPartner}
                  className="px-4 py-2 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg shadow-sm cursor-pointer"
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <Check className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-gray-900">API Key Issued for {newlyCreatedKey.partnerName}</h3>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg leading-relaxed">
              <strong>Copy this API key now.</strong> For security reasons, you will not be able to view it again.
            </p>
            <div className="p-3 bg-gray-900 rounded-lg font-mono text-xs text-emerald-400 break-all flex items-center justify-between gap-2">
              <span>{newlyCreatedKey.apiKey}</span>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(newlyCreatedKey.apiKey);
                  toast.success("API key copied to clipboard!");
                }}
                className="px-2.5 py-1 text-xs-plus font-sans font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer shrink-0"
              >
                Copy
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setNewlyCreatedKey(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Rotate Key */}
      {confirmRotatePartner && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <RefreshCw className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-gray-900">Rotate API Key for {confirmRotatePartner.name}?</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Rotating this API key will immediately invalidate the active key for <strong>{confirmRotatePartner.name}</strong>. Existing integration calls using the old key will fail. This action will be logged in the Audit Log.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmRotatePartner(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRotateKey}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm cursor-pointer"
              >
                Confirm Rotate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Revoke Partner */}
      {confirmRevokePartner && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <Lock className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-gray-900">Revoke Partner Access for {confirmRevokePartner.name}?</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Revoking access will immediately block all API requests from <strong>{confirmRevokePartner.name}</strong>. This action will be recorded in the Audit Log.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmRevokePartner(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRevokePartner}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm cursor-pointer"
              >
                Confirm Revoke
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Partner */}
      {editingPartner && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Edit Partner: {editingPartner.name}</h3>
              <button onClick={() => setEditingPartner(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleUpdatePartner} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Partner Name</label>
                <input
                  type="text"
                  required
                  value={editingPartner.name}
                  onChange={(e) => setEditingPartner({ ...editingPartner, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Rate Limit (requests / min)</label>
                <input
                  type="number"
                  min={1}
                  value={editingPartner.rateLimit}
                  onChange={(e) => setEditingPartner({ ...editingPartner, rateLimit: parseInt(e.target.value) || 100 })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Callback URL</label>
                <input
                  type="url"
                  placeholder="https://ats.partner.com/webhooks/cd-recruit"
                  value={editingPartner.callbackUrl || ""}
                  onChange={(e) => setEditingPartner({ ...editingPartner, callbackUrl: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-brand"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPartner(null)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg shadow-sm cursor-pointer"
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
