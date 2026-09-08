import React, { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileText, FileSpreadsheet, FileCode } from "lucide-react";

export interface DashboardReportPayload {
  totalCandidates: number;
  activePipeline: number;
  passRate: number;
  flagRate: number;
  actionQueue?: {
    pendingReviewsCount: number;
    expiringInvitesCount: number;
    closingDrivesCount: number;
  };
  funnel?: Array<{ stage: string; count: number; change?: string }>;
  liveStream?: Array<{
    id?: string | number;
    initials?: string;
    name: string;
    role: string;
    score: string;
    time: string;
  }>;
}

export interface AnalyticsReportPayload {
  totalAssessed: number;
  avgScore: number;
  avgConsistency: number;
  passRate: number;
  moduleAverages: Array<{ name: string; score: number | null }>;
  scoreBandData: Array<{ band: string; count: number }>;
  integrityAnalytics: {
    lowPct: number;
    medPct: number;
    highPct: number;
    violations: Array<{
      name: string;
      category: string;
      count: number;
      risk: string;
      rate: string;
      color: string;
    }>;
  };
  dateRange?: string;
  driveFilter?: string;
  modulesFilter?: string;
  variant?: string;
}

interface ExportDropdownProps {
  data?: any[];
  filenamePrefix?: string;
  title?: string;
  subtitle?: string;
  reportType?: "roster" | "results" | "analytics" | "general";
  activeFilter?: string;
  analyticsPayload?: AnalyticsReportPayload;
  dashboardPayload?: DashboardReportPayload;
}

export function ExportDropdown({
  data = [],
  filenamePrefix = "proctora-export",
  title = "Candidate Evaluation Roster",
  subtitle,
  reportType = "roster",
  activeFilter = "Filter: All",
  analyticsPayload,
  dashboardPayload,
}: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. Export CSV
  const handleExportCSV = () => {
    setOpen(false);
    if (reportType === "analytics" && analyticsPayload) {
      const summaryHeaders = ["Metric", "Value"];
      const summaryRows = [
        ["Total Assessed", analyticsPayload.totalAssessed],
        ["Avg Composite Score", `${analyticsPayload.avgScore}%`],
        ["Say-Do Consistency", `${analyticsPayload.avgConsistency}%`],
        ["Overall Pass Rate", `${analyticsPayload.passRate}%`],
      ];

      const moduleHeaders = ["Module", "Average Score"];
      const moduleRows = analyticsPayload.moduleAverages.map((m) => [
        `"${m.name}"`,
        m.score !== null ? `${m.score}%` : "N/A",
      ]);

      const violationHeaders = ["Violation Type", "Category", "Occurrences", "Risk Level", "Session Rate"];
      const violationRows = analyticsPayload.integrityAnalytics.violations.map((v) => [
        `"${v.name}"`,
        v.category,
        v.count,
        v.risk,
        `"${v.rate}"`,
      ]);

      const csvContent =
        "data:text/csv;charset=utf-8," +
        [
          "SUMMARY METRICS",
          summaryHeaders.join(","),
          ...summaryRows.map((r) => r.join(",")),
          "",
          "MODULE PERFORMANCE AVERAGES",
          moduleHeaders.join(","),
          ...moduleRows.map((r) => r.join(",")),
          "",
          "INTEGRITY VIOLATIONS & RISK BREAKDOWN",
          violationHeaders.join(","),
          ...violationRows.map((r) => r.join(",")),
        ].join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${filenamePrefix}-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (!data || data.length === 0) return;

    const headers = [
      "ID",
      "Candidate Name",
      "Email",
      "Role",
      "Drive",
      "Status",
      "Composite Score",
      "Say-Do Score",
      "Flags Count",
      "Submitted At",
    ];
    const rows = data.map((s) => [
      s.id || "",
      `"${(s.candidate?.name || s.candidateName || "Candidate").replace(/"/g, '""')}"`,
      `"${(s.candidate?.email || s.candidateEmail || "").replace(/"/g, '""')}"`,
      `"${(s.roleTemplate?.roleName || s.roleTemplateName || "").replace(/"/g, '""')}"`,
      `"${(s.driveName || "").replace(/"/g, '""')}"`,
      s.status || "",
      s.compositeScore !== null && s.compositeScore !== undefined ? s.compositeScore : "",
      s.sayDoScore !== null && s.sayDoScore !== undefined ? s.sayDoScore : "",
      s.integrityFlags?.length ?? s.flagsCount ?? 0,
      s.submittedAt ? new Date(s.submittedAt).toISOString() : "",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filenamePrefix}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 2. Export JSON
  const handleExportJSON = () => {
    setOpen(false);
    const payload = reportType === "analytics" && analyticsPayload
      ? {
          title,
          subtitle: subtitle || "Assessment performance metrics, integrity analytics, and cohort comparison",
          generatedAt: new Date().toISOString(),
          filters: {
            dateRange: analyticsPayload.dateRange || "All Time",
            drive: analyticsPayload.driveFilter || "All Drives",
            modules: analyticsPayload.modulesFilter || "All Modules",
            scope: analyticsPayload.variant || "internal",
          },
          summary: {
            totalAssessed: analyticsPayload.totalAssessed,
            avgScore: analyticsPayload.avgScore,
            avgConsistency: analyticsPayload.avgConsistency,
            passRate: analyticsPayload.passRate,
          },
          moduleAverages: analyticsPayload.moduleAverages,
          scoreDistribution: analyticsPayload.scoreBandData,
          integrity: analyticsPayload.integrityAnalytics,
        }
      : {
          title,
          subtitle: subtitle || "Actionable list of all assessment sessions requiring evaluation",
          filter: activeFilter,
          generatedAt: new Date().toISOString(),
          recordCount: data.length,
          records: data,
        };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenamePrefix}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print Execution Helper: Generates an HTML document Blob, opens it in a new tab, and triggers print preview
  const printHtmlReport = (htmlContent: string) => {
    try {
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, "_blank");
      if (printWindow) {
        return;
      }

      // Fallback: Programmatic link click if popup blocker intercepted window.open
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
      }, 1000);
    } catch (e) {
      console.error("Failed to export PDF report:", e);
      alert("Unable to open print preview. Please check your browser popup settings.");
    }
  };

  // 3. Export PDF
  const handleExportPDF = () => {
    setOpen(false);

    const now = new Date();
    const dateFormatted = now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeFormatted = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const dateCode = now.toISOString().slice(0, 10).replace(/-/g, "");
    const reportId = `PRC-${dateCode}-001`;

    const shieldCheckSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`;
    const alertTriangleSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-icon"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-icon"><polyline points="20 6 9 17 4 12"/></svg>`;

    // If this is an Analytics report, generate the specialized analytics visual layout
    if (reportType === "analytics" && analyticsPayload) {
      const {
        totalAssessed = 0,
        avgScore = 0,
        avgConsistency = 0,
        passRate = 0,
        moduleAverages = [],
        scoreBandData = [],
        integrityAnalytics = { lowPct: 100, medPct: 0, highPct: 0, violations: [] },
        dateRange = "All Time",
        driveFilter = "All Drives & Roles",
        modulesFilter = "All Modules",
      } = analyticsPayload;

      // Module SVGs map
      const getModuleIconSvg = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes("cod") || lower.includes("dsa")) {
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
        }
        if (lower.includes("sql") || lower.includes("data")) {
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
        }
        if (lower.includes("mcq") || lower.includes("know")) {
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
        }
        if (lower.includes("prompt") || lower.includes("ai")) {
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`;
        }
        if (lower.includes("simulat")) {
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>`;
        }
        return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>`;
      };

      // Violation SVGs map
      const getViolationIconSvg = (cat: string) => {
        const c = cat.toUpperCase();
        if (c.includes("BROWSER") || c.includes("TAB") || c.includes("APP")) {
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`;
        }
        if (c.includes("GAZE") || c.includes("LOOK") || c.includes("VISUAL")) {
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
        }
        if (c.includes("FACE_SEAT") || c.includes("MISSING") || c.includes("USER")) {
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
        }
        if (c.includes("OBJECT") || c.includes("PHONE")) {
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        }
        if (c.includes("AUDIO") || c.includes("SPEECH") || c.includes("VOICE")) {
          return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
        }
        return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
      };

      // Score band max count calculation
      const maxBandCount = Math.max(...scoreBandData.map((d) => d.count), 1);

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Assessment Analytics Report — Proctora</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
              * { box-sizing: border-box; }
              html, body {
                margin: 0;
                padding: 0;
                background: #FFFFFF;
              }
              body {
                font-family: 'Inter', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #111827;
                padding: 22px;
                line-height: 1.4;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .brand-bar {
                height: 4px;
                background: linear-gradient(90deg, #2563EB 0%, #3B82F6 60%, #60A5FA 100%);
                border-radius: 2px;
                margin-bottom: 16px;
              }
              .header-container {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 18px;
                padding-bottom: 14px;
                border-bottom: 1px solid #E5E7EB;
              }
              .logo-wrap {
                display: flex;
                align-items: flex-start;
                gap: 10px;
              }
              .logo-icon {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                background: #EFF6FF;
                border: 1px solid #DBEAFE;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                margin-top: 1px;
              }
              .meta-box {
                text-align: right;
                flex-shrink: 0;
              }
              .kpi-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 12px;
                margin-bottom: 18px;
              }
              .kpi-card {
                background: #FFFFFF;
                border: 1px solid #E2E8F0;
                border-radius: 10px;
                padding: 12px 14px;
                display: flex;
                flex-col;
                flex-direction: column;
                justify-content: space-between;
                height: 96px;
              }
              .kpi-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
              }
              .kpi-title {
                font-size: 9.5px;
                font-weight: 700;
                color: #64748B;
                text-transform: uppercase;
                letter-spacing: 0.05em;
              }
              .kpi-icon {
                width: 24px;
                height: 24px;
                border-radius: 6px;
                background: #EFF6FF;
                color: #2563EB;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .kpi-value {
                font-size: 22px;
                font-weight: 800;
                color: #0F172A;
                line-height: 1.1;
                font-family: 'Inter', sans-serif;
              }
              .kpi-sub {
                font-size: 9.5px;
                font-weight: 500;
                color: #64748B;
                display: flex;
                align-items: center;
                gap: 4px;
              }
              .two-col-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 14px;
                margin-bottom: 18px;
              }
              .chart-card {
                background: #FFFFFF;
                border: 1px solid #E2E8F0;
                border-radius: 12px;
                padding: 14px 16px;
                display: flex;
                flex-direction: column;
              }
              .chart-card-title {
                font-size: 12px;
                font-weight: 700;
                color: #0F172A;
                margin: 0 0 2px 0;
              }
              .chart-card-sub {
                font-size: 10px;
                color: #64748B;
                margin: 0 0 12px 0;
              }
              .bar-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 9px;
              }
              .bar-label-wrap {
                display: flex;
                align-items: center;
                gap: 6px;
                width: 140px;
                flex-shrink: 0;
              }
              .bar-icon {
                width: 20px;
                height: 20px;
                border-radius: 5px;
                background: #F1F5F9;
                color: #475569;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
              }
              .bar-name {
                font-size: 11px;
                font-weight: 600;
                color: #1E293B;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .bar-track {
                flex: 1;
                height: 7px;
                background: #F1F5F9;
                border-radius: 999px;
                margin: 0 10px;
                overflow: hidden;
                position: relative;
              }
              .bar-fill {
                height: 100%;
                background: #2563EB;
                border-radius: 999px;
              }
              .bar-fill-empty {
                height: 100%;
                background: #E2E8F0;
                border-radius: 999px;
              }
              .bar-value {
                width: 42px;
                text-align: right;
                font-size: 11px;
                font-weight: 700;
                color: #0F172A;
                font-family: 'JetBrains Mono', monospace;
              }
              .bar-value-muted {
                color: #94A3B8;
                font-weight: 500;
              }
              .vertical-bars-wrap {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: 12px;
                height: 140px;
                padding-top: 10px;
              }
              .v-bar-col {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-end;
                height: 100%;
              }
              .v-bar-count {
                font-size: 11.5px;
                font-weight: 700;
                color: #0F172A;
                margin-bottom: 4px;
                font-family: 'JetBrains Mono', monospace;
              }
              .v-bar-track {
                width: 100%;
                max-width: 44px;
                height: 90px;
                background: #F1F5F9;
                border-radius: 7px;
                display: flex;
                align-items: flex-end;
                overflow: hidden;
              }
              .v-bar-fill {
                width: 100%;
                background: #2563EB;
                border-radius: 7px 7px 0 0;
              }
              .v-bar-label {
                font-size: 10px;
                font-weight: 500;
                color: #64748B;
                margin-top: 6px;
                text-align: center;
                white-space: nowrap;
              }
              .page-break {
                page-break-before: always;
                break-before: page;
              }
              .risk-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 12px;
                margin-bottom: 14px;
              }
              .risk-card {
                border-radius: 10px;
                padding: 12px 14px;
                background: #FFFFFF;
                border: 1px solid #E2E8F0;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                height: 84px;
              }
              .risk-card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
              }
              .risk-card-title {
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #64748B;
              }
              .risk-card-value {
                font-size: 20px;
                font-weight: 800;
                color: #0F172A;
                line-height: 1.1;
                font-family: 'Inter', sans-serif;
              }
              .risk-card-sub {
                font-size: 9px;
                color: #64748B;
              }
              .violation-table {
                width: 100%;
                border-collapse: collapse;
                border: 1px solid #E2E8F0;
                border-radius: 10px;
                overflow: hidden;
              }
              .violation-table th {
                background: #F8FAFC;
                color: #64748B;
                font-size: 9.5px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 8px 10px;
                border-bottom: 1px solid #E2E8F0;
                text-align: left;
              }
              .violation-table td {
                padding: 8px 10px;
                border-bottom: 1px solid #F1F5F9;
                font-size: 11px;
                vertical-align: middle;
              }
              .violation-icon-wrap {
                width: 22px;
                height: 22px;
                border-radius: 6px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-right: 8px;
                flex-shrink: 0;
                vertical-align: middle;
              }
              .pill-risk {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 2.5px 7px;
                border-radius: 999px;
                font-size: 8.5px;
                font-weight: 700;
                letter-spacing: 0.04em;
                text-transform: uppercase;
              }
              .pill-risk-low {
                background: #EFF6FF;
                color: #2563EB;
                border: 1px solid #BFDBFE;
              }
              .pill-risk-medium {
                background: #FFFBEB;
                color: #D97706;
                border: 1px solid #FDE68A;
              }
              .pill-risk-high {
                background: #FEF2F2;
                color: #DC2626;
                border: 1px solid #FECACA;
              }
              .footer {
                margin-top: 16px;
                padding-top: 8px;
                border-top: 1px solid #E5E7EB;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 10px;
                color: #94A3B8;
              }
              @media print {
                html, body {
                  padding: 0;
                  margin: 0;
                }
                body {
                  padding: 5mm;
                }
                @page {
                  size: portrait;
                  margin: 8mm 6mm 10mm 6mm;
                }
                .page-break {
                  page-break-before: always !important;
                  break-before: page !important;
                }
              }
            </style>
          </head>
          <body>
            <!-- PAGE 1: OVERVIEW & DOMAIN METRICS -->
            <div class="brand-bar"></div>

            <!-- Header / Masthead -->
            <div class="header-container">
              <div class="logo-wrap">
                <div class="logo-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="5.5" />
                    <circle cx="12" cy="12" r="2" fill="#2563EB" />
                  </svg>
                </div>
                <div>
                  <div style="display: flex; align-items: center; gap: 7px;">
                    <span style="font-size: 16px; font-weight: 700; color: #111827; letter-spacing: -0.02em;">Proctora</span>
                    <span style="font-size: 9.5px; font-weight: 600; background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; padding: 1.5px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em;">ANALYTICS REPORT</span>
                  </div>
                  <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 2px 0 0 0; letter-spacing: -0.02em; line-height: 1.25;">Assessment Analytics Report</h1>
                  <p style="font-size: 11px; font-weight: 400; color: #64748B; margin: 2px 0 0 0; line-height: 1.3;">Performance metrics, domain mastery, and integrity risk analysis</p>
                </div>
              </div>

              <div class="meta-box">
                <div style="display: inline-block; padding: 2px 7px; font-size: 9px; font-weight: 700; text-transform: uppercase; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; border-radius: 4px; margin-bottom: 3px; letter-spacing: 0.05em;">
                  CONFIDENTIAL
                </div>
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #64748B; font-weight: 600;">
                  Report ID: ${reportId}
                </div>
                <div style="font-size: 10px; font-weight: 400; color: #94A3B8; margin-top: 1px;">
                  Generated on ${dateFormatted}, ${timeFormatted}
                </div>
                <div style="font-size: 10px; font-weight: 500; color: #475569; margin-top: 3px;">
                  <span><strong>Date Range:</strong> ${dateRange}</span>
                  <span style="margin: 0 4px;">•</span>
                  <span><strong>Drive/Role:</strong> ${driveFilter}</span>
                  <span style="margin: 0 4px;">•</span>
                  <span><strong>Modules:</strong> ${modulesFilter}</span>
                </div>
              </div>
            </div>

            <!-- Summary Stats Row (4 KPI Cards) -->
            <div class="kpi-grid">
              <!-- Card 1: Total Assessed -->
              <div class="kpi-card">
                <div class="kpi-header">
                  <span class="kpi-title">TOTAL ASSESSED</span>
                  <div class="kpi-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                </div>
                <div class="kpi-value">${totalAssessed}</div>
                <div class="kpi-sub">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                  <span>Cohort sessions evaluated</span>
                </div>
              </div>

              <!-- Card 2: Avg Composite Score -->
              <div class="kpi-card">
                <div class="kpi-header">
                  <span class="kpi-title">AVG COMPOSITE SCORE</span>
                  <div class="kpi-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
                  </div>
                </div>
                <div class="kpi-value">${avgScore}%</div>
                <div class="kpi-sub">
                  <span>Across completed modules</span>
                </div>
              </div>

              <!-- Card 3: Say-Do Consistency -->
              <div class="kpi-card">
                <div class="kpi-header">
                  <span class="kpi-title">SAY-DO CONSISTENCY</span>
                  <div class="kpi-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.48 12H2"/></svg>
                  </div>
                </div>
                <div class="kpi-value">${avgConsistency}%</div>
                <div class="kpi-sub">
                  <span>Claim vs. action alignment</span>
                </div>
              </div>

              <!-- Card 4: Overall Pass Rate -->
              <div class="kpi-card">
                <div class="kpi-header">
                  <span class="kpi-title">OVERALL PASS RATE</span>
                  <div class="kpi-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                  </div>
                </div>
                <div class="kpi-value">${passRate}%</div>
                <div class="kpi-sub">
                  <span>Decision threshold (≥70%)</span>
                </div>
              </div>
            </div>

            <!-- Two-Column Visual Charts Row -->
            <div class="two-col-grid">
              <!-- Left Chart: Module Performance Averages (Horizontal Bar Chart) -->
              <div class="chart-card">
                <h3 class="chart-card-title">Module Performance Averages</h3>
                <p class="chart-card-sub">Average score per assessment domain (0–100%)</p>

                <div style="margin-top: 4px;">
                  ${moduleAverages.map((m) => {
                    const hasScore = m.score !== null && m.score !== undefined;
                    const pct = hasScore ? Math.min(100, Math.max(0, m.score!)) : 0;
                    const iconSvg = getModuleIconSvg(m.name);

                    return `
                      <div class="bar-row">
                        <div class="bar-label-wrap">
                          <div class="bar-icon">${iconSvg}</div>
                          <span class="bar-name">${m.name}</span>
                        </div>
                        <div class="bar-track">
                          ${
                            hasScore
                              ? `<div class="bar-fill" style="width: ${pct}%;"></div>`
                              : `<div class="bar-fill-empty" style="width: 100%;"></div>`
                          }
                        </div>
                        <div class="bar-value ${!hasScore ? "bar-value-muted" : ""}">
                          ${hasScore ? `${pct}%` : "—"}
                        </div>
                      </div>
                    `;
                  }).join("")}
                </div>
              </div>

              <!-- Right Chart: Score Distribution Bands (Vertical Bar Chart) -->
              <div class="chart-card">
                <h3 class="chart-card-title">Score Distribution Bands</h3>
                <p class="chart-card-sub">Candidate frequency across performance tiers</p>

                <div class="vertical-bars-wrap">
                  ${scoreBandData.map((band) => {
                    const heightPct = band.count > 0 ? Math.max(16, Math.round((band.count / maxBandCount) * 100)) : 0;
                    return `
                      <div class="v-bar-col">
                        <span class="v-bar-count">${band.count}</span>
                        <div class="v-bar-track">
                          <div class="v-bar-fill" style="height: ${heightPct}%;"></div>
                        </div>
                        <span class="v-bar-label">${band.band}</span>
                      </div>
                    `;
                  }).join("")}
                </div>
              </div>
            </div>

            <!-- Page 1 Footer -->
            <div class="footer">
              <span>Proctora Assessment & Analytics Platform</span>
              <span>Page 1 of 2 • Confidential Report</span>
            </div>

            <!-- PAGE BREAK TO PAGE 2: INTEGRITY & RISK ANALYTICS -->
            <div class="page-break" style="margin-top: 24px;"></div>
            <div class="brand-bar"></div>

            <!-- Page 2 Header -->
            <div class="header-container">
              <div class="logo-wrap">
                <div class="logo-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div>
                  <div style="display: flex; align-items: center; gap: 7px;">
                    <span style="font-size: 16px; font-weight: 700; color: #111827; letter-spacing: -0.02em;">Proctora</span>
                    <span style="font-size: 9.5px; font-weight: 600; background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; padding: 1.5px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em;">INTEGRITY &amp; RISK</span>
                  </div>
                  <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 2px 0 0 0; letter-spacing: -0.02em; line-height: 1.25;">Integrity &amp; Risk Analytics</h1>
                  <p style="font-size: 11px; font-weight: 400; color: #64748B; margin: 2px 0 0 0; line-height: 1.3;">Proctoring flag breakdown, risk tiers, and telemetry event distribution</p>
                </div>
              </div>

              <div class="meta-box">
                <div style="display: inline-block; padding: 2px 7px; font-size: 9px; font-weight: 700; text-transform: uppercase; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; border-radius: 4px; margin-bottom: 3px; letter-spacing: 0.05em;">
                  CONFIDENTIAL
                </div>
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #64748B; font-weight: 600;">
                  Report ID: ${reportId}
                </div>
                <div style="font-size: 10px; font-weight: 400; color: #94A3B8; margin-top: 1px;">
                  Generated on ${dateFormatted}, ${timeFormatted}
                </div>
              </div>
            </div>

            <!-- 3 Risk Severity KPI Cards -->
            <div class="risk-grid">
              <div class="risk-card" style="border-left: 3.5px solid #10B981;">
                <div class="risk-card-header">
                  <span class="risk-card-title">LOW RISK SESSIONS</span>
                  <div style="width: 22px; height: 22px; border-radius: 6px; background: #ECFDF5; color: #059669; display: flex; align-items: center; justify-content: center;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                </div>
                <div class="risk-card-value">${integrityAnalytics.lowPct}%</div>
                <div class="risk-card-sub">0–1 minor integrity telemetry logs</div>
              </div>

              <div class="risk-card" style="border-left: 3.5px solid #F59E0B;">
                <div class="risk-card-header">
                  <span class="risk-card-title">MEDIUM RISK SESSIONS</span>
                  <div style="width: 22px; height: 22px; border-radius: 6px; background: #FFFBEB; color: #D97706; display: flex; align-items: center; justify-content: center;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </div>
                </div>
                <div class="risk-card-value">${integrityAnalytics.medPct}%</div>
                <div class="risk-card-sub">2–3 tab switches or gaze shifts</div>
              </div>

              <div class="risk-card" style="border-left: 3.5px solid #EF4444;">
                <div class="risk-card-header">
                  <span class="risk-card-title">HIGH RISK SESSIONS</span>
                  <div style="width: 22px; height: 22px; border-radius: 6px; background: #FEF2F2; color: #DC2626; display: flex; align-items: center; justify-content: center;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </div>
                </div>
                <div class="risk-card-value">${integrityAnalytics.highPct}%</div>
                <div class="risk-card-sub">Multiple face/object/speech flags</div>
              </div>
            </div>

            <!-- Proctoring Flag Telemetry Breakdown Table -->
            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; margin-top: 14px;">
              <h3 style="font-size: 12px; font-weight: 700; color: #0F172A; margin: 0 0 2px 0;">Proctoring Flag &amp; Evidence Telemetry Breakdown</h3>
              <p style="font-size: 10px; color: #64748B; margin: 0 0 12px 0;">Detailed frequency and risk level of recorded behavioral events</p>

              <table class="violation-table">
                <thead>
                  <tr>
                    <th style="width: 44%;">Violation Type &amp; Description</th>
                    <th style="width: 22%;">Category Code</th>
                    <th style="width: 18%; text-align: right;">Occurrences</th>
                    <th style="width: 16%; text-align: center;">Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  ${integrityAnalytics.violations.map((v) => {
                    const iconSvg = getViolationIconSvg(v.category);
                    const pillClass =
                      v.risk === "HIGH"
                        ? "pill-risk-high"
                        : v.risk === "MEDIUM"
                        ? "pill-risk-medium"
                        : "pill-risk-low";

                    const bgIconClass =
                      v.risk === "HIGH"
                        ? "background: #FEF2F2; color: #DC2626;"
                        : v.risk === "MEDIUM"
                        ? "background: #FFFBEB; color: #D97706;"
                        : "background: #EFF6FF; color: #2563EB;";

                    return `
                      <tr>
                        <td>
                          <div style="display: flex; align-items: center;">
                            <div class="violation-icon-wrap" style="${bgIconClass}">${iconSvg}</div>
                            <div>
                              <div style="font-weight: 600; color: #0F172A;">${v.name}</div>
                              <div style="font-size: 9.5px; color: #64748B;">${v.rate}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #475569; background: #F1F5F9; padding: 2px 5px; border-radius: 4px;">
                            ${v.category}
                          </span>
                        </td>
                        <td style="text-align: right; font-weight: 700; color: #0F172A; font-family: 'JetBrains Mono', monospace;">
                          ${v.count} <span style="font-weight: 400; font-size: 9.5px; color: #64748B;">logs</span>
                        </td>
                        <td style="text-align: center;">
                          <span class="pill-risk ${pillClass}">${v.risk} RISK</span>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>

            <!-- Page 2 Footer -->
            <div class="footer" style="margin-top: 24px;">
              <span>Proctora Assessment & Analytics Platform</span>
              <span>Page 2 of 2 • Confidential Report</span>
            </div>

            <script>
              window.addEventListener('load', function() {
                setTimeout(function() {
                  try { window.focus(); window.print(); } catch(e) {}
                }, 250);
              });
              setTimeout(function() {
                try { window.focus(); window.print(); } catch(e) {}
              }, 800);
            </script>
          </body>
        </html>
      `;

      printHtmlReport(htmlContent);
      return;
    }

    // Default Roster & Candidate session table PDF export
    const rowsHtml = data.map((item, index) => {
      const name = item.candidate?.name || item.candidateName || "Candidate";
      const email = item.candidate?.email || item.candidateEmail || "";
      const initialLetter = (name || "C").charAt(0).toUpperCase();

      const roleTrack = item.roleTemplate?.roleName || item.roleTemplateName || item.role || "Software Engineer";
      const driveName = item.driveName || item.drive?.name || "Drive Session";

      // Status mapping: submitted/ai_scored/pending -> Needs Audit (yellow), review/reviewed -> Reviewed (blue), decision/decided/pass/fail -> Decided (green)
      const rawStatus = String(item.status || "submitted").toLowerCase().trim();
      let statusPill = "";
      if (
        rawStatus === "decision" ||
        rawStatus === "decided" ||
        rawStatus === "pass" ||
        rawStatus === "fail" ||
        rawStatus === "approved" ||
        rawStatus === "rejected"
      ) {
        statusPill = `<span class="pill pill-green"><span class="dot dot-green"></span>Decided</span>`;
      } else if (rawStatus === "reviewed" || rawStatus === "review" || rawStatus === "in_review") {
        statusPill = `<span class="pill pill-blue"><span class="dot dot-blue"></span>Reviewed</span>`;
      } else {
        statusPill = `<span class="pill pill-amber"><span class="dot dot-amber"></span>Needs Audit</span>`;
      }

      // Composite Score pill (color-scaled: green >= 70%, yellow 40-69%, red < 40%, gray "—" if not scored)
      const rawScore = item.compositeScore;
      let scorePill = `<span class="pill pill-neutral font-mono">—</span>`;
      if (typeof rawScore === "number") {
        const sVal = Math.round(rawScore);
        if (sVal >= 70) {
          scorePill = `<span class="pill pill-green font-mono">${sVal}%</span>`;
        } else if (sVal >= 40) {
          scorePill = `<span class="pill pill-amber font-mono">${sVal}%</span>`;
        } else {
          scorePill = `<span class="pill pill-red font-mono">${sVal}%</span>`;
        }
      }

      // Say-Do Sync pill (same color-scaling as score, gray "—" if not available)
      const rawSayDo = item.sayDoScore;
      let sayDoPill = `<span class="pill pill-neutral font-mono">—</span>`;
      if (typeof rawSayDo === "number") {
        const sdVal = Math.round(rawSayDo);
        if (sdVal >= 70) {
          sayDoPill = `<span class="pill pill-green font-mono">${sdVal}%</span>`;
        } else if (sdVal >= 40) {
          sayDoPill = `<span class="pill pill-amber font-mono">${sdVal}%</span>`;
        } else {
          sayDoPill = `<span class="pill pill-red font-mono">${sdVal}%</span>`;
        }
      }

      // Risk Flags pill: Clean = green checkmark, Flagged = red warning icon with flag count
      const flags = item.integrityFlags || [];
      const flagsCount = Array.isArray(flags)
        ? flags.length
        : typeof item.integrityFlagsCount === "number"
        ? item.integrityFlagsCount
        : item.flagsCount || 0;

      let riskPill = "";
      if (flagsCount === 0) {
        riskPill = `<span class="pill pill-green">${checkSvg} Clean</span>`;
      } else if (flagsCount === 1) {
        riskPill = `<span class="pill pill-red">${alertTriangleSvg} 1 Flag</span>`;
      } else {
        riskPill = `<span class="pill pill-red">${alertTriangleSvg} ${flagsCount} Flags</span>`;
      }

      const rowBg = index % 2 === 1 ? "background-color: #F9FAFB;" : "background-color: #FFFFFF;";

      return `
        <tr style="${rowBg} border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 10px 10px; width: 26%; vertical-align: middle;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="avatar">${initialLetter}</div>
              <div style="min-width: 0; flex: 1;">
                <div style="font-weight: 600; color: #111827; font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</div>
                <div style="font-size: 10px; font-weight: 400; color: #6B7280; font-family: 'JetBrains Mono', 'Roboto Mono', monospace; margin-top: 2px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${email || "No email"}</div>
              </div>
            </div>
          </td>
          <td style="padding: 10px 10px; width: 24%; vertical-align: middle;">
            <div style="font-weight: 600; color: #111827; font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${roleTrack}</div>
            <div style="font-size: 10px; font-weight: 400; color: #6B7280; margin-top: 2px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${driveName}</div>
          </td>
          <td style="padding: 10px 6px; width: 14%; text-align: center; vertical-align: middle;">${statusPill}</td>
          <td style="padding: 10px 6px; width: 12%; text-align: center; vertical-align: middle;">${scorePill}</td>
          <td style="padding: 10px 6px; width: 12%; text-align: center; vertical-align: middle;">${sayDoPill}</td>
          <td style="padding: 10px 6px; width: 12%; text-align: center; vertical-align: middle;">${riskPill}</td>
        </tr>
      `;
    }).join("");

    // Calculate max funnel count for proportional bar rendering
    const funnelStages = dashboardPayload?.funnel || [
      { stage: "Invited", count: data.length > 0 ? data.length + 2 : 7 },
      { stage: "Started", count: data.length > 0 ? data.length + 1 : 6 },
      { stage: "Completed", count: data.length > 0 ? data.length : 5 },
      { stage: "Reviewed", count: data.filter((s: any) => s.status === "reviewed" || s.status === "decision" || s.status === "pass" || s.status === "fail").length },
      { stage: "Decided", count: data.filter((s: any) => s.status === "decision" || s.status === "pass" || s.status === "fail").length },
    ];
    const maxFunnelCount = Math.max(...funnelStages.map((f) => f.count), 1);

    const totalCandCount = dashboardPayload?.totalCandidates ?? data.length;
    const activePipelineCount = dashboardPayload?.activePipeline ?? data.filter((s: any) => s.status === "submitted" || s.status === "ai_scored" || s.status === "review" || s.status === "pending").length;
    const passRateVal = dashboardPayload?.passRate ?? (data.length > 0 ? Math.round((data.filter((s: any) => s.compositeScore >= 70 || s.status === "decision" || s.status === "reviewed").length / data.length) * 100) : 100);
    const flagRateVal = dashboardPayload?.flagRate ?? 0;

    const pendingAudits = dashboardPayload?.actionQueue?.pendingReviewsCount ?? data.filter((s: any) => s.status === "ai_scored" || s.status === "submitted" || s.status === "review" || s.status === "pending").length;
    const expiringSoon = dashboardPayload?.actionQueue?.expiringInvitesCount ?? 0;
    const closingDrives = dashboardPayload?.actionQueue?.closingDrivesCount ?? 0;
    const reportSubtitle = subtitle || "Actionable list of all assessment sessions requiring evaluation & executive overview";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title} — Proctora</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              background: #FFFFFF;
            }
            body {
              font-family: 'Inter', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #111827;
              padding: 20px;
              line-height: 1.4;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .brand-bar {
              height: 4px;
              background: linear-gradient(90deg, #2563EB 0%, #3B82F6 60%, #60A5FA 100%);
              border-radius: 2px;
              margin-bottom: 14px;
            }
            .header-container {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 14px;
              padding-bottom: 12px;
              border-bottom: 1px solid #E5E7EB;
            }
            .logo-wrap {
              display: flex;
              align-items: flex-start;
              gap: 10px;
            }
            .logo-icon {
              width: 32px;
              height: 32px;
              border-radius: 8px;
              background: #EFF6FF;
              border: 1px solid #DBEAFE;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              margin-top: 1px;
            }
            .meta-box {
              text-align: right;
              flex-shrink: 0;
            }
            .kpi-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin-bottom: 12px;
            }
            .kpi-card {
              background: #FFFFFF;
              border: 1px solid #E2E8F0;
              border-radius: 10px;
              padding: 10px 12px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              height: 84px;
            }
            .kpi-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .kpi-title {
              font-size: 8.5px;
              font-weight: 700;
              color: #64748B;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .kpi-icon {
              width: 22px;
              height: 22px;
              border-radius: 5px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .kpi-value-row {
              display: flex;
              align-items: baseline;
              gap: 4px;
            }
            .kpi-value {
              font-size: 20px;
              font-weight: 800;
              color: #0F172A;
              line-height: 1.1;
              font-family: 'Inter', sans-serif;
            }
            .kpi-unit {
              font-size: 9.5px;
              color: #64748B;
              font-weight: 500;
            }
            .badge-pill {
              display: inline-flex;
              align-items: center;
              gap: 2px;
              padding: 1.5px 5px;
              border-radius: 4px;
              font-size: 8.5px;
              font-weight: 700;
            }
            .two-col-summary {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px;
              margin-bottom: 14px;
            }
            .section-card {
              background: #FFFFFF;
              border: 1px solid #E2E8F0;
              border-radius: 10px;
              padding: 10px 14px;
              display: flex;
              flex-direction: column;
            }
            .section-card-title {
              font-size: 10.5px;
              font-weight: 700;
              color: #0F172A;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              margin: 0 0 8px 0;
            }
            .action-item {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 6px 8px;
              background: #F8FAFC;
              border-radius: 6px;
              margin-bottom: 5px;
              font-size: 10.5px;
            }
            .action-item:last-child {
              margin-bottom: 0;
            }
            .funnel-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 5px;
              font-size: 10px;
            }
            .funnel-row:last-child {
              margin-bottom: 0;
            }
            .funnel-label {
              width: 65px;
              font-weight: 600;
              color: #334155;
            }
            .funnel-bar-track {
              flex: 1;
              height: 6px;
              background: #F1F5F9;
              border-radius: 999px;
              margin: 0 8px;
              overflow: hidden;
            }
            .funnel-bar-fill {
              height: 100%;
              background: #2563EB;
              border-radius: 999px;
            }
            .funnel-count {
              width: 25px;
              text-align: right;
              font-weight: 700;
              color: #0F172A;
              font-family: 'JetBrains Mono', monospace;
            }
            .roster-header-strip {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 8px;
            }
            .roster-title {
              font-size: 12px;
              font-weight: 700;
              color: #0F172A;
              letter-spacing: -0.01em;
            }
            table {
              width: 100%;
              table-layout: fixed;
              border-collapse: collapse;
              text-align: left;
              font-size: 11px;
              font-weight: 400;
              border-radius: 8px;
              overflow: hidden;
              border: 1px solid #E5E7EB;
            }
            thead {
              display: table-header-group;
            }
            tfoot {
              display: table-footer-group;
            }
            thead th {
              font-family: 'Inter', sans-serif;
              background-color: #F9FAFB;
              color: #6B7280;
              font-size: 9.5px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              padding: 8px 9px;
              border-bottom: 2px solid #E5E7EB;
              line-height: 1.3;
            }
            .avatar {
              width: 22px;
              height: 22px;
              border-radius: 50%;
              background-color: #EFF6FF;
              color: #2563EB;
              border: 1px solid #DBEAFE;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-family: 'Inter', sans-serif;
              font-weight: 700;
              font-size: 9.5px;
              flex-shrink: 0;
            }
            .pill {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 3px;
              padding: 2.5px 7px;
              border-radius: 9999px;
              font-family: 'Inter', sans-serif;
              font-size: 9.5px;
              font-weight: 500;
              line-height: 1.2;
              white-space: nowrap;
            }
            .dot {
              width: 4.5px;
              height: 4.5px;
              border-radius: 50%;
              display: inline-block;
              margin-right: 2px;
            }
            .dot-green { background-color: #10B981; }
            .dot-blue { background-color: #3B82F6; }
            .dot-amber { background-color: #F59E0B; }
            .pill-green {
              background-color: #ECFDF5;
              color: #059669;
              border: 1px solid #A7F3D0;
            }
            .pill-red {
              background-color: #FEF2F2;
              color: #DC2626;
              border: 1px solid #FECACA;
            }
            .pill-amber {
              background-color: #FFFBEB;
              color: #D97706;
              border: 1px solid #FDE68A;
            }
            .pill-blue {
              background-color: #EFF6FF;
              color: #2563EB;
              border: 1px solid #BFDBFE;
            }
            .pill-neutral {
              background-color: #F1F5F9;
              color: #94A3B8;
              border: 1px solid #E2E8F0;
            }
            .font-mono {
              font-family: 'JetBrains Mono', 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
            }
            .footer {
              margin-top: 14px;
              padding-top: 8px;
              border-top: 1px solid #E5E7EB;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 9.5px;
              font-weight: 400;
              color: #9CA3AF;
              line-height: 1.3;
            }
            @media print {
              html, body {
                padding: 0;
                margin: 0;
              }
              body {
                padding: 5mm;
              }
              @page {
                size: portrait;
                margin: 8mm 6mm 10mm 6mm;
              }
              thead { display: table-header-group; }
              tr {
                page-break-inside: avoid;
                break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="brand-bar"></div>

          <!-- Header / Masthead -->
          <div class="header-container">
            <div class="logo-wrap">
              <div class="logo-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="5.5" />
                  <circle cx="12" cy="12" r="2" fill="#2563EB" />
                </svg>
              </div>
              <div>
                <div style="display: flex; align-items: center; gap: 7px;">
                  <span style="font-size: 16px; font-weight: 700; color: #111827; letter-spacing: -0.02em;">Proctora</span>
                  <span style="font-size: 9px; font-weight: 600; background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; padding: 1.5px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em;">EXECUTIVE EVALUATION ROSTER</span>
                </div>
                <h1 style="font-size: 19px; font-weight: 700; color: #111827; margin: 2px 0 0 0; letter-spacing: -0.02em; line-height: 1.25;">Candidate Evaluation &amp; Assessment Dashboard</h1>
                <p style="font-size: 10.5px; font-weight: 400; color: #6B7280; margin: 2px 0 0 0; line-height: 1.3;">${reportSubtitle}</p>
              </div>
            </div>

            <div class="meta-box">
              <div style="display: inline-block; padding: 2px 7px; font-size: 9px; font-weight: 700; text-transform: uppercase; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; border-radius: 4px; margin-bottom: 3px; letter-spacing: 0.05em;">
                CONFIDENTIAL
              </div>
              <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #6B7280; font-weight: 600;">
                Report ID: ${reportId}
              </div>
              <div style="font-size: 10px; font-weight: 400; color: #9CA3AF; margin-top: 1px;">
                Generated on ${dateFormatted}, ${timeFormatted}
              </div>
              <div style="font-size: 10px; font-weight: 500; color: #4B5563; margin-top: 3px; display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                <span><strong>Total:</strong> ${data.length} Candidates</span>
                <span>•</span>
                <span style="color: #2563EB; font-weight: 600;">${activeFilter}</span>
              </div>
            </div>
          </div>

          <!-- Top 4 Summary Stat Cards -->
          <div class="kpi-grid">
            <!-- Card 1: Total Candidates -->
            <div class="kpi-card">
              <div class="kpi-header">
                <span class="kpi-title">TOTAL CANDIDATES</span>
                <div class="kpi-icon" style="background: #EFF6FF; color: #2563EB;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
              </div>
              <div class="kpi-value-row">
                <span class="kpi-value">${totalCandCount}</span>
                <span class="kpi-unit">sessions</span>
              </div>
              <div>
                <span class="badge-pill" style="background: #DCFCE7; color: #15803D;">▲ +12.05%</span>
              </div>
            </div>

            <!-- Card 2: Active Pipeline -->
            <div class="kpi-card">
              <div class="kpi-header">
                <span class="kpi-title">ACTIVE PIPELINE</span>
                <div class="kpi-icon" style="background: #E0F2FE; color: #0284C7;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
              </div>
              <div class="kpi-value-row">
                <span class="kpi-value">${activePipelineCount}</span>
                <span class="kpi-unit">in progress</span>
              </div>
              <div>
                <span class="badge-pill" style="background: #FEE2E2; color: #DC2626;">▼ -8.25%</span>
              </div>
            </div>

            <!-- Card 3: Pass Rate -->
            <div class="kpi-card">
              <div class="kpi-header">
                <span class="kpi-title">PASS RATE</span>
                <div class="kpi-icon" style="background: #DCFCE7; color: #16A34A;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                </div>
              </div>
              <div class="kpi-value-row">
                <span class="kpi-value">${passRateVal}</span>
                <span class="kpi-unit">% benchmark</span>
              </div>
              <div>
                <span class="badge-pill" style="background: #DCFCE7; color: #15803D;">▲ +25.21%</span>
              </div>
            </div>

            <!-- Card 4: Critical Risk -->
            <div class="kpi-card">
              <div class="kpi-header">
                <span class="kpi-title">CRITICAL RISK</span>
                <div class="kpi-icon" style="background: #FEF3C7; color: #D97706;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
              </div>
              <div class="kpi-value-row">
                <span class="kpi-value">${flagRateVal}</span>
                <span class="kpi-unit">% flagged</span>
              </div>
              <div>
                <span class="badge-pill" style="background: #F1F5F9; color: #475569;">▲ 0.00%</span>
              </div>
            </div>
          </div>

          <!-- Two-Column Strip: Action Queue (Left) + Pipeline Funnel (Right) -->
          <div class="two-col-summary">
            <!-- Left: Action Queue Alert Status -->
            <div class="section-card">
              <div class="section-card-title">Action Queue &amp; Alerts</div>
              <div class="action-item">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #2563EB;"></span>
                  <span style="font-weight: 600; color: #1E293B;">Audit Required</span>
                  <span style="color: #64748B; font-size: 9.5px;">(Low AI confidence)</span>
                </div>
                <span style="font-weight: 700; font-family: 'JetBrains Mono', monospace; color: #2563EB; background: #EFF6FF; padding: 1px 6px; border-radius: 4px;">
                  ${pendingAudits}
                </span>
              </div>

              <div class="action-item">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #0284C7;"></span>
                  <span style="font-weight: 600; color: #1E293B;">Expiring Soon</span>
                  <span style="color: #64748B; font-size: 9.5px;">(Invitations in 24h)</span>
                </div>
                <span style="font-weight: 700; font-family: 'JetBrains Mono', monospace; color: #0284C7; background: #E0F2FE; padding: 1px 6px; border-radius: 4px;">
                  ${expiringSoon}
                </span>
              </div>

              <div class="action-item">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #6366F1;"></span>
                  <span style="font-weight: 600; color: #1E293B;">Closing Drives</span>
                  <span style="color: #64748B; font-size: 9.5px;">(Ending in 24h)</span>
                </div>
                <span style="font-weight: 700; font-family: 'JetBrains Mono', monospace; color: #6366F1; background: #EEF2FF; padding: 1px 6px; border-radius: 4px;">
                  ${closingDrives}
                </span>
              </div>
            </div>

            <!-- Right: Pipeline Funnel Progress -->
            <div class="section-card">
              <div class="section-card-title">Pipeline Funnel Progress</div>
              ${funnelStages.map((f) => {
                const widthPct = f.count > 0 ? Math.max(10, Math.round((f.count / maxFunnelCount) * 100)) : 0;
                return `
                  <div class="funnel-row">
                    <span class="funnel-label">${f.stage}</span>
                    <div class="funnel-bar-track">
                      <div class="funnel-bar-fill" style="width: ${widthPct}%;"></div>
                    </div>
                    <span class="funnel-count">${f.count}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <!-- Section Subtitle for Table -->
          <div class="roster-header-strip">
            <span class="roster-title">Candidate Evaluation Roster</span>
            <span style="font-size: 10px; color: #64748B;">Showing ${data.length} candidate sessions</span>
          </div>

          <!-- Candidates Table with Repeated Header -->
          <table>
            <thead>
              <tr>
                <th style="width: 26%;">Candidate</th>
                <th style="width: 24%;">Role / Drive</th>
                <th style="width: 14%; text-align: center;">Status</th>
                <th style="width: 12%; text-align: center;">Score</th>
                <th style="width: 12%; text-align: center;">Say-Do</th>
                <th style="width: 12%; text-align: center;">Flags</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml.length > 0 ? rowsHtml : `
                <tr>
                  <td colspan="6" style="padding: 20px; text-align: center; color: #9CA3AF; font-style: italic;">
                    No candidate assessment sessions found matching current filters.
                  </td>
                </tr>
              `}
            </tbody>
          </table>

          <!-- Footer -->
          <div class="footer">
            <span>Proctora Technical Hiring Assessment Platform</span>
            <span>Confidential Report</span>
          </div>

          <script>
            window.addEventListener('load', function() {
              setTimeout(function() {
                try { window.focus(); window.print(); } catch(e) {}
              }, 250);
            });
            setTimeout(function() {
              try { window.focus(); window.print(); } catch(e) {}
            }, 800);
          </script>
        </body>
      </html>
    `;

    printHtmlReport(htmlContent);
  };



  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-600/25 transition-all hover:scale-[1.02] cursor-pointer"
      >
        <Download size={14} className="stroke-[2.2]" />
        <span>Export</span>
        <ChevronDown size={13} className={`transition-transform duration-150 stroke-[2.2] ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-white border border-slate-100 shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-150">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 rounded-xl transition-colors cursor-pointer text-left"
          >
            <FileText size={14} className="text-blue-600" />
            <span>Export PDF Report</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-emerald-600 rounded-xl transition-colors cursor-pointer text-left"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-amber-600 rounded-xl transition-colors cursor-pointer text-left"
          >
            <FileCode size={14} className="text-amber-600" />
            <span>Export JSON Data</span>
          </button>
        </div>
      )}
    </div>
  );
}
