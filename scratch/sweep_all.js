const fs = require('fs');
const path = require('path');

const replacementRules = [
  // Primary Palettes
  { from: /bg-\[#0B0B0D\]/gi, to: 'bg-ink' },
  { from: /text-\[#0B0B0D\]/gi, to: 'text-ink' },
  { from: /border-\[#0B0B0D\]/gi, to: 'border-ink' },

  { from: /bg-\[#5B5B64\]/gi, to: 'bg-ink-secondary' },
  { from: /text-\[#5B5B64\]/gi, to: 'text-ink-secondary' },
  { from: /border-\[#5B5B64\]/gi, to: 'border-ink-secondary' },

  { from: /bg-\[#8B8B93\]/gi, to: 'bg-ink-tertiary' },
  { from: /text-\[#8B8B93\]/gi, to: 'text-ink-tertiary' },
  { from: /border-\[#8B8B93\]/gi, to: 'border-ink-tertiary' },

  { from: /bg-\[#9C9CA5\]/gi, to: 'bg-ink-muted' },
  { from: /text-\[#9C9CA5\]/gi, to: 'text-ink-muted' },
  { from: /border-\[#9C9CA5\]/gi, to: 'border-ink-muted' },

  { from: /bg-\[#E6E6EA\]/gi, to: 'bg-line' },
  { from: /border-\[#E6E6EA\]/gi, to: 'border-line' },
  { from: /divide-\[#E6E6EA\]/gi, to: 'divide-line' },

  { from: /bg-\[#D6D7DC\]/gi, to: 'bg-line-strong' },
  { from: /border-\[#D6D7DC\]/gi, to: 'border-line-strong' },

  { from: /bg-\[#F7F7F9\]/gi, to: 'bg-canvas' },
  { from: /bg-\[#EFF0F3\]/gi, to: 'bg-surface-inset' },
  { from: /border-\[#EFF0F3\]/gi, to: 'border-surface-inset' },
  { from: /divide-\[#EFF0F3\]/gi, to: 'divide-surface-inset' },

  { from: /bg-\[#2F5CFF\]/gi, to: 'bg-brand' },
  { from: /text-\[#2F5CFF\]/gi, to: 'text-brand' },
  { from: /border-\[#2F5CFF\]/gi, to: 'border-brand' },
  { from: /ring-\[#2F5CFF\]/gi, to: 'ring-brand' },
  { from: /from-\[#2F5CFF\]/gi, to: 'from-brand' },
  { from: /to-\[#1A44D6\]/gi, to: 'to-brand-hover' },
  { from: /from-\[#1A44D6\]/gi, to: 'from-brand-hover' },
  { from: /to-\[#1233A8\]/gi, to: 'to-brand-ink' },
  { from: /hover:bg-\[#0037FF\]/gi, to: 'hover:bg-brand-hover' },
  { from: /bg-\[#0037FF\]/gi, to: 'bg-brand-hover' },
  { from: /bg-\[#1A44D6\]/gi, to: 'bg-brand-hover' },
  { from: /bg-\[#254EDB\]/gi, to: 'bg-brand-hover' },

  { from: /bg-\[#EAF0FF\]/gi, to: 'bg-brand-subtle' },
  { from: /bg-\[#F0F4FF\]/gi, to: 'bg-brand-subtle' },
  { from: /bg-\[#DCE6FF\]/gi, to: 'bg-brand-subtle' },
  { from: /bg-\[#D6E4FF\]/gi, to: 'bg-brand-subtle' },
  { from: /bg-\[#D9E4FF\]/gi, to: 'bg-brand-subtle' },
  { from: /bg-\[#D9E5FF\]/gi, to: 'bg-brand-subtle' },
  { from: /bg-\[#EFF4FF\]/gi, to: 'bg-brand-subtle' },
  { from: /bg-\[#EFF6FF\]/gi, to: 'bg-brand-subtle' },
  { from: /bg-\[#F4F7FF\]/gi, to: 'bg-brand-subtle' },
  { from: /text-\[#15308F\]/gi, to: 'text-brand-ink' },
  { from: /text-\[#1E40AF\]/gi, to: 'text-brand-ink' },
  { from: /bg-\[#15308F\]/gi, to: 'bg-brand-ink' },
  { from: /border-\[#B3C5FF\]/gi, to: 'border-brand-border' },
  { from: /border-\[#C5D7FF\]/gi, to: 'border-brand-border' },
  { from: /border-\[#C5D7FE\]/gi, to: 'border-brand-border' },
  { from: /border-\[#D0E0FF\]/gi, to: 'border-brand-border' },
  { from: /bg-\[#B3C5FF\]/gi, to: 'bg-brand-border' },

  // Danger / Critical
  { from: /bg-\[#E5484D\]/gi, to: 'bg-danger' },
  { from: /text-\[#E5484D\]/gi, to: 'text-danger' },
  { from: /border-\[#E5484D\]/gi, to: 'border-danger' },
  { from: /bg-\[#c33e42\]/gi, to: 'bg-danger-hover' },
  { from: /text-\[#EF4444\]/gi, to: 'text-danger' },
  { from: /text-\[#DC2626\]/gi, to: 'text-danger-hover' },
  { from: /bg-\[#DC2626\]/gi, to: 'bg-danger-hover' },
  { from: /bg-\[#B91C1C\]/gi, to: 'bg-danger-hover' },
  { from: /bg-\[#FEF2F2\]/gi, to: 'bg-danger-subtle' },
  { from: /bg-\[#FEE2E2\]/gi, to: 'bg-danger-subtle' },
  { from: /border-\[#FECACA\]/gi, to: 'border-danger-border' },
  { from: /border-\[#FEE2E2\]/gi, to: 'border-danger-border' },

  // Success / Emerald
  { from: /bg-\[#10B981\]/gi, to: 'bg-success' },
  { from: /text-\[#10B981\]/gi, to: 'text-success' },
  { from: /bg-\[#ECFDF5\]/gi, to: 'bg-success-subtle' },
  { from: /border-\[#A7F3D0\]/gi, to: 'border-success-border' },
  { from: /bg-\[#E3F9F2\]/gi, to: 'bg-emerald-50' },
  { from: /bg-\[#D1F4E9\]/gi, to: 'bg-emerald-50' },
  { from: /bg-\[#E6F7F4\]/gi, to: 'bg-emerald-50' },
  { from: /bg-\[#C7F5E8\]/gi, to: 'bg-emerald-50' },
  { from: /bg-\[#F0FDF4\]/gi, to: 'bg-emerald-50' },
  { from: /text-\[#0C6B58\]/gi, to: 'text-emerald-700' },
  { from: /text-\[#0B6B58\]/gi, to: 'text-emerald-700' },
  { from: /text-\[#027A48\]/gi, to: 'text-emerald-700' },
  { from: /text-\[#17C964\]/gi, to: 'text-emerald-600' },
  { from: /bg-\[#0C6B58\]/gi, to: 'bg-emerald-700' },
  { from: /bg-\[#095445\]/gi, to: 'bg-emerald-800' },
  { from: /border-\[#A3E6D5\]/gi, to: 'border-emerald-300' },
  { from: /border-\[#A3E4D7\]/gi, to: 'border-emerald-300' },
  { from: /border-\[#12B76A\]/gi, to: 'border-emerald-500' },

  // Warning / Amber
  { from: /bg-\[#FFFBEB\]/gi, to: 'bg-warning-subtle' },
  { from: /border-\[#FDE68A\]/gi, to: 'border-warning-border' },
  { from: /text-\[#F5A623\]/gi, to: 'text-amber-700' },
  { from: /text-\[#B7791F\]/gi, to: 'text-amber-700' },
  { from: /text-\[#AD5B0B\]/gi, to: 'text-amber-700' },
  { from: /text-\[#B45309\]/gi, to: 'text-amber-700' },
  { from: /bg-\[#FFF9F0\]/gi, to: 'bg-amber-50' },
  { from: /bg-\[#FFF8E6\]/gi, to: 'bg-amber-50' },
  { from: /bg-\[#FEF0CD\]/gi, to: 'bg-amber-50' },
  { from: /bg-\[#FDF2E9\]/gi, to: 'bg-amber-50' },
  { from: /border-\[#FEEBC8\]/gi, to: 'border-amber-200' },
  { from: /border-\[#F59E0B\]/gi, to: 'border-amber-500' },

  // Rose / Error feedback
  { from: /text-\[#C0392B\]/gi, to: 'text-rose-700' },
  { from: /text-\[#B42318\]/gi, to: 'text-rose-700' },
  { from: /bg-\[#FFF5F5\]/gi, to: 'bg-rose-50' },
  { from: /bg-\[#FFF0F0\]/gi, to: 'bg-rose-50' },
  { from: /bg-\[#FFE8E6\]/gi, to: 'bg-rose-50' },
  { from: /bg-\[#C0392B\]/gi, to: 'bg-rose-700' },
  { from: /bg-\[#A93226\]/gi, to: 'bg-rose-800' },
  { from: /border-\[#FEB2B2\]/gi, to: 'border-rose-200' },
  { from: /border-\[#FADBD8\]/gi, to: 'border-rose-200' },
  { from: /border-\[#FFE3E3\]/gi, to: 'border-rose-200' },

  // Purple / Neutral Accent
  { from: /text-\[#7C3AED\]/gi, to: 'text-purple' },
  { from: /text-\[#8B5CF6\]/gi, to: 'text-purple' },
  { from: /text-\[#5B21B6\]/gi, to: 'text-purple' },
  { from: /bg-\[#F3F0FF\]/gi, to: 'bg-purple-subtle' },
  { from: /border-\[#DDD6FE\]/gi, to: 'border-purple-border' },

  // Canvas / Surface Greys
  { from: /bg-\[#F8F9FB\]/gi, to: 'bg-canvas' },
  { from: /bg-\[#FAFBFD\]/gi, to: 'bg-canvas' },
  { from: /bg-\[#F4F4F6\]/gi, to: 'bg-canvas' },
  { from: /bg-\[#F4F5F8\]/gi, to: 'bg-canvas' },
  { from: /bg-\[#F9FAFB\]/gi, to: 'bg-canvas' },
  { from: /bg-\[#F2F2F7\]/gi, to: 'bg-surface-inset' },
  { from: /bg-\[#F9FBFD\]/gi, to: 'bg-canvas' },
  { from: /border-\[#F0F0F4\]/gi, to: 'border-line' },
  { from: /border-\[#F0F0F3\]/gi, to: 'border-line' },
  { from: /border-\[#D1D1D6\]/gi, to: 'border-line' },
  { from: /border-\[#D1D1D8\]/gi, to: 'border-line' },
  { from: /border-\[#232327\]/gi, to: 'border-ink' },
  { from: /text-\[#D6D7DC\]/gi, to: 'text-ink-tertiary' },
  { from: /text-\[#D1D1D6\]/gi, to: 'text-ink-tertiary' },
  { from: /text-\[#B8B8C2\]/gi, to: 'text-ink-tertiary' },
  { from: /text-\[#C5C5CE\]/gi, to: 'text-ink-tertiary' },
  { from: /text-\[#1C1C1E\]/gi, to: 'text-ink' },
  { from: /text-\[#EDEDEF\]/gi, to: 'text-ink' },

  // Typography scale preserving exact pixel scale
  { from: /text-\[9px\]/g, to: 'text-2xs' },
  { from: /text-\[10px\]/g, to: 'text-2xs' },
  { from: /text-\[11px\]/g, to: 'text-xs-plus' },
  { from: /text-\[12px\]/g, to: 'text-xs' },
  { from: /text-\[13px\]/g, to: 'text-sm-minus' },
  { from: /text-\[14px\]/g, to: 'text-sm' },
  { from: /text-\[15px\]/g, to: 'text-md' },
  { from: /text-\[16px\]/g, to: 'text-base' },
  { from: /text-\[17px\]/g, to: 'text-lg' },
  { from: /text-\[18px\]/g, to: 'text-lg' },
  { from: /text-\[19px\]/g, to: 'text-xl' },
  { from: /text-\[20px\]/g, to: 'text-xl' },
  { from: /text-\[22px\]/g, to: 'text-2xl' },
  { from: /text-\[24px\]/g, to: 'text-2xl' },
  { from: /text-\[28px\]/g, to: 'text-3xl-plus' },
  { from: /text-\[32px\]/g, to: 'text-4xl' },
  { from: /text-\[36px\]/g, to: 'text-4xl' },

  // Radius scale
  { from: /rounded-\[2px\]/g, to: 'rounded-xs' },
  { from: /rounded-\[6px\]/g, to: 'rounded-sm' },
  { from: /rounded-\[8px\]/g, to: 'rounded-md' },
  { from: /rounded-\[10px\]/g, to: 'rounded-lg' },
  { from: /rounded-\[12px\]/g, to: 'rounded-xl' },
  { from: /rounded-\[16px\]/g, to: 'rounded-2xl' },
  { from: /rounded-\[20px\]/g, to: 'rounded-3xl' },
  { from: /rounded-\[999px\]/g, to: 'rounded-full' },
  { from: /rounded-\[9999px\]/g, to: 'rounded-full' },
];

function getAllFiles(dir, exts = ['.ts', '.tsx']) {
  let files = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      files = files.concat(getAllFiles(full, exts));
    } else if (exts.some(ext => item.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

const adminFiles = getAllFiles('d:/Projects/cd-recruit/codebase/frontend/admin-web/src');
const candidateFiles = getAllFiles('d:/Projects/cd-recruit/codebase/frontend/candidate-web/src');
const allFiles = [...adminFiles, ...candidateFiles];

let totalReplacements = 0;

for (const filePath of allFiles) {
  if (filePath.endsWith('styles.css') || filePath.endsWith('index.css') || filePath.includes('monacoTheme.ts')) {
    continue;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let fileReplacements = 0;

  for (const rule of replacementRules) {
    const matches = content.match(rule.from);
    if (matches) {
      fileReplacements += matches.length;
      content = content.replace(rule.from, rule.to);
    }
  }

  if (fileReplacements > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalReplacements += fileReplacements;
  }
}

console.log(`Deep sweep completed! Total replacements: ${totalReplacements}`);
