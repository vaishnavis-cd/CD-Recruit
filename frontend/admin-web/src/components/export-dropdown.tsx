import React, { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileText, FileSpreadsheet, FileCode } from "lucide-react";

interface ExportDropdownProps {
  data: any[];
  filenamePrefix?: string;
  title?: string;
}

export function ExportDropdown({ data = [], filenamePrefix = "proctora-export", title = "Proctora Assessment Export" }: ExportDropdownProps) {
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
    if (!data || data.length === 0) return;

    const headers = ["ID", "Candidate Name", "Email", "Role", "Drive", "Status", "Composite Score", "Say-Do Score", "Submitted At"];
    const rows = data.map((s) => [
      s.id || "",
      `"${(s.candidate?.name || s.candidateName || "Candidate").replace(/"/g, '""')}"`,
      `"${(s.candidate?.email || s.candidateEmail || "").replace(/"/g, '""')}"`,
      `"${(s.roleTemplate?.roleName || s.roleTemplateName || "").replace(/"/g, '""')}"`,
      `"${(s.driveName || "").replace(/"/g, '""')}"`,
      s.status || "",
      s.compositeScore !== null && s.compositeScore !== undefined ? s.compositeScore : "",
      s.sayDoScore !== null && s.sayDoScore !== undefined ? s.sayDoScore : "",
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
    const payload = {
      title,
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

  // 3. Export PDF
  const handleExportPDF = () => {
    setOpen(false);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to generate the PDF report.");
      return;
    }

    const getItemDecision = (item: any) => {
      const d = item.reviewerDecision || item.decision?.outcome || item.decision;
      if (d === "ADVANCE" || d === "PASS" || d === "Approved" || d === "APPROVED") return "PASS";
      if (d === "REJECT" || d === "FAIL" || d === "Rejected" || d === "REJECTED") return "FAIL";
      return null;
    };

    const total = data.length;
    const pending = data.filter((r) => !getItemDecision(r)).length;
    const approved = data.filter((r) => getItemDecision(r) === "PASS").length;
    const rejected = data.filter((r) => getItemDecision(r) === "FAIL").length;
    const validScores = data
      .map((r) => (typeof r.compositeScore === "number" ? r.compositeScore : null))
      .filter((s): s is number => s !== null);
    const avgScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;

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
    const shieldAlertSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    const checkSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-icon"><polyline points="20 6 9 17 4 12"/></svg>`;
    const clockSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-icon"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const xSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-icon"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

    const rowsHtml = data.map((item, index) => {
      const name = item.candidate?.name || item.candidateName || "Candidate";
      const email = item.candidate?.email || item.candidateEmail || "";
      const initialLetter = (name || "C").charAt(0).toUpperCase();

      const rawId = item.candidateId || item.id || item.sessionId || `00${index + 1}`;
      const cleanId = String(rawId).replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase();
      const refId = item.refId || `CND-${cleanId.padStart(5, "0")}`;

      const driveName = item.driveName || "General Drive";
      const roleTrack = item.roleTemplate?.roleName || item.roleTemplateName || item.experienceTier || "Fresher (0-1 yrs)";

      // Status pill
      const statusRaw = String(item.status || "SUBMITTED").toUpperCase().replace(/_/g, " ");
      let statusPill = "";
      if (statusRaw.includes("SUBMIT")) {
        statusPill = `<span class="pill pill-blue">Submitted</span>`;
      } else if (statusRaw.includes("PROGRESS")) {
        statusPill = `<span class="pill pill-amber">In Progress</span>`;
      } else if (statusRaw.includes("COMPLETE")) {
        statusPill = `<span class="pill pill-green">Completed</span>`;
      } else if (statusRaw.includes("NOT STARTED")) {
        statusPill = `<span class="pill pill-slate">Not Started</span>`;
      } else {
        statusPill = `<span class="pill pill-blue">${statusRaw}</span>`;
      }

      // Score pill (color-scaled: green >= 70%, yellow 40-69%, red < 40%) - JetBrains Mono
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

      // Decision pill (Approved = green, Rejected = red, Pending Review = yellow)
      const dec = getItemDecision(item);
      let decisionPill = "";
      if (dec === "PASS") {
        decisionPill = `<span class="pill pill-green">Approved</span>`;
      } else if (dec === "FAIL") {
        decisionPill = `<span class="pill pill-red">Rejected</span>`;
      } else {
        decisionPill = `<span class="pill pill-amber">Pending Review</span>`;
      }

      // Integrity pill (Low = green shield, Medium = yellow, High = red with flag count)
      const flagsCount = item.integrityFlagsCount || item.flagsCount || 0;
      let integrityPill = "";
      if (flagsCount === 0) {
        integrityPill = `<span class="pill pill-green">${shieldCheckSvg} Low</span>`;
      } else if (flagsCount <= 2) {
        integrityPill = `<span class="pill pill-amber">${shieldAlertSvg} Medium</span>`;
      } else {
        integrityPill = `<span class="pill pill-red">${shieldAlertSvg} ${flagsCount} Flags</span>`;
      }

      // Identity Verification pill (Verified = green check, Pending = yellow clock, Failed = red X)
      const idVerify = item.identityVerificationResult;
      const isMatch = idVerify?.matched === true || idVerify?.status === "VERIFIED" || idVerify?.status === "MATCH";
      const isMismatch = idVerify?.matched === false || idVerify?.status === "FAILED" || (idVerify?.inTestCaptures && idVerify.inTestCaptures.mismatched > 0);

      let verifyPill = "";
      if (isMatch) {
        verifyPill = `<span class="pill pill-green">${checkSvg} Verified</span>`;
      } else if (isMismatch) {
        verifyPill = `<span class="pill pill-red">${xSvg} Failed</span>`;
      } else {
        verifyPill = `<span class="pill pill-amber">${clockSvg} Pending</span>`;
      }

      const rowBg = index % 2 === 1 ? "background-color: #F9FAFB;" : "background-color: #FFFFFF;";

      return `
        <tr style="${rowBg} border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 11px 14px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="avatar">${initialLetter}</div>
              <div>
                <div style="font-weight: 600; color: #111827; font-size: 13px; line-height: 1.35;">${name}</div>
                ${email ? `<div style="font-size: 11px; font-weight: 400; color: #6B7280; font-family: 'JetBrains Mono', 'Roboto Mono', monospace; margin-top: 2px; line-height: 1.3;">${email}</div>` : ""}
              </div>
            </div>
          </td>
          <td style="padding: 11px 14px;">
            <span class="font-mono" style="font-size: 11.5px; color: #6B7280; font-weight: 600; letter-spacing: 0.02em;">${refId}</span>
          </td>
          <td style="padding: 11px 14px;">
            <div style="font-weight: 600; color: #111827; font-size: 12.5px; line-height: 1.35;">${driveName}</div>
            <div style="font-size: 11px; font-weight: 400; color: #6B7280; margin-top: 2px; line-height: 1.3;">${roleTrack}</div>
          </td>
          <td style="padding: 11px 14px; text-align: center;">${statusPill}</td>
          <td style="padding: 11px 14px; text-align: center;">${scorePill}</td>
          <td style="padding: 11px 14px; text-align: center;">${decisionPill}</td>
          <td style="padding: 11px 14px; text-align: center;">${integrityPill}</td>
          <td style="padding: 11px 14px; text-align: center;">${verifyPill}</td>
        </tr>
      `;
    }).join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Candidate Assessment Report — Proctora</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: 'Inter', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #111827;
              background: #FFFFFF;
              margin: 0;
              padding: 28px 32px;
              line-height: 1.45;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .brand-bar {
              height: 4px;
              background: linear-gradient(90deg, #2563EB 0%, #3B82F6 60%, #60A5FA 100%);
              border-radius: 2px;
              margin-bottom: 20px;
            }
            .header-container {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 22px;
              padding-bottom: 18px;
              border-bottom: 1px solid #E5E7EB;
            }
            .logo-wrap {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .logo-icon {
              width: 36px;
              height: 36px;
              border-radius: 10px;
              background: #EFF6FF;
              border: 1px solid #DBEAFE;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(5, 1fr);
              gap: 12px;
              margin-bottom: 22px;
            }
            .stat-card {
              border-radius: 10px;
              padding: 11px 14px;
            }
            .stat-label {
              font-family: 'Inter', sans-serif;
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              line-height: 1.3;
            }
            .stat-value {
              font-family: 'Inter', sans-serif;
              font-size: 21px;
              font-weight: 700;
              margin-top: 3px;
              line-height: 1.2;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              text-align: left;
              font-size: 12.5px;
              font-weight: 400;
              border-radius: 8px;
              overflow: hidden;
              border: 1px solid #E5E7EB;
            }
            thead th {
              font-family: 'Inter', sans-serif;
              background-color: #F9FAFB;
              color: #6B7280;
              font-size: 10.5px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              padding: 10px 14px;
              border-bottom: 2px solid #E5E7EB;
              line-height: 1.4;
            }
            .avatar {
              width: 26px;
              height: 26px;
              border-radius: 50%;
              background-color: #EFF6FF;
              color: #2563EB;
              border: 1px solid #DBEAFE;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-family: 'Inter', sans-serif;
              font-weight: 700;
              font-size: 11.5px;
              flex-shrink: 0;
            }
            .pill {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 4px;
              padding: 3.5px 10px;
              border-radius: 9999px;
              font-family: 'Inter', sans-serif;
              font-size: 11px;
              font-weight: 500;
              line-height: 1.3;
              white-space: nowrap;
            }
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
            .pill-slate {
              background-color: #F1F5F9;
              color: #64748B;
              border: 1px solid #E2E8F0;
            }
            .pill-neutral {
              background-color: #F1F5F9;
              color: #94A3B8;
              border: 1px solid #E2E8F0;
            }
            .font-mono {
              font-family: 'JetBrains Mono', 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
            }
            .inline-icon {
              display: inline-block;
              vertical-align: middle;
              margin-right: 3px;
              flex-shrink: 0;
            }
            .footer {
              margin-top: 28px;
              padding-top: 14px;
              border-top: 1px solid #E5E7EB;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 11px;
              font-weight: 400;
              color: #9CA3AF;
              line-height: 1.4;
            }
            @media print {
              body { padding: 8mm; }
              @page {
                size: landscape;
                margin: 8mm;
              }
              tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="brand-bar"></div>

          <!-- Header / Masthead -->
          <div class="header-container">
            <div class="logo-wrap">
              <div class="logo-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="5.5" />
                  <circle cx="12" cy="12" r="2" fill="#2563EB" />
                </svg>
              </div>
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 17px; font-weight: 700; color: #111827; letter-spacing: -0.02em;">Proctora</span>
                  <span style="font-size: 10px; font-weight: 600; background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em;">Assessment Report</span>
                </div>
                <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 3px 0 0 0; letter-spacing: -0.02em; line-height: 1.3;">Candidate Assessment Report</h1>
              </div>
            </div>

            <div style="text-align: right;">
              <div style="display: inline-block; padding: 2.5px 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; border-radius: 4px; margin-bottom: 4px; letter-spacing: 0.05em;">
                CONFIDENTIAL
              </div>
              <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #6B7280; font-weight: 600;">
                Report ID: ${reportId}
              </div>
              <div style="font-size: 11px; font-weight: 400; color: #9CA3AF; margin-top: 2px;">
                Generated on ${dateFormatted}, ${timeFormatted}
              </div>
            </div>
          </div>

          <!-- Summary Stats Strip -->
          <div class="stats-grid">
            <div class="stat-card" style="background: #FFFFFF; border: 1px solid #E5E7EB;">
              <div class="stat-label" style="color: #6B7280;">Total Candidates</div>
              <div class="stat-value" style="color: #111827;">${total}</div>
            </div>
            <div class="stat-card" style="background: #FFFDF5; border: 1px solid #FEF3C7;">
              <div class="stat-label" style="color: #D97706;">Pending Review</div>
              <div class="stat-value" style="color: #D97706;">${pending}</div>
            </div>
            <div class="stat-card" style="background: #F6FEF9; border: 1px solid #D1FAE5;">
              <div class="stat-label" style="color: #059669;">Approved (Pass)</div>
              <div class="stat-value" style="color: #059669;">${approved}</div>
            </div>
            <div class="stat-card" style="background: #FEF6F6; border: 1px solid #FEE2E2;">
              <div class="stat-label" style="color: #DC2626;">Rejected (Fail)</div>
              <div class="stat-value" style="color: #DC2626;">${rejected}</div>
            </div>
            <div class="stat-card" style="background: #F8FAFF; border: 1px solid #DBEAFE;">
              <div class="stat-label" style="color: #2563EB;">Avg Composite Score</div>
              <div class="stat-value" style="color: #2563EB;">${avgScore}%</div>
            </div>
          </div>

          <!-- Candidates Table -->
          <table>
            <thead>
              <tr>
                <th style="width: 22%;">Name</th>
                <th style="width: 10%;">Ref ID</th>
                <th style="width: 20%;">Drive</th>
                <th style="width: 11%; text-align: center;">Status</th>
                <th style="width: 9%; text-align: center;">Score</th>
                <th style="width: 12%; text-align: center;">Decision</th>
                <th style="width: 11%; text-align: center;">Integrity</th>
                <th style="width: 11%; text-align: center;">Verification</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <!-- Footer -->
          <div class="footer">
            <span>Proctora Technical Hiring Assessment Platform</span>
            <span>Confidential Report · Page 1 of 1</span>
          </div>

          <script>
            if ('fonts' in document) {
              Promise.all([
                document.fonts.load('400 1em Inter'),
                document.fonts.load('600 1em Inter'),
                document.fonts.load('700 1em Inter'),
                document.fonts.load('600 1em "JetBrains Mono"')
              ]).then(function() {
                document.fonts.ready.then(function() {
                  setTimeout(function() { window.print(); }, 200);
                });
              }).catch(function() {
                setTimeout(function() { window.print(); }, 400);
              });
            } else {
              window.onload = function() { setTimeout(function() { window.print(); }, 500); };
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
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
