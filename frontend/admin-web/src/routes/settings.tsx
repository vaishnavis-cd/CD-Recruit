import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useMemo } from "react";
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
  ShieldAlert,
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
  IdCard,
  UsersRound,
  LayoutGrid,
  Gauge,
  ScanFace,
  BrainCircuit,
  Database,
  ClipboardList,
  PlugZap,
} from "lucide-react";

import { AppShell } from "../components/app-shell";
import { useStore, API_BASE, getAuthHeaders } from "../lib/store";
import { type AuditLog } from "../lib/types";
import { getUserProfile } from "../lib/auth";

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    "DRIVE_CREATE",
    "CANDIDATE_INGEST_CSV",
    "DRIVE_MANAGE",
    "CANDIDATE_VIEW",
    "DECISION_SUBMIT",
    "MANUAL_SCORING_REVIEW",
    "IDENTITY_VERIFICATION_APPROVE",
    "PROCTORING_TRIAGE",
    "ROLE_TEMPLATE_EDIT",
    "QUESTION_BANK_MANAGE",
    "PARTNER_API_MANAGE",
    "SETTINGS_MANAGE",
    "AUDIT_LOG_VIEW",
  ],
  HR_LEAD: [
    "CANDIDATE_VIEW",
    "DECISION_SUBMIT",
    "MANUAL_SCORING_REVIEW",
    "IDENTITY_VERIFICATION_APPROVE",
    "PROCTORING_TRIAGE",
    "ROLE_TEMPLATE_EDIT",
    "AUDIT_LOG_VIEW",
  ],
  HR_ASSOCIATE: [
    "DRIVE_CREATE",
    "CANDIDATE_INGEST_CSV",
    "DRIVE_MANAGE",
    "CANDIDATE_VIEW",
    "PROCTORING_TRIAGE",
  ],
  REVIEWER: [
    "CANDIDATE_VIEW",
    "MANUAL_SCORING_REVIEW",
  ],
};

const DEFAULT_PERMISSION_DESCRIPTORS = [
  {
    key: "DRIVE_CREATE",
    name: "Create Drives",
    description: "Create assessment drives and configure candidate parameters",
    category: "Drive Logistics",
  },
  {
    key: "CANDIDATE_INGEST_CSV",
    name: "Upload Candidate CSV",
    description: "Upload candidate spreadsheets and generate batch invite links",
    category: "Drive Logistics",
  },
  {
    key: "DRIVE_MANAGE",
    name: "Manage Drives & Links",
    description: "Archive/cancel drives, resend assessment links, and extend deadlines",
    category: "Drive Logistics",
  },
  {
    key: "CANDIDATE_VIEW",
    name: "View Candidate Submissions",
    description: "View candidate scores, module responses, test executions, and code",
    category: "Candidate Evaluation",
  },
  {
    key: "DECISION_SUBMIT",
    name: "Submit Advance / Reject Decisions",
    description: "Make final hiring decisions (ADVANCE / REJECT) and record reviewer notes",
    category: "Candidate Evaluation",
  },
  {
    key: "MANUAL_SCORING_REVIEW",
    name: "Manual Code & Rubric Grading",
    description: "Submit technical evaluation scores, say-do remarks, and module rubrics",
    category: "Candidate Evaluation",
  },
  {
    key: "IDENTITY_VERIFICATION_APPROVE",
    name: "Approve Identity Verification",
    description: "Review facial/ID comparisons and manually verify candidate identity",
    category: "Identity & Integrity",
  },
  {
    key: "PROCTORING_TRIAGE",
    name: "Proctoring Flag & Appeal Triage",
    description: "Review webcam/screen evidence clips, triage integrity flags, and resolve appeals",
    category: "Identity & Integrity",
  },
  {
    key: "ROLE_TEMPLATE_EDIT",
    name: "Calibrate & Edit Role Templates",
    description: "Create and update role templates, module allocations, and passing cutoffs",
    category: "Templates & Question Bank",
  },
  {
    key: "QUESTION_BANK_MANAGE",
    name: "Manage Question Bank",
    description: "Create, edit, and delete questions across all assessment modules",
    category: "Templates & Question Bank",
  },
  {
    key: "PARTNER_API_MANAGE",
    name: "Manage Partner ATS Integrations",
    description: "Register external ATS partners and generate/rotate API keys",
    category: "Administration",
  },
  {
    key: "SETTINGS_MANAGE",
    name: "System Settings & Staff",
    description: "Configure scoring rules, biometric retention, and staff role assignments",
    category: "Administration",
  },
  {
    key: "AUDIT_LOG_VIEW",
    name: "View Platform Audit Logs",
    description: "Inspect compliance audit trails and security event logs",
    category: "Administration",
  },
];

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
  const [activeTab, setActiveTab] = useState<
    "profile" | "users" | "permissions" | "modules" | "calibration" | "proctoring" | "scoring" | "system" | "retention" | "audit" | "integrations"
  >("profile");

  // Dynamic Role Permissions Matrix state
  const [permissionsMatrix, setPermissionsMatrix] = useState<Record<string, string[]>>(DEFAULT_ROLE_PERMISSIONS);
  const [permissionDescriptors, setPermissionDescriptors] = useState<Array<{ key: string; name: string; description: string; category: string }>>(DEFAULT_PERMISSION_DESCRIPTORS);
  const [permissionRoles, setPermissionRoles] = useState<string[]>(["ADMIN", "HR_LEAD", "HR_ASSOCIATE", "REVIEWER"]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [savingPermission, setSavingPermission] = useState<string | null>(null);
  const [showResetPermissionsModal, setShowResetPermissionsModal] = useState(false);
  const [resettingPermissions, setResettingPermissions] = useState(false);

  // Assessment Modules Settings state
  const [moduleSettings, setModuleSettings] = useState<any[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [savingModule, setSavingModule] = useState<string | null>(null);

  // Admin Profile state - dynamic from local storage or authenticated user profile
  const [adminName, setAdminName] = useState(() => {
    try {
      const saved = localStorage.getItem("proctora_admin_profile");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name) return parsed.name;
      }
    } catch { }
    const p = getUserProfile();
    return p?.name || "Lead Proctor Admin";
  });
  const [adminEmail, setAdminEmail] = useState(() => {
    try {
      const saved = localStorage.getItem("proctora_admin_profile");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.email) return parsed.email;
      }
    } catch { }
    const p = getUserProfile();
    return p?.email || "admin@proctora.com";
  });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const startEditProfile = () => {
    setEditName(adminName);
    setEditEmail(adminEmail);
    setIsEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setIsEditingProfile(false);
  };

  const handleSaveProfile = () => {
    if (!editName.trim()) {
      toast.error("Display Name cannot be empty");
      return;
    }
    if (!editEmail.trim() || !editEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSavingProfile(true);
    try {
      const trimmedName = editName.trim();
      const trimmedEmail = editEmail.trim();
      setAdminName(trimmedName);
      setAdminEmail(trimmedEmail);
      localStorage.setItem(
        "proctora_admin_profile",
        JSON.stringify({ name: trimmedName, email: trimmedEmail })
      );
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new Event("admin_profile_updated"));
      setIsEditingProfile(false);
      toast.success("Admin Profile details updated successfully");
    } catch (e) {
      toast.error("Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };
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
  const [retentionDays, setRetentionDays] = useState(45);
  const [savingRetention, setSavingRetention] = useState(false);

  // Calibration & Time Matrix state
  const [timeMatrix, setTimeMatrix] = useState<Record<string, { EASY: number; MEDIUM: number; HARD: number }>>({
    MCQ: { EASY: 1, MEDIUM: 2, HARD: 3 },
    SQL: { EASY: 3, MEDIUM: 6, HARD: 12 },
    NOSQL: { EASY: 3, MEDIUM: 6, HARD: 12 },
    CODING: { EASY: 6, MEDIUM: 12, HARD: 22 },
    DEBUGGING: { EASY: 5, MEDIUM: 10, HARD: 18 },
    AI_PROMPTING: { EASY: 4, MEDIUM: 7, HARD: 12 },
    SIMULATION: { EASY: 6, MEDIUM: 12, HARD: 22 },
    TEST_SCENARIOS: { EASY: 3, MEDIUM: 6, HARD: 12 },
  });
  const [seniorityRatios, setSeniorityRatios] = useState<Record<string, { easy: number; medium: number; hard: number }>>({
    fresher: { easy: 0.50, medium: 0.40, hard: 0.10 },
    l1: { easy: 0.30, medium: 0.50, hard: 0.20 },
    l2: { easy: 0.15, medium: 0.50, hard: 0.35 },
    l3: { easy: 0.10, medium: 0.45, hard: 0.45 },
  });
  const [savingCalibration, setSavingCalibration] = useState(false);

  // Proctoring & Biometric Thresholds state
  const [proctoringThresholds, setProctoringThresholds] = useState({
    faceThreshold: 0.68,
    nameThreshold: 0.75,
    lookingAwayThresholdMs: 800,
    voiceSensitivityThreshold: 40,
    voiceSustainedMs: 3500,
    cooldowns: {
      PHONE_DETECTED: 15000,
      HEADPHONES_DETECTED: 15000,
      BOOK_DETECTED: 15000,
      FACE_MISSING: 10000,
      LOOKING_AWAY: 10000,
      EXCESSIVE_MOVEMENT: 10000,
      MULTIPLE_FACES: 1000,
      SEAT_EXIT: 0,
      TAB_SWITCH: 5000,
      PASTE: 5000,
      FULLSCREEN_EXIT: 10000,
      SPEECH_DETECTED: 10000,
      SECOND_VOICE_SUSPECTED: 15000,
      IDENTITY_MISMATCH: 15000,
    } as Record<string, number>,
  });
  const [savingProctoring, setSavingProctoring] = useState(false);

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
  const [partnerFilter, setPartnerFilter] = useState<"all" | "active" | "revoked">("all");
  const [partnerActionLoading, setPartnerActionLoading] = useState(false);

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
    setPartnerActionLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/partners/${confirmRevokePartner.id}/revoke`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to revoke partner");
      setConfirmRevokePartner(null);
      toast.success(`Partner "${confirmRevokePartner.name}" revoked`);
      loadPartnerList();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke partner");
    } finally {
      setPartnerActionLoading(false);
    }
  };

  const handleDeletePartner = async () => {
    if (!confirmRevokePartner) return;
    setPartnerActionLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/partners/${confirmRevokePartner.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to delete partner");
      toast.success(`Partner "${confirmRevokePartner.name}" permanently deleted`);
      setConfirmRevokePartner(null);
      loadPartnerList();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete partner");
    } finally {
      setPartnerActionLoading(false);
    }
  };

  const filteredPartners = useMemo(() => {
    return partners.filter((p) => {
      if (partnerFilter === "active") return !p.isRevoked;
      if (partnerFilter === "revoked") return p.isRevoked;
      return true;
    });
  }, [partners, partnerFilter]);

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
  const [newStaffTempPassword, setNewStaffTempPassword] = useState("");
  const [newStaffRequirePwChange, setNewStaffRequirePwChange] = useState(true);
  const [creatingStaff, setCreatingStaff] = useState(false);

  // Reset Password Modal state
  const [showResetPwModal, setShowResetPwModal] = useState(false);
  const [selectedStaffForReset, setSelectedStaffForReset] = useState<any | null>(null);
  const [resetPwValue, setResetPwValue] = useState("");
  const [resetPwTemporary, setResetPwTemporary] = useState(true);
  const [resettingPw, setResettingPw] = useState(false);

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

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
          tempPassword: newStaffTempPassword || undefined,
          temporary: newStaffRequirePwChange,
          requirePasswordChange: newStaffRequirePwChange,
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
      setNewStaffTempPassword("");
      setNewStaffRequirePwChange(true);
      loadStaffList();
    } catch (err: any) {
      toast.error(err.message || "Failed to create staff member");
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffForReset) return;
    setResettingPw(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/staff/${selectedStaffForReset.id}/reset-password`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPassword: resetPwValue || undefined,
          temporary: resetPwTemporary,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to reset password");
      }
      const data = await res.json();
      toast.success(data.message || (data.newPassword ? `Temporary password set to: ${data.newPassword}` : "Password reset successfully."));
      setShowResetPwModal(false);
      setSelectedStaffForReset(null);
      setResetPwValue("");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setResettingPw(false);
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

  const loadCalibrationConfig = async () => {
    try {
      const headers = await getAuthHeaders();
      const [matrixRes, ratiosRes] = await Promise.all([
        fetch(`${API_BASE}/admin/settings/time-matrix`, { headers }),
        fetch(`${API_BASE}/admin/settings/seniority-ratios`, { headers }),
      ]);
      if (matrixRes.ok) {
        const matrixData = await matrixRes.json();
        if (matrixData) setTimeMatrix(matrixData);
      }
      if (ratiosRes.ok) {
        const ratiosData = await ratiosRes.json();
        if (ratiosData) setSeniorityRatios(ratiosData);
      }
    } catch (err) {
      console.error("Failed to load calibration config:", err);
    }
  };

  const handleSaveCalibration = async () => {
    setSavingCalibration(true);
    try {
      const headers = await getAuthHeaders();
      const [matrixRes, ratiosRes] = await Promise.all([
        fetch(`${API_BASE}/admin/settings/time-matrix`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ timeMatrix }),
        }),
        fetch(`${API_BASE}/admin/settings/seniority-ratios`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ seniorityRatios }),
        }),
      ]);
      if (!matrixRes.ok || !ratiosRes.ok) throw new Error("Failed to save calibration settings");
      toast.success("Time matrix and difficulty curves saved successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to save calibration settings");
    } finally {
      setSavingCalibration(false);
    }
  };

  const loadProctoringThresholds = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/proctoring`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data) setProctoringThresholds(data);
      }
    } catch (err) {
      console.error("Failed to load proctoring thresholds:", err);
    }
  };

  const handleSaveProctoringThresholds = async () => {
    setSavingProctoring(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/proctoring`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(proctoringThresholds),
      });
      if (!res.ok) throw new Error("Failed to save proctoring thresholds");
      toast.success("Proctoring & biometric thresholds saved successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to save proctoring thresholds");
    } finally {
      setSavingProctoring(false);
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

  const loadPermissionsMatrix = async () => {
    setLoadingPermissions(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/settings/permissions`, { headers });
      if (!res.ok) throw new Error("Failed to load permissions matrix");
      const data = await res.json();
      if (data?.matrix) {
        setPermissionsMatrix(data.matrix);
      }
      if (Array.isArray(data?.descriptors) && data.descriptors.length > 0) {
        setPermissionDescriptors(data.descriptors);
      } else {
        setPermissionDescriptors(DEFAULT_PERMISSION_DESCRIPTORS);
      }
      if (Array.isArray(data?.roles) && data.roles.length > 0) {
        setPermissionRoles(data.roles);
      }
    } catch (err: any) {
      console.error("Failed to load permissions matrix:", err);
      // Fallback
      if (Object.keys(permissionsMatrix).length === 0) {
        setPermissionsMatrix(DEFAULT_ROLE_PERMISSIONS);
      }
      if (permissionDescriptors.length === 0) {
        setPermissionDescriptors(DEFAULT_PERMISSION_DESCRIPTORS);
      }
    } finally {
      setLoadingPermissions(false);
    }
  };

  const handleTogglePermission = async (role: string, permission: string, currentVal: boolean) => {
    if (role === "ADMIN") {
      toast.info("Superadmin role has full privileges across all capabilities and cannot be modified.");
      return;
    }
    const key = `${role}-${permission}`;
    setSavingPermission(key);

    const nextVal = !currentVal;
    // Optimistic UI update
    setPermissionsMatrix((prev) => {
      const currentList = prev[role] || DEFAULT_ROLE_PERMISSIONS[role] || [];
      const updatedList = nextVal
        ? Array.from(new Set([...currentList, permission]))
        : currentList.filter((p) => p !== permission);
      return { ...prev, [role]: updatedList };
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
          permission,
          isEnabled: nextVal,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update permission");
      }

      const data = await res.json();
      if (data?.matrix) {
        setPermissionsMatrix(data.matrix);
      }
      toast.success(`${permission.replace(/_/g, " ")} for ${role.replace(/_/g, " ")} ${nextVal ? "enabled" : "disabled"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle permission");
      loadPermissionsMatrix();
    } finally {
      setSavingPermission(null);
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

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to reset permissions");
      }

      const data = await res.json();
      if (data?.matrix) {
        setPermissionsMatrix(data.matrix);
      } else {
        setPermissionsMatrix(DEFAULT_ROLE_PERMISSIONS);
      }
      setShowResetPermissionsModal(false);
      toast.success("All role permissions reset to default matrix");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset permissions");
    } finally {
      setResettingPermissions(false);
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
    if (activeTab === "permissions") loadPermissionsMatrix();
    if (activeTab === "modules") loadModuleSettings();
    if (activeTab === "calibration") loadCalibrationConfig();
    if (activeTab === "proctoring") loadProctoringThresholds();
    if (activeTab === "scoring") loadScoringConfig();
    if (activeTab === "system") loadSystemConfig();
    if (activeTab === "retention") loadRetentionConfig();
    if (activeTab === "audit") loadAuditLogs();
    if (activeTab === "integrations") loadPartnerList();
  }, [activeTab, logsQuery]);

  const groupedDescriptors = useMemo(() => {
    const list = permissionDescriptors.length > 0 ? permissionDescriptors : DEFAULT_PERMISSION_DESCRIPTORS;
    const groups: Record<string, typeof list> = {};
    for (const item of list) {
      const cat = item.category || "General Platform Capabilities";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [permissionDescriptors]);

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

  const TABS = [
    { id: "profile", label: "Admin Profile", icon: IdCard },
    { id: "users", label: "Staff & Roles", icon: UsersRound },
    { id: "permissions", label: "Roles & Permissions", icon: ShieldCheck },
    { id: "modules", label: "Assessment Modules", icon: LayoutGrid },
    { id: "calibration", label: "Time & Difficulty", icon: Gauge },
    { id: "proctoring", label: "Proctoring & Biometrics", icon: ScanFace },
    { id: "scoring", label: "AI & Scoring", icon: BrainCircuit },
    { id: "system", label: "System Timing", icon: AlarmClock },
    { id: "retention", label: "Data Retention", icon: Database },
    { id: "audit", label: "Audit Logs", icon: ClipboardList },
    { id: "integrations", label: "Integrations", icon: PlugZap },
  ] as const;

  return (
    <AppShell hideHeader={true}>
      <div className="max-w-[1320px] mx-auto w-full pb-20">
        {/* Main Header */}
        <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight mb-8">
          Settings &amp; Administration
        </h1>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Navigation Tabs Side (Sticky on desktop) */}
          <div className="w-full lg:w-[220px] shrink-0 lg:sticky lg:top-6 self-start flex flex-row lg:flex-col gap-1.5 overflow-x-auto no-scrollbar lg:overflow-x-visible pb-2 lg:pb-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2.5 px-4 h-[35px] rounded-full text-left transition-all cursor-pointer whitespace-nowrap text-[13px] ${active
                      ? "border border-[#2E5DE0] bg-white text-[#2E5DE0] font-semibold shadow-xs"
                      : "text-[#64748B] hover:text-[#0F172A] hover:bg-white/50 font-normal"
                    }`}
                >
                  <Icon size={15} className={`shrink-0 ${active ? "text-[#2E5DE0]" : "text-[#64748B]"}`} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
          {/* Main Content Area */}
          <div className="flex-1 min-w-0 bg-white border border-[#E2E8F0] rounded-[16px] p-6 lg:p-8 shadow-xs">
            {/* Tab 1: Admin Profile */}
            {activeTab === "profile" && (
              <div className="max-w-[560px] space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                  <div>
                    <h2 className="text-[16px] font-bold text-[#0F172A]">Admin Account Details</h2>
                    <p className="text-[12px] text-[#64748B] mt-0.5">
                      Manage your administrator display identity, email address, and permissions.
                    </p>
                  </div>
                  {!isEditingProfile && (
                    <button
                      onClick={startEditProfile}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold text-[#2563EB] hover:text-white bg-[#EFF6FF] hover:bg-[#2563EB] border border-[#BFDBFE] hover:border-[#2563EB] rounded-[8px] transition-all cursor-pointer shadow-xs"
                    >
                      <Edit3 size={13} />
                      <span>Edit Profile</span>
                    </button>
                  )}
                </div>

                {/* Profile Visual Badge & Summary */}
                <div className="flex items-center gap-4 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px]">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white flex items-center justify-center text-sm font-bold shadow-xs shrink-0">
                    {adminName
                      .split(" ")
                      .map((w: string) => w[0])
                      .join("")
                      .substring(0, 2)
                      .toUpperCase() || "AD"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold text-[#0F172A] truncate">{adminName}</span>
                      <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] rounded-full">
                        VERIFIED ADMIN
                      </span>
                    </div>
                    <p className="text-[12px] text-[#64748B] truncate mt-0.5">{adminEmail}</p>
                  </div>
                </div>

                {/* Edit Mode Form vs View Mode */}
                {isEditingProfile ? (
                  <div className="space-y-4 pt-1">
                    <div>
                      <label className="block text-[12px] font-semibold text-[#475569] mb-1.5">
                        Display Name
                      </label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full h-[39px] px-3.5 border border-[#2563EB] ring-2 ring-[#2563EB]/10 rounded-[8px] text-[13px] text-[#0F172A] bg-white outline-none transition-all"
                        placeholder="e.g. Lead Proctor Admin"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-semibold text-[#475569] mb-1.5">
                        Admin Email
                      </label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full h-[39px] px-3.5 border border-[#2563EB] ring-2 ring-[#2563EB]/10 rounded-[8px] text-[13px] text-[#0F172A] bg-white outline-none transition-all"
                        placeholder="e.g. admin@proctora.com"
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-semibold text-[#475569] mb-1.5">
                        System Governance Role
                      </label>
                      <input
                        disabled
                        value="ADMIN (Full Privileges & Governance)"
                        className="w-full h-[39px] px-3.5 border border-[#E2E8F0] rounded-[8px] text-[13px] text-[#64748B] bg-[#F8FAFC] cursor-not-allowed select-none"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-3">
                      <button
                        onClick={handleSaveProfile}
                        disabled={savingProfile}
                        className="flex items-center gap-1.5 px-5 h-[36px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-full shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Check size={14} strokeWidth={2.5} />
                        <span>{savingProfile ? "Saving…" : "Save Changes"}</span>
                      </button>
                      <button
                        onClick={cancelEditProfile}
                        className="px-4 h-[36px] text-[12px] font-medium text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 rounded-full transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <div className="p-3.5 border border-[#E2E8F0] rounded-[8px] bg-white">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Display Name</div>
                      <div className="text-[13px] font-semibold text-[#0F172A] mt-1">{adminName}</div>
                    </div>
                    <div className="p-3.5 border border-[#E2E8F0] rounded-[8px] bg-white">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Email Address</div>
                      <div className="text-[13px] font-mono text-[#0F172A] mt-1">{adminEmail}</div>
                    </div>
                    <div className="p-3.5 border border-[#E2E8F0] rounded-[8px] bg-[#F8FAFC]">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">System Role &amp; Privileges</div>
                      <div className="text-[13px] font-semibold text-[#2563EB] mt-1">ADMIN (Full Privileges &amp; Governance)</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Staff & Roles */}
            {activeTab === "users" && (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[16px] font-bold text-[#0F172A]">Manage Staff &amp; Team Permissions</h2>
                    <p className="text-[12px] text-[#64748B] mt-1">
                      Add team members, assign operational roles, and manage system privileges.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddStaffModal(true)}
                    className="flex items-center gap-1.5 px-4 h-[32px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[10px] transition-all cursor-pointer shadow-xs shrink-0"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    <span>Add Staff Member</span>
                  </button>
                </div>

                {/* Roles Breakdown Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="p-4 bg-[#FFF4F4] rounded-[10px] border-0">
                    <div className="text-[10px] font-bold text-[#DC2626] tracking-wider uppercase">ADMIN</div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-1.5">
                      Full access to settings, system timing, staff roles &amp; audit logs.
                    </p>
                  </div>
                  <div className="p-4 bg-[#F3F8FF] rounded-[10px] border-0">
                    <div className="text-[10px] font-bold text-[#2563EB] tracking-wider uppercase">RECRUITER</div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-1.5">
                      Drive creation, candidate invitations, and hiring decision log.
                    </p>
                  </div>
                  <div className="p-4 bg-[#FFFCF0] rounded-[10px] border-0">
                    <div className="text-[10px] font-bold text-[#D97706] tracking-wider uppercase">PROCTOR</div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-1.5">
                      Real-time session monitoring, integrity flag review &amp; video evidence.
                    </p>
                  </div>
                  <div className="p-4 bg-[#F3FFF9] rounded-[10px] border-0">
                    <div className="text-[10px] font-bold text-[#16A34A] tracking-wider uppercase">EVALUATOR</div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-1.5">
                      Technical evaluation of code, SQL queries, and AI prompt traces.
                    </p>
                  </div>
                </div>

                {loadingStaff ? (
                  <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                    Loading staff roster…
                  </p>
                ) : (
                  <div className="border border-[#E2E8F0] rounded-[12px] divide-y divide-[#E2E8F0] overflow-hidden bg-white shadow-xs">
                    {staff.map((s, idx) => {
                      const isDemoAdmin = s.name?.toLowerCase().includes("admin") || s.role === "ADMIN";
                      const avatarBg = isDemoAdmin ? "bg-[#FEF2F2] text-[#EF4444]" : "bg-[#EFF6FF] text-[#2563EB]";
                      const badgeBg = isDemoAdmin
                        ? "text-[#EF4444] bg-[#FEF2F2]"
                        : s.role === "PROCTOR"
                          ? "text-[#D97706] bg-[#FFFCF0]"
                          : s.role === "EVALUATOR"
                            ? "text-[#16A34A] bg-[#F3FFF9]"
                            : "text-[#2563EB] bg-[#EFF6FF]";

                      return (
                        <div key={s.id || idx} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#FBFCFD] transition-colors">
                          <div className="flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-full ${avatarBg} font-bold text-xs flex items-center justify-center shrink-0`}>
                              {s.name ? s.name.charAt(0).toUpperCase() : "S"}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-bold text-[#0F172A]">{s.name}</span>
                                <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-wider ${badgeBg}`}>
                                  {s.role}
                                </span>
                              </div>
                              <div className="text-[12px] text-[#64748B] mt-0.5">{s.email}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <select
                              value={s.role}
                              onChange={(e) => handleUpdateRole(s.id, e.target.value)}
                              className="px-3 h-[31px] text-[12px] text-[#334155] border border-[#E2E8F0] rounded-[7.5px] bg-white outline-none cursor-pointer hover:border-[#CBD5E1] focus:border-[#2563EB]"
                            >
                              <option value="ADMIN">Admin</option>
                              <option value="RECRUITER">Recruiter</option>
                              <option value="PROCTOR">Proctor</option>
                              <option value="EVALUATOR">Evaluator</option>
                            </select>

                            <button
                              onClick={() => handleDeleteStaff(s.id, s.name)}
                              title="Remove staff member"
                              className="p-1.5 text-[#94A3B8] hover:text-[#EF4444] hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
                      <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                        <div className="flex items-center gap-2">
                          <UserPlus size={16} className="text-[#2563EB]" />
                          <h3 className="text-sm font-bold text-[#0F172A]">Add New Staff Member</h3>
                        </div>
                        <button
                          onClick={() => setShowAddStaffModal(false)}
                          className="text-[#94A3B8] hover:text-ink cursor-pointer p-1 rounded-lg hover:bg-[#F1F5F9]"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
                        <div>
                          <label className="block font-semibold text-[#3D4B60] mb-1">Full Name</label>
                          <input
                            type="text"
                            required
                            value={newStaffName}
                            onChange={(e) => setNewStaffName(e.target.value)}
                            placeholder="e.g. Rachel Brooks"
                            className="w-full h-10 px-3 border border-[#E2E8F0] rounded-lg bg-white text-[#0F172A] text-xs outline-none focus:border-[#2563EB]"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-[#3D4B60] mb-1">Email Address</label>
                          <input
                            type="email"
                            required
                            value={newStaffEmail}
                            onChange={(e) => setNewStaffEmail(e.target.value)}
                            placeholder="e.g. recruiter@example.com"
                            className="w-full h-10 px-3 border border-[#E2E8F0] rounded-lg bg-white text-[#0F172A] text-xs outline-none focus:border-[#2563EB]"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-[#3D4B60] mb-1">Assigned Role</label>
                          <select
                            value={newStaffRole}
                            onChange={(e) => setNewStaffRole(e.target.value)}
                            className="w-full h-10 px-3 border border-[#E2E8F0] rounded-lg bg-white text-[#0F172A] text-xs outline-none focus:border-[#2563EB]"
                          >
                            <option value="RECRUITER">Recruiter (Drives, Invites &amp; Hiring Decisions)</option>
                            <option value="ADMIN">Admin (Full System Governance &amp; Configuration)</option>
                            <option value="PROCTOR">Proctor (Live Monitoring &amp; Integrity Review)</option>
                            <option value="EVALUATOR">Evaluator (Technical Code &amp; Submission Grading)</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1F5F9]">
                          <button
                            type="button"
                            onClick={() => setShowAddStaffModal(false)}
                            className="px-4 py-2 text-xs font-semibold text-[#64748B] hover:text-[#0F172A] rounded-full hover:bg-[#F1F5F9] cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={creatingStaff}
                            className="px-5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-full transition-all cursor-pointer shadow-xs"
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

            {/* Tab: Roles & Permissions Dynamic Matrix */}
            {activeTab === "permissions" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[16px] font-bold text-[#0F172A]">Roles &amp; Permissions Dynamic Matrix</h2>
                    <p className="text-[12px] text-[#64748B] mt-1">
                      Configure dynamic role capabilities and access control policies across all candidate evaluation, drive logistics, and administrative workflows.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowResetPermissionsModal(true)}
                    disabled={!isAdmin || loadingPermissions}
                    className="flex items-center gap-1.5 px-4 h-[32px] text-[12px] font-semibold text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] rounded-[10px] transition-all cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={resettingPermissions ? "animate-spin" : ""} />
                    <span>Reset to Defaults</span>
                  </button>
                </div>

                {/* Roles Overview Breakdown Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="p-4 bg-[#FEF2F2] rounded-[10px] border border-[#FECACA]/60 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-y-1 gap-x-2 min-w-0">
                      <span className="text-[11px] font-bold text-[#DC2626] tracking-wider uppercase shrink-0">ADMIN</span>
                      <span className="px-2 py-0.5 text-[8.5px] font-bold rounded-full bg-white text-[#DC2626] border border-[#FECACA] whitespace-nowrap shrink-0">
                        SUPERADMIN
                      </span>
                    </div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-2">
                      Full access to settings, system timing, staff roles &amp; compliance audit logs.
                    </p>
                  </div>

                  <div className="p-4 bg-[#EFF6FF] rounded-[10px] border border-[#BFDBFE]/60 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-y-1 gap-x-2 min-w-0">
                      <span className="text-[11px] font-bold text-[#2563EB] tracking-wider uppercase shrink-0">HR_LEAD</span>
                      <span className="px-2 py-0.5 text-[8.5px] font-bold rounded-full bg-white text-[#2563EB] border border-[#BFDBFE] whitespace-nowrap shrink-0">
                        LEAD RECRUITER
                      </span>
                    </div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-2">
                      Final decisions, candidate evaluation, proctoring triage, templates &amp; audit review.
                    </p>
                  </div>

                  <div className="p-4 bg-[#FFFBEB] rounded-[10px] border border-[#FDE68A]/60 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-y-1 gap-x-2 min-w-0">
                      <span className="text-[11px] font-bold text-[#D97706] tracking-wider uppercase shrink-0">HR_ASSOCIATE</span>
                      <span className="px-2 py-0.5 text-[8.5px] font-bold rounded-full bg-white text-[#D97706] border border-[#FDE68A] whitespace-nowrap shrink-0">
                        RECRUITMENT OPS
                      </span>
                    </div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-2">
                      Drive creation, CSV candidate ingestion, assessment links &amp; live triage.
                    </p>
                  </div>

                  <div className="p-4 bg-[#ECFDF5] rounded-[10px] border border-[#A7F3D0]/60 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-y-1 gap-x-2 min-w-0">
                      <span className="text-[11px] font-bold text-[#059669] tracking-wider uppercase shrink-0">REVIEWER</span>
                      <span className="px-2 py-0.5 text-[8.5px] font-bold rounded-full bg-white text-[#059669] border border-[#A7F3D0] whitespace-nowrap shrink-0">
                        EVALUATOR
                      </span>
                    </div>
                    <p className="text-[11px] text-[#475569] leading-snug mt-2">
                      Candidate code submission review, SQL query inspection &amp; manual scoring rubrics.
                    </p>
                  </div>
                </div>

                {loadingPermissions ? (
                  <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                    Loading role permissions matrix…
                  </p>
                ) : (
                  <div className="border border-[#E2E8F0] rounded-[12px] overflow-hidden bg-white shadow-xs divide-y divide-[#E2E8F0]">
                    {Object.entries(groupedDescriptors).map(([category, items]) => (
                      <div key={category} className="space-y-0">
                        {/* Category Header */}
                        <div className="bg-[#F8FAFC] px-6 py-3 border-b border-[#E2E8F0] flex items-center justify-between">
                          <span className="text-[12px] font-bold uppercase tracking-wider text-[#475569]">
                            {category}
                          </span>
                          <span className="text-[11px] font-mono text-[#94A3B8]">
                            {items.length} {items.length === 1 ? "Capability" : "Capabilities"}
                          </span>
                        </div>

                        {/* Matrix Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b border-[#F1F5F9] bg-[#FAFCFF] text-[10px] uppercase font-bold text-[#64748B]">
                                <th className="px-6 py-2.5 text-left min-w-[280px]">Capability &amp; Description</th>
                                <th className="px-4 py-2.5 text-center w-[110px]">ADMIN</th>
                                <th className="px-4 py-2.5 text-center w-[110px]">HR_LEAD</th>
                                <th className="px-4 py-2.5 text-center w-[120px]">HR_ASSOCIATE</th>
                                <th className="px-4 py-2.5 text-center w-[110px]">REVIEWER</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F1F5F9] text-xs">
                              {items.map((item) => {
                                const matrixState = permissionsMatrix || DEFAULT_ROLE_PERMISSIONS;
                                return (
                                  <tr key={item.key} className="hover:bg-[#F8FAFC]/70 transition-colors">
                                    <td className="px-6 py-3">
                                      <div className="font-semibold text-[#0F172A] text-[13px]">{item.name}</div>
                                      <div className="text-[11px] text-[#64748B] mt-0.5">{item.description}</div>
                                    </td>

                                    {/* ADMIN (Locked Full) */}
                                    <td className="px-4 py-3 text-center">
                                      <div className="inline-flex items-center justify-center p-1 rounded-md bg-[#FEF2F2] text-[#DC2626]" title="Superadmin has unconditional full privileges">
                                        <Lock size={14} />
                                      </div>
                                    </td>

                                    {/* HR_LEAD, HR_ASSOCIATE, REVIEWER */}
                                    {["HR_LEAD", "HR_ASSOCIATE", "REVIEWER"].map((roleKey) => {
                                      const rolePerms = matrixState[roleKey] || DEFAULT_ROLE_PERMISSIONS[roleKey] || [];
                                      const isEnabled = rolePerms.includes(item.key);
                                      const cellKey = `${roleKey}-${item.key}`;
                                      const isSaving = savingPermission === cellKey;

                                      return (
                                        <td key={roleKey} className="px-4 py-3 text-center">
                                          <label className="inline-flex items-center justify-center p-1 rounded-md hover:bg-black/5 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={isEnabled}
                                              disabled={isSaving || !isAdmin}
                                              onChange={() => handleTogglePermission(roleKey, item.key, isEnabled)}
                                              className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]/30 w-4 h-4 cursor-pointer disabled:opacity-50"
                                            />
                                          </label>
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
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Assessment Modules */}
            {activeTab === "modules" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-[16px] font-bold text-[#0F172A]">Assessment Module Department Mapping</h2>
                  <p className="text-[12px] text-[#64748B] mt-1">
                    Configure global module availability per department. Enabling a module makes it selectable during drive and role template calibrations.
                  </p>
                </div>

                {loadingModules ? (
                  <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                    Loading assessment module configurations…
                  </p>
                ) : (
                  <div className="border border-[#E2E8F0] rounded-[12px] overflow-x-auto shadow-xs bg-white text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] font-sans text-[10px] uppercase tracking-wider font-bold text-[#64748B]">
                          <th className="px-5 py-3.5 text-left min-w-[200px]">Department</th>
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
                              className={`px-3 py-3.5 text-center transition-colors whitespace-nowrap min-w-[85px] ${hoveredCell?.mod === m.key ? "bg-[#EFF6FF] text-[#2563EB]" : ""
                                }`}
                            >
                              {m.label}
                            </th>
                          ))}
                          <th className="px-5 py-3.5 text-right whitespace-nowrap min-w-[140px]">Bulk Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9] text-xs">
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
                              className={`transition-colors ${isRowHovered ? "bg-[#EFF6FF]/40" : "hover:bg-[#F8FAFC]/60"
                                }`}
                            >
                              <td className="px-5 py-3.5 font-bold text-[#0F172A]">
                                <div className="flex items-center gap-2">
                                  <span>{d.label}</span>
                                  <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0]">
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
                                    className={`px-3 py-3.5 text-center transition-colors ${isCellHovered
                                        ? "bg-[#EFF6FF]"
                                        : isColHovered
                                          ? "bg-[#EFF6FF]/50"
                                          : isRowHovered
                                            ? "bg-[#EFF6FF]/30"
                                            : ""
                                      }`}
                                  >
                                    <label className="inline-flex items-center justify-center p-1 rounded-md hover:bg-black/5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isEnabled}
                                        disabled={isSaving || !isAdmin}
                                        onChange={() => handleToggleModule(d.key, mod, isEnabled)}
                                        className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]/30 w-4 h-4 cursor-pointer disabled:opacity-50"
                                      />
                                    </label>
                                  </td>
                                );
                              })}

                              <td className="px-5 py-3.5 text-right font-medium">
                                <div className="flex items-center justify-end gap-2 text-xs">
                                  <button
                                    onClick={() => handleBulkDepartmentModules(d.key, true)}
                                    disabled={isBulkSaving || !isAdmin || enabledCount === modulesList.length}
                                    className="text-[#2563EB] hover:underline disabled:opacity-30 disabled:no-underline cursor-pointer font-semibold"
                                    title="Enable all modules for this department"
                                  >
                                    Select All
                                  </button>
                                  <span className="text-[#CBD5E1]">|</span>
                                  <button
                                    onClick={() => handleBulkDepartmentModules(d.key, false)}
                                    disabled={isBulkSaving || !isAdmin || enabledCount === 0}
                                    className="text-[#EF4444] hover:underline disabled:opacity-30 disabled:no-underline cursor-pointer font-semibold"
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

            {/* Tab 5: Time Matrix & Difficulty Curves (Calibration) */}
            {activeTab === "calibration" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[16px] font-bold text-[#0F172A]">
                      Question Time Matrix &amp; Seniority Curves
                    </h2>
                    <p className="text-[12px] text-[#64748B] mt-1">
                      Configure baseline per-question completion minutes and difficulty distribution percentages across seniority bands.
                    </p>
                  </div>
                  <button
                    onClick={handleSaveCalibration}
                    disabled={savingCalibration || !isAdmin}
                    className="flex items-center gap-1.5 px-5 h-[34px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-blue-300 rounded-[10px] transition-all cursor-pointer shadow-xs shrink-0"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>{savingCalibration ? "Saving Matrix…" : "Save Matrix & Curves"}</span>
                  </button>
                </div>

                {/* Section 1: Question Time Matrix by Complexity */}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-[14px] font-bold text-[#0F172A]">
                      Question Duration Calibration (Minutes / Question)
                    </h3>
                    <p className="text-[11px] text-[#64748B]">
                      Specifies expected completion minutes allocated per question for each difficulty tier.
                    </p>
                  </div>

                  <div className="border border-[#E2E8F0] rounded-[12px] overflow-hidden bg-white shadow-xs">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] font-sans text-[10px] uppercase tracking-wider font-bold text-[#64748B]">
                          <th className="px-5 py-3 text-left min-w-[200px]">Assessment Module</th>
                          <th className="px-4 py-3 text-center w-[130px]">Easy (Mins)</th>
                          <th className="px-4 py-3 text-center w-[130px]">Medium (Mins)</th>
                          <th className="px-4 py-3 text-center w-[130px]">Hard (Mins)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {[
                          { key: "MCQ", label: "Multiple Choice Questions (MCQ)" },
                          { key: "SQL", label: "SQL Query Execution" },
                          { key: "NOSQL", label: "NoSQL Data Modeling" },
                          { key: "CODING", label: "Algorithm & Coding Challenge" },
                          { key: "DEBUGGING", label: "Code Debugging & Fixes" },
                          { key: "AI_PROMPTING", label: "AI Prompt Engineering" },
                          { key: "SIMULATION", label: "System Architecture Simulation" },
                          { key: "TEST_SCENARIOS", label: "QA & Test Scenario Design" },
                        ].map((mod) => {
                          const matrix = timeMatrix[mod.key] || { EASY: 1, MEDIUM: 2, HARD: 3 };
                          return (
                            <tr key={mod.key} className="hover:bg-[#F8FAFC]/60 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-[#0F172A]">
                                {mod.label}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  max={120}
                                  value={matrix.EASY}
                                  disabled={!isAdmin}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    setTimeMatrix((prev) => ({
                                      ...prev,
                                      [mod.key]: { ...(prev[mod.key] || { EASY: 1, MEDIUM: 2, HARD: 3 }), EASY: val },
                                    }));
                                  }}
                                  className="w-[80px] h-[32px] px-2 text-center text-xs font-semibold text-[#0F172A] border border-[#CBD5E1] rounded-[6px] bg-white focus:border-[#2563EB] outline-none"
                                />
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  max={120}
                                  value={matrix.MEDIUM}
                                  disabled={!isAdmin}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    setTimeMatrix((prev) => ({
                                      ...prev,
                                      [mod.key]: { ...(prev[mod.key] || { EASY: 1, MEDIUM: 2, HARD: 3 }), MEDIUM: val },
                                    }));
                                  }}
                                  className="w-[80px] h-[32px] px-2 text-center text-xs font-semibold text-[#0F172A] border border-[#CBD5E1] rounded-[6px] bg-white focus:border-[#2563EB] outline-none"
                                />
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  max={180}
                                  value={matrix.HARD}
                                  disabled={!isAdmin}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    setTimeMatrix((prev) => ({
                                      ...prev,
                                      [mod.key]: { ...(prev[mod.key] || { EASY: 1, MEDIUM: 2, HARD: 3 }), HARD: val },
                                    }));
                                  }}
                                  className="w-[80px] h-[32px] px-2 text-center text-xs font-semibold text-[#0F172A] border border-[#CBD5E1] rounded-[6px] bg-white focus:border-[#2563EB] outline-none"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section 2: Seniority Difficulty Curves */}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-[14px] font-bold text-[#0F172A]">
                      Seniority Difficulty Distribution Curves
                    </h3>
                    <p className="text-[11px] text-[#64748B]">
                      Defines question difficulty proportions for candidate assessment dynamic question generation.
                    </p>
                  </div>

                  <div className="border border-[#E2E8F0] rounded-[12px] overflow-hidden bg-white shadow-xs">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] font-sans text-[10px] uppercase tracking-wider font-bold text-[#64748B]">
                          <th className="px-5 py-3 text-left min-w-[200px]">Seniority Level</th>
                          <th className="px-4 py-3 text-center w-[120px]">Easy (%)</th>
                          <th className="px-4 py-3 text-center w-[120px]">Medium (%)</th>
                          <th className="px-4 py-3 text-center w-[120px]">Hard (%)</th>
                          <th className="px-4 py-3 text-center w-[120px]">Total Ratio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {[
                          { key: "fresher", label: "Fresher / Junior (0 - 1 Yrs)" },
                          { key: "l1", label: "L1 / Mid-Level (1 - 3 Yrs)" },
                          { key: "l2", label: "L2 / Senior Engineer (3 - 6 Yrs)" },
                          { key: "l3", label: "L3 / Staff & Principal (6+ Yrs)" },
                        ].map((tier) => {
                          const ratio = seniorityRatios[tier.key] || { easy: 0.33, medium: 0.33, hard: 0.34 };
                          const easyPct = Math.round((ratio.easy ?? 0) * 100);
                          const medPct = Math.round((ratio.medium ?? 0) * 100);
                          const hardPct = Math.round((ratio.hard ?? 0) * 100);
                          const totalPct = easyPct + medPct + hardPct;
                          const isValid = totalPct === 100;

                          return (
                            <tr key={tier.key} className="hover:bg-[#F8FAFC]/60 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-[#0F172A]">
                                {tier.label}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={easyPct}
                                  disabled={!isAdmin}
                                  onChange={(e) => {
                                    const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                    setSeniorityRatios((prev) => ({
                                      ...prev,
                                      [tier.key]: {
                                        ...(prev[tier.key] || { easy: 0.3, medium: 0.5, hard: 0.2 }),
                                        easy: val / 100,
                                      },
                                    }));
                                  }}
                                  className="w-[75px] h-[32px] px-2 text-center text-xs font-semibold text-[#0F172A] border border-[#CBD5E1] rounded-[6px] bg-white focus:border-[#2563EB] outline-none"
                                />
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={medPct}
                                  disabled={!isAdmin}
                                  onChange={(e) => {
                                    const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                    setSeniorityRatios((prev) => ({
                                      ...prev,
                                      [tier.key]: {
                                        ...(prev[tier.key] || { easy: 0.3, medium: 0.5, hard: 0.2 }),
                                        medium: val / 100,
                                      },
                                    }));
                                  }}
                                  className="w-[75px] h-[32px] px-2 text-center text-xs font-semibold text-[#0F172A] border border-[#CBD5E1] rounded-[6px] bg-white focus:border-[#2563EB] outline-none"
                                />
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={hardPct}
                                  disabled={!isAdmin}
                                  onChange={(e) => {
                                    const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                    setSeniorityRatios((prev) => ({
                                      ...prev,
                                      [tier.key]: {
                                        ...(prev[tier.key] || { easy: 0.3, medium: 0.5, hard: 0.2 }),
                                        hard: val / 100,
                                      },
                                    }));
                                  }}
                                  className="w-[75px] h-[32px] px-2 text-center text-xs font-semibold text-[#0F172A] border border-[#CBD5E1] rounded-[6px] bg-white focus:border-[#2563EB] outline-none"
                                />
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span
                                  className={`px-2.5 py-1 rounded-[4px] text-[11px] font-mono font-bold ${isValid
                                      ? "bg-[#ECFDF5] text-[#059669]"
                                      : "bg-[#FEF2F2] text-[#DC2626]"
                                    }`}
                                >
                                  {totalPct}% {isValid ? "✓" : "≠100%"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 6: Proctoring & Biometric Thresholds */}
            {activeTab === "proctoring" && (
              <div className="space-y-8 max-w-[680px]">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[16px] font-bold text-[#0F172A]">
                      Proctoring &amp; Biometric Integrity Controls
                    </h2>
                    <p className="text-[12px] text-[#64748B] mt-1">
                      Configure face verification confidence, look-away triggers, voice sensitivity, and telemetry event cooldowns.
                    </p>
                  </div>
                  <button
                    onClick={handleSaveProctoringThresholds}
                    disabled={savingProctoring || !isAdmin}
                    className="flex items-center gap-1.5 px-5 h-[34px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-blue-300 rounded-[10px] transition-all cursor-pointer shadow-xs shrink-0"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>{savingProctoring ? "Saving…" : "Save Proctoring Config"}</span>
                  </button>
                </div>

                {/* Section 1: Biometric & Identity Match */}
                <div className="p-5 border border-[#E2E8F0] rounded-[12px] bg-white space-y-5">
                  <h3 className="text-[13px] font-bold text-[#0F172A] uppercase tracking-wider">
                    Biometric &amp; ID Verification Sensitivity
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[12px] font-semibold text-[#475569]">
                          Facial Similarity Match Threshold
                        </label>
                        <span className="text-xs font-bold font-mono text-[#2563EB]">
                          {Math.round((proctoringThresholds.faceThreshold ?? 0.68) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.4"
                        max="0.95"
                        step="0.01"
                        value={proctoringThresholds.faceThreshold ?? 0.68}
                        onChange={(e) =>
                          setProctoringThresholds((prev) => ({
                            ...prev,
                            faceThreshold: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full figma-slider h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#2563EB]"
                        style={{
                          background: `linear-gradient(to right, #2563EB ${Math.round(
                            (((proctoringThresholds.faceThreshold ?? 0.68) - 0.4) / (0.95 - 0.4)) * 100
                          )}%, #E2E8F0 ${Math.round(
                            (((proctoringThresholds.faceThreshold ?? 0.68) - 0.4) / (0.95 - 0.4)) * 100
                          )}%)`,
                        }}
                      />
                      <p className="text-[11px] text-[#64748B] mt-1">
                        Minimum cosine similarity required between webcam feed and ID card photo.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[12px] font-semibold text-[#475569]">
                          ID Name Match Fuzzy Distance
                        </label>
                        <span className="text-xs font-bold font-mono text-[#2563EB]">
                          {Math.round((proctoringThresholds.nameThreshold ?? 0.75) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="0.95"
                        step="0.01"
                        value={proctoringThresholds.nameThreshold ?? 0.75}
                        onChange={(e) =>
                          setProctoringThresholds((prev) => ({
                            ...prev,
                            nameThreshold: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full figma-slider h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#2563EB]"
                        style={{
                          background: `linear-gradient(to right, #2563EB ${Math.round(
                            (((proctoringThresholds.nameThreshold ?? 0.75) - 0.5) / (0.95 - 0.5)) * 100
                          )}%, #E2E8F0 ${Math.round(
                            (((proctoringThresholds.nameThreshold ?? 0.75) - 0.5) / (0.95 - 0.5)) * 100
                          )}%)`,
                        }}
                      />
                      <p className="text-[11px] text-[#64748B] mt-1">
                        Levenshtein ratio required when matching candidate ID document OCR name against registered profile name.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section 2: Environmental Telemetry */}
                <div className="p-5 border border-[#E2E8F0] rounded-[12px] bg-white space-y-4">
                  <h3 className="text-[13px] font-bold text-[#0F172A] uppercase tracking-wider">
                    Environmental &amp; Gaze Telemetry Limits
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] font-semibold text-[#475569] mb-1.5">
                        Looking Away Trigger (ms)
                      </label>
                      <input
                        type="number"
                        min={200}
                        max={5000}
                        step={100}
                        value={proctoringThresholds.lookingAwayThresholdMs ?? 800}
                        onChange={(e) =>
                          setProctoringThresholds((prev) => ({
                            ...prev,
                            lookingAwayThresholdMs: parseInt(e.target.value) || 800,
                          }))
                        }
                        className="w-full h-[38px] px-3 border border-[#E2E8F0] rounded-[7.5px] text-[13px] text-[#0F172A] bg-white outline-none focus:border-[#2563EB]"
                      />
                      <p className="text-[11px] text-[#64748B] mt-1">
                        Gaze deviation duration before flagging looking away.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[12px] font-semibold text-[#475569] mb-1.5">
                        Voice Sensitivity Level (0 - 100)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={90}
                        value={proctoringThresholds.voiceSensitivityThreshold ?? 40}
                        onChange={(e) =>
                          setProctoringThresholds((prev) => ({
                            ...prev,
                            voiceSensitivityThreshold: parseInt(e.target.value) || 40,
                          }))
                        }
                        className="w-full h-[38px] px-3 border border-[#E2E8F0] rounded-[7.5px] text-[13px] text-[#0F172A] bg-white outline-none focus:border-[#2563EB]"
                      />
                      <p className="text-[11px] text-[#64748B] mt-1">
                        Audio decibel amplitude threshold for speech detection.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[12px] font-semibold text-[#475569] mb-1.5">
                        Sustained Voice Trigger (ms)
                      </label>
                      <input
                        type="number"
                        min={500}
                        max={10000}
                        step={250}
                        value={proctoringThresholds.voiceSustainedMs ?? 3500}
                        onChange={(e) =>
                          setProctoringThresholds((prev) => ({
                            ...prev,
                            voiceSustainedMs: parseInt(e.target.value) || 3500,
                          }))
                        }
                        className="w-full h-[38px] px-3 border border-[#E2E8F0] rounded-[7.5px] text-[13px] text-[#0F172A] bg-white outline-none focus:border-[#2563EB]"
                      />
                      <p className="text-[11px] text-[#64748B] mt-1">
                        Continuous voice duration required to trigger sustained voice flag.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section 3: Event Cooldown Throttles */}
                <div className="p-5 border border-[#E2E8F0] rounded-[12px] bg-white space-y-4">
                  <h3 className="text-[13px] font-bold text-[#0F172A] uppercase tracking-wider">
                    Violation Event Cooldown Periods (ms)
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    Minimum interval between telemetry flag events of the same category to prevent log flooding.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {[
                      { key: "PHONE_DETECTED", label: "Phone Detected" },
                      { key: "HEADPHONES_DETECTED", label: "Headphones / Earbuds" },
                      { key: "BOOK_DETECTED", label: "Book / Reference Material" },
                      { key: "FACE_MISSING", label: "Face Missing" },
                      { key: "LOOKING_AWAY", label: "Looking Away" },
                      { key: "EXCESSIVE_MOVEMENT", label: "Excessive Movement" },
                      { key: "MULTIPLE_FACES", label: "Multiple Faces" },
                      { key: "TAB_SWITCH", label: "Tab Switch / Lost Focus" },
                      { key: "PASTE", label: "Clipboard Paste" },
                      { key: "FULLSCREEN_EXIT", label: "Fullscreen Exit" },
                      { key: "SPEECH_DETECTED", label: "Speech Detected" },
                      { key: "SECOND_VOICE_SUSPECTED", label: "Second Voice Suspected" },
                      { key: "IDENTITY_MISMATCH", label: "Identity Mismatch" },
                    ].map((item) => {
                      const currentVal = proctoringThresholds.cooldowns?.[item.key] ?? 10000;
                      return (
                        <div key={item.key} className="flex items-center justify-between p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                          <span className="text-[12px] font-semibold text-[#334155]">{item.label}</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={60000}
                              step={500}
                              value={currentVal}
                              disabled={!isAdmin}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setProctoringThresholds((prev) => ({
                                  ...prev,
                                  cooldowns: {
                                    ...(prev.cooldowns || {}),
                                    [item.key]: val,
                                  },
                                }));
                              }}
                              className="w-[75px] h-[30px] px-2 text-right text-xs font-mono font-bold text-[#0F172A] border border-[#CBD5E1] rounded-[6px] bg-white outline-none focus:border-[#2563EB]"
                            />
                            <span className="text-[11px] font-mono text-[#64748B]">ms</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 7: Scoring & AI Intensity */}
            {activeTab === "scoring" && (
              <div className="max-w-[499px] space-y-6">
                <div>
                  <h2 className="text-[16px] font-bold text-[#0F172A]">
                    AI Proctoring Intensity &amp; Scoring Controls
                  </h2>
                  <p className="text-[12px] text-[#64748B] mt-1">
                    Configure real-time monitoring strictness and score threshold levels.
                  </p>
                </div>

                <div className="space-y-5 pt-2">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#475569] mb-2">
                      AI Proctoring Intensity Level
                    </label>
                    <select
                      value={aiIntensity}
                      onChange={(e) => setAiIntensity(e.target.value)}
                      className="w-full h-[40px] px-3.5 border border-[#E2E8F0] rounded-[7.5px] text-[13px] text-[#0F172A] bg-white focus:border-[#2563EB] outline-none shadow-xs"
                    >
                      <option value="HIGH">High (Strict — Flag multi-face &amp; tab switches quickly)</option>
                      <option value="MEDIUM">Medium (Balanced — Standard monitoring threshold)</option>
                      <option value="LOW">Low (Permissive — Minimum flags for minor shifts)</option>
                      <option value="STRICT">Strict (Maximum Enforcement — Instant alert triggers)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#475569] mb-2">
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
                          background: `linear-gradient(to right, #2563EB ${aiThreshold * 100}%, #E2E8F0 ${aiThreshold * 100}%)`,
                        }}
                      />
                      <span className="font-bold text-xs text-[#0F172A] w-12 text-right">
                        {Math.round(aiThreshold * 100)}%
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#475569] mb-2">
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
                          background: `linear-gradient(to right, #2563EB ${passThreshold * 100}%, #E2E8F0 ${passThreshold * 100}%)`,
                        }}
                      />
                      <span className="font-bold text-xs text-[#0F172A] w-12 text-right">
                        {Math.round(passThreshold * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3">
                  <button
                    onClick={handleSaveScoring}
                    disabled={savingScoring}
                    className="px-6 h-[37px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-blue-300 rounded-[8px] shadow-xs transition-all cursor-pointer"
                  >
                    {savingScoring ? "Saving Scoring & AI Config…" : "Save Scoring & AI Config"}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 8: System Timing & Session Parameters */}
            {activeTab === "system" && (
              <div className="max-w-[499px] space-y-6">
                <div>
                  <h2 className="text-[16px] font-bold text-[#0F172A]">
                    System &amp; Session Integrity Parameters
                  </h2>
                  <p className="text-[12px] text-[#64748B] mt-1">
                    Adjust session disconnect tolerances and heartbeat timeout thresholds.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#475569] mb-1.5">
                      Heartbeat Stale Threshold (Seconds)
                    </label>
                    <input
                      type="number"
                      value={staleHeartbeat}
                      onChange={(e) => setStaleHeartbeat(parseInt(e.target.value) || 30)}
                      className="w-full h-[40px] px-3.5 border border-[#E2E8F0] rounded-[7.5px] text-[13px] text-[#0F172A] bg-white focus:border-[#2563EB] outline-none shadow-xs"
                    />
                    <p className="text-[11px] text-[#64748B] mt-1.5 leading-normal">
                      Time without heartbeat before session is marked connection degraded.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#475569] mb-1.5">
                      Reconnection Grace Window (Seconds)
                    </label>
                    <input
                      type="number"
                      value={graceWindow}
                      onChange={(e) => setGraceWindow(parseInt(e.target.value) || 300)}
                      className="w-full h-[40px] px-3.5 border border-[#E2E8F0] rounded-[7.5px] text-[13px] text-[#0F172A] bg-white focus:border-[#2563EB] outline-none shadow-xs"
                    />
                    <p className="text-[11px] text-[#64748B] mt-1.5 leading-normal">
                      Allowed window for candidate to re-establish connection without termination.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#475569] mb-1.5">
                      Maximum Disconnect Count Allowance
                    </label>
                    <input
                      type="number"
                      value={maxDisconnects}
                      onChange={(e) => setMaxDisconnects(parseInt(e.target.value) || 3)}
                      className="w-full h-[40px] px-3.5 border border-[#E2E8F0] rounded-[7.5px] text-[13px] text-[#0F172A] bg-white focus:border-[#2563EB] outline-none shadow-xs"
                    />
                    <p className="text-[11px] text-[#64748B] mt-1.5 leading-normal">
                      Max disconnects before requiring proctor manual review.
                    </p>
                  </div>
                </div>

                <div className="pt-3">
                  <button
                    onClick={handleSaveSystem}
                    disabled={savingSystem}
                    className="px-6 h-[37px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-blue-300 rounded-[8px] shadow-xs transition-all cursor-pointer"
                  >
                    {savingSystem ? "Saving System Parameters…" : "Save System Parameters"}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 9: Retention */}
            {activeTab === "retention" && (
              <div className="max-w-[499px] space-y-6">
                <div>
                  <h2 className="text-[16px] font-bold text-[#0F172A]">
                    Evidence &amp; Proctoring Retention Schedules
                  </h2>
                  <p className="text-[12px] text-[#64748B] mt-1">
                    Define timelines for purging biometric clips and screenshots.
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <label className="block text-[12px] font-semibold text-[#475569]">
                    Purge files after
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(parseInt(e.target.value) || 1)}
                      className="w-[99px] h-[39px] px-3 border border-[#E2E8F0] rounded-[7.5px] text-[13px] font-bold text-center text-[#0F172A] bg-white focus:border-[#2563EB] outline-none shadow-xs"
                    />
                    <span className="text-[13px] font-medium text-[#64748B]">days</span>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleSaveRetention}
                    disabled={savingRetention}
                    className="px-6 h-[37px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-blue-300 rounded-[8px] shadow-xs transition-all cursor-pointer"
                  >
                    {savingRetention ? "Saving Configurations…" : "Save Configurations"}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 10: Audit Logs */}
            {activeTab === "audit" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-[16px] font-bold text-[#0F172A]">System Audit Logs</h2>
                    <p className="text-[12px] text-[#64748B] mt-1">
                      Chronological record of all administrative operations.
                    </p>
                  </div>
                  <div className="relative w-[259px]">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                    />
                    <input
                      value={logsQuery}
                      onChange={(e) => setLogsQuery(e.target.value)}
                      placeholder="Search logs..."
                      className="w-full h-[31px] pl-9 pr-3 text-[12px] border border-[#E2E8F0] rounded-[7.5px] bg-white text-[#0F172A] outline-none focus:border-[#2563EB] shadow-xs"
                    />
                  </div>
                </div>

                {loadingLogs ? (
                  <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                    Querying logs…
                  </p>
                ) : (
                  <div className="border border-[#E2E8F0] rounded-[12px] overflow-hidden bg-white shadow-xs">
                    <div className="grid grid-cols-[1.3fr_1.8fr_1fr_2.4fr_1.3fr] gap-4 px-6 py-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC] font-sans text-[11px] uppercase tracking-wider font-bold text-[#64748B]">
                      <div>USER</div>
                      <div>ACTION</div>
                      <div>ENTITY</div>
                      <div>METADATA CONTEXT</div>
                      <div>TIMESTAMP</div>
                    </div>

                    <div className="divide-y divide-[#E2E8F0] max-h-[460px] overflow-y-auto">
                      {auditLogs.map((log) => (
                        <div
                          key={log.id}
                          className="grid grid-cols-[1.3fr_1.8fr_1fr_2.4fr_1.3fr] gap-4 px-6 py-4 items-center bg-white hover:bg-[#F8FAFC]/60 transition-colors"
                        >
                          <div className="text-[13px] font-medium text-[#0F172A] truncate">
                            {log.staff?.name || "Demo Admin"}
                          </div>
                          <div className="text-[12px] font-bold text-[#2563EB] font-mono truncate">
                            {log.action}
                          </div>
                          <div className="text-[13px] text-[#0F172A] truncate">
                            {log.entityType}
                          </div>
                          <div
                            className="text-[12px] font-mono text-[#64748B] truncate"
                            title={typeof log.metadata === "object" ? JSON.stringify(log.metadata) : String(log.metadata || "")}
                          >
                            {typeof log.metadata === "object" ? JSON.stringify(log.metadata) : String(log.metadata || "—")}
                          </div>
                          <div className="text-[12px] font-mono text-[#64748B] whitespace-nowrap">
                            {log.occurredAt ? log.occurredAt.slice(0, 16).replace("T", " ") : "—"}
                          </div>
                        </div>
                      ))}
                      {auditLogs.length === 0 && (
                        <div className="p-8 text-center text-xs text-[#8C9BA5]">
                          No audit logs found matching search query.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 11: Integrations */}
            {activeTab === "integrations" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-[16px] font-bold text-[#0F172A]">Partner API Integrations</h2>
                    <p className="text-[12px] text-[#64748B] mt-1">
                      Manage external ATS partner API credentials, rate limits, and callback configurations.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Status Filter Tabs */}
                    <div className="inline-flex items-center bg-[#F1F5F9] p-0.5 rounded-[10px] border border-[#E2E8F0]">
                      <button
                        type="button"
                        onClick={() => setPartnerFilter("all")}
                        className={`px-3 py-1 text-[11px] font-bold rounded-[8px] transition-all cursor-pointer ${
                          partnerFilter === "all"
                            ? "bg-white text-[#2563EB] shadow-2xs"
                            : "text-[#64748B] hover:text-[#0F172A]"
                        }`}
                      >
                        All ({partners.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPartnerFilter("active")}
                        className={`px-3 py-1 text-[11px] font-bold rounded-[8px] transition-all cursor-pointer ${
                          partnerFilter === "active"
                            ? "bg-white text-[#059669] shadow-2xs"
                            : "text-[#64748B] hover:text-[#0F172A]"
                        }`}
                      >
                        Active ({partners.filter((p) => !p.isRevoked).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPartnerFilter("revoked")}
                        className={`px-3 py-1 text-[11px] font-bold rounded-[8px] transition-all cursor-pointer ${
                          partnerFilter === "revoked"
                            ? "bg-white text-[#EF4444] shadow-2xs"
                            : "text-[#64748B] hover:text-[#0F172A]"
                        }`}
                      >
                        Revoked ({partners.filter((p) => p.isRevoked).length})
                      </button>
                    </div>

                    <button
                      onClick={() => setShowCreatePartnerModal(true)}
                      className="flex items-center gap-1.5 px-4 h-[32px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[10px] transition-all cursor-pointer shadow-xs shrink-0"
                    >
                      <Plus size={14} strokeWidth={2.5} />
                      <span>Register Partner</span>
                    </button>
                  </div>
                </div>

                {loadingPartners ? (
                  <p className="text-center font-mono text-xs text-ink-tertiary py-8">
                    Loading partner integration records…
                  </p>
                ) : filteredPartners.length === 0 ? (
                  <div className="p-12 text-center border border-dashed border-[#E2E8F0] rounded-xl space-y-2 bg-white">
                    <Key className="w-8 h-8 text-[#94A3B8] mx-auto" />
                    <p className="text-sm font-bold text-[#0F172A]">
                      {partnerFilter === "revoked"
                        ? "No Revoked Partner Keys"
                        : partnerFilter === "active"
                        ? "No Active Partner Keys"
                        : "No Partner API Keys Configured"}
                    </p>
                    <p className="text-xs text-[#8C9BA5]">
                      {partnerFilter === "all"
                        ? "Register an external ATS partner to issue X-API-Key credentials."
                        : `No partner integrations found in the ${partnerFilter} view.`}
                    </p>
                  </div>
                ) : (
                  <div className="border border-[#E2E8F0] rounded-[12px] overflow-hidden bg-white shadow-xs">
                    <div className="grid grid-cols-[2fr_1.2fr_1fr_1.2fr_1fr_1.2fr_0.9fr] gap-4 px-6 py-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC] font-sans text-[11px] uppercase tracking-wider font-bold text-[#64748B] items-center">
                      <div>PARTNER NAME</div>
                      <div>RATE LIMIT</div>
                      <div>API HITS</div>
                      <div>CALLBACK URL</div>
                      <div>STATUS</div>
                      <div>CREATED</div>
                      <div className="text-center font-sans text-[11px] uppercase tracking-wider font-bold text-[#64748B]">
                        ACTIONS
                      </div>
                    </div>

                    <div className="divide-y divide-[#E2E8F0]">
                      {filteredPartners.map((p) => (
                        <div
                          key={p.id}
                          className={`grid grid-cols-[2fr_1.2fr_1fr_1.2fr_1fr_1.2fr_0.9fr] gap-4 px-6 py-4 items-center transition-colors ${
                            p.isRevoked ? "bg-[#FAFAFA]/70 text-[#94A3B8]" : "bg-white hover:bg-[#F8FAFC]/60"
                          }`}
                        >
                          <div>
                            <p className={`text-[13px] font-bold ${p.isRevoked ? "text-[#64748B] line-through decoration-slate-300" : "text-[#0F172A]"}`}>
                              {p.name}
                            </p>
                          </div>
                          <div className="text-[13px] text-[#64748B]">{p.rateLimit} req/min</div>
                          <div className="text-[13px] font-bold text-[#2563EB]">
                            {(p as any).apiHitCount ?? 0} {(p as any).apiHitCount === 1 ? "hit" : "hits"}
                          </div>
                          <div
                            className="text-[13px] text-[#8C9BA5] italic truncate"
                            title={p.callbackUrl || "None"}
                          >
                            {p.callbackUrl || "None"}
                          </div>
                          <div>
                            <span
                              className={`px-2.5 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-wider ${
                                p.isRevoked
                                  ? "bg-[#FEF2F2] text-[#EF4444]"
                                  : "bg-[#ECFDF5] text-[#059669]"
                              }`}
                            >
                              {p.isRevoked ? "REVOKED" : "ACTIVE"}
                            </span>
                          </div>
                          <div className="text-[13px] text-[#64748B]">
                            {p.createdAt
                              ? new Date(p.createdAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "2-digit",
                                })
                              : "—"}
                          </div>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setConfirmRotatePartner(p)}
                              className="w-[28px] h-[28px] rounded-[6px] border border-[#E2E8F0] bg-white flex items-center justify-center text-[#64748B] hover:text-[#2563EB] hover:border-[#2563EB] transition-colors cursor-pointer shadow-2xs"
                              title={p.isRevoked ? "Re-activate / Issue New Key" : "Rotate API Key"}
                            >
                              <RefreshCw size={12} />
                            </button>
                            <button
                              onClick={() => setEditingPartner({ ...p })}
                              className="w-[28px] h-[28px] rounded-[6px] border border-[#E2E8F0] bg-white flex items-center justify-center text-[#64748B] hover:text-[#2563EB] hover:border-[#2563EB] transition-colors cursor-pointer shadow-2xs"
                              title="Edit Partner Config"
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              onClick={() => setConfirmRevokePartner(p)}
                              className={`w-[28px] h-[28px] rounded-[6px] border border-[#E2E8F0] bg-white flex items-center justify-center transition-colors cursor-pointer shadow-2xs ${
                                p.isRevoked
                                  ? "text-rose-500 hover:text-rose-700 hover:border-rose-400"
                                  : "text-[#64748B] hover:text-[#EF4444] hover:border-[#EF4444]"
                              }`}
                              title={p.isRevoked ? "Delete Partner Permanently" : "Manage / Revoke Partner"}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
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
                  if (newlyCreatedKey?.apiKey) {
                    await navigator.clipboard.writeText(newlyCreatedKey.apiKey);
                    toast.success("API key copied to clipboard!");
                  }
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

      {/* Modal: Confirm Delete/Revoke Partner */}
      {confirmRevokePartner && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-[#e2e8f0] space-y-4">
            {confirmRevokePartner.isRevoked ? (
              <>
                <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
                  <div className="flex items-center gap-2.5 text-rose-600">
                    <Trash2 className="w-5 h-5 shrink-0" />
                    <h3 className="text-sm font-bold text-[#0d1424]">
                      Permanently Delete Partner: {confirmRevokePartner.name}?
                    </h3>
                  </div>
                  <button
                    disabled={partnerActionLoading}
                    onClick={() => setConfirmRevokePartner(null)}
                    className="text-[#94a3b8] hover:text-[#0d1424] cursor-pointer p-1 rounded-lg hover:bg-[#f1f5f9]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 leading-relaxed space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <ShieldAlert size={14} className="shrink-0 text-rose-600" />
                    Warning: Irreversible Deletion
                  </p>
                  <p>
                    This partner is already revoked. Permanently deleting it will remove all metadata, token hashes, and webhook configurations from the database.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f1f5f9]">
                  <button
                    type="button"
                    disabled={partnerActionLoading}
                    onClick={() => setConfirmRevokePartner(null)}
                    className="px-4 py-2 text-xs font-semibold text-[#64748b] hover:text-[#0d1424] rounded-full hover:bg-[#f1f5f9] cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={partnerActionLoading}
                    onClick={handleDeletePartner}
                    className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-full shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
                  >
                    <Trash2 size={13} />
                    {partnerActionLoading ? "Deleting..." : "Delete Permanently"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
                  <div className="flex items-center gap-2.5 text-[#0d1424]">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-amber-500" />
                    <h3 className="text-sm font-bold text-[#0d1424]">
                      Manage Partner: {confirmRevokePartner.name}
                    </h3>
                  </div>
                  <button
                    disabled={partnerActionLoading}
                    onClick={() => setConfirmRevokePartner(null)}
                    className="text-[#94a3b8] hover:text-[#0d1424] cursor-pointer p-1 rounded-lg hover:bg-[#f1f5f9]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <p className="text-xs text-[#64748b] leading-relaxed">
                  Choose how you want to handle access for <strong>{confirmRevokePartner.name}</strong>. Revoking is industry standard to maintain audit integrity.
                </p>

                <div className="grid grid-cols-1 gap-3 py-1">
                  {/* Option 1: Revoke Access (Recommended) */}
                  <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900">
                        <Lock size={14} className="text-amber-600" />
                        Revoke Access
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748b] leading-relaxed">
                      Immediately blocks all API requests from this partner with a 401 Unauthorized status. Partner details, hit metrics, and audit logs are preserved for compliance and can be rotated later.
                    </p>
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        disabled={partnerActionLoading}
                        onClick={handleRevokePartner}
                        className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-full shadow-xs cursor-pointer transition-all flex items-center gap-1.5"
                      >
                        <Lock size={12} />
                        {partnerActionLoading ? "Revoking..." : "Revoke Access"}
                      </button>
                    </div>
                  </div>

                  {/* Option 2: Delete Permanently */}
                  <div className="border border-rose-200 bg-rose-50/40 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-900">
                        <Trash2 size={14} className="text-rose-600" />
                        Delete Permanently
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 uppercase tracking-wider">
                        Destructive
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748b] leading-relaxed">
                      Completely purges this partner record, key hash, and webhook URL from the database. This action cannot be undone.
                    </p>
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        disabled={partnerActionLoading}
                        onClick={handleDeletePartner}
                        className="px-4 py-1.5 text-xs font-semibold text-rose-700 hover:text-white hover:bg-rose-600 border border-rose-300 hover:border-transparent disabled:opacity-50 rounded-full cursor-pointer transition-all flex items-center gap-1.5"
                      >
                        <Trash2 size={12} />
                        {partnerActionLoading ? "Deleting..." : "Delete Permanently"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-[#f1f5f9]">
                  <button
                    type="button"
                    disabled={partnerActionLoading}
                    onClick={() => setConfirmRevokePartner(null)}
                    className="px-4 py-2 text-xs font-semibold text-[#64748b] hover:text-[#0d1424] rounded-full hover:bg-[#f1f5f9] cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
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

      {/* Modal: Confirm Reset Permissions */}
      {showResetPermissionsModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-[#E2E8F0] space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <RefreshCw className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-[#0F172A]">Reset Role Permissions to Default?</h3>
            </div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              This action will revert custom permissions for <strong>HR_LEAD</strong>, <strong>HR_ASSOCIATE</strong>, and <strong>REVIEWER</strong> to the system default matrix. This action is irreversible and will be logged in the compliance audit log.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9]">
              <button
                type="button"
                onClick={() => setShowResetPermissionsModal(false)}
                className="px-4 py-2 text-xs font-semibold text-[#64748B] hover:text-[#0F172A] rounded-full hover:bg-[#F1F5F9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resettingPermissions}
                onClick={handleResetPermissions}
                className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-full shadow-xs cursor-pointer"
              >
                {resettingPermissions ? "Resetting…" : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

