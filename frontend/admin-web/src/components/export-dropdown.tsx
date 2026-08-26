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

    const rowsHtml = data.map((s) => `
      <tr style="border-bottom: 1px solid #E6E6EA;">
        <td style="padding: 10px; font-weight: 600;">${s.candidate?.name || s.candidateName || "Candidate"}</td>
        <td style="padding: 10px;">${s.roleTemplate?.roleName || s.roleTemplateName || "Software Engineer"}</td>
        <td style="padding: 10px;">${s.status || "Completed"}</td>
        <td style="padding: 10px; font-family: monospace; font-weight: bold;">${s.compositeScore !== null && s.compositeScore !== undefined ? `${s.compositeScore}%` : "—"}</td>
        <td style="padding: 10px; font-family: monospace;">${s.sayDoScore !== null && s.sayDoScore !== undefined ? `${s.sayDoScore}%` : "—"}</td>
      </tr>
    `).join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #0B0B0D; margin: 40px; }
            h1 { font-size: 24px; font-weight: 800; margin-bottom: 4px; }
            p { color: #5B5B64; font-size: 13px; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
            th { background: #F7F7F9; color: #5B5B64; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 10px; border-bottom: 2px solid #E6E6EA; }
            .footer { margin-top: 40px; font-size: 11px; color: #8B8B93; border-top: 1px solid #E6E6EA; padding-top: 16px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p>Generated on ${new Date().toLocaleString()} · ${data.length} total candidates</p>
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Role</th>
                <th>Status</th>
                <th>Composite Score</th>
                <th>Say-Do Sync</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="footer">
            <span>Proctora Technical Hiring Assessment Platform</span>
            <span>Confidential Report</span>
          </div>
          <script>
            window.onload = function() { window.print(); }
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
        className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold bg-[#2F5CFF] hover:bg-[#0037FF] text-white rounded-lg shadow-sm transition-colors cursor-pointer"
      >
        <Download size={14} />
        <span>Export</span>
        <ChevronDown size={14} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white border border-[#E6E6EA] shadow-xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-150">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-[12px] font-medium text-[#0B0B0D] hover:bg-[#F7F7F9] rounded-lg transition-colors cursor-pointer text-left"
          >
            <FileText size={14} className="text-[#2F5CFF]" />
            <span>Export PDF Report</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-[12px] font-medium text-[#0B0B0D] hover:bg-[#F7F7F9] rounded-lg transition-colors cursor-pointer text-left"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span>Export Excel / CSV</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-[12px] font-medium text-[#0B0B0D] hover:bg-[#F7F7F9] rounded-lg transition-colors cursor-pointer text-left"
          >
            <FileCode size={14} className="text-amber-600" />
            <span>Export JSON Data</span>
          </button>
        </div>
      )}
    </div>
  );
}
