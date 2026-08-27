const fs = require('fs');
const path = require('path');

const targetFiles = [
  'frontend/admin-web/src/routes/questions.tsx',
  'frontend/admin-web/src/routes/drives.$id.tsx',
  'frontend/admin-web/src/routes/results.$id.tsx',
  'frontend/admin-web/src/routes/templates.tsx',
  'frontend/admin-web/src/routes/dashboard.tsx',
  'frontend/admin-web/src/routes/results.tsx',
  'frontend/admin-web/src/routes/drives.tsx',
  'frontend/admin-web/src/routes/settings.tsx',
  'frontend/admin-web/src/routes/reports.tsx',
  'frontend/admin-web/src/routes/invites.tsx',
  'frontend/admin-web/src/components/app-shell.tsx',
  'frontend/admin-web/src/components/scope-panel.tsx',
  'frontend/admin-web/src/components/export-dropdown.tsx',
  'frontend/admin-web/src/components/single-date-time-picker.tsx',
  'frontend/candidate-web/src/routes/LandingPage.tsx',
  'frontend/candidate-web/src/components/FullScreenShield.tsx',
  'frontend/candidate-web/src/components/QuestionPalette.tsx',
];

const replacementRules = [
  // Exact Colors
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

  { from: /bg-\[#2F5CFF\]/gi, to: 'bg-brand' },
  { from: /text-\[#2F5CFF\]/gi, to: 'text-brand' },
  { from: /border-\[#2F5CFF\]/gi, to: 'border-brand' },
  { from: /hover:bg-\[#0037FF\]/gi, to: 'hover:bg-brand-hover' },
  { from: /bg-\[#0037FF\]/gi, to: 'bg-brand-hover' },

  { from: /bg-\[#EAF0FF\]/gi, to: 'bg-brand-subtle' },
  { from: /text-\[#15308F\]/gi, to: 'text-brand-ink' },
  { from: /border-\[#B3C5FF\]/gi, to: 'border-brand-border' },

  // Typography scale preserving exact pixel scale
  { from: /text-\[10px\]/g, to: 'text-2xs' },
  { from: /text-\[11px\]/g, to: 'text-xs-plus' },
  { from: /text-\[12px\]/g, to: 'text-xs' },
  { from: /text-\[13px\]/g, to: 'text-sm-minus' },
  { from: /text-\[14px\]/g, to: 'text-sm' },
  { from: /text-\[15px\]/g, to: 'text-md' },
  { from: /text-\[16px\]/g, to: 'text-base' },
  { from: /text-\[28px\]/g, to: 'text-3xl-plus' },

  // Radius scale
  { from: /rounded-\[10px\]/g, to: 'rounded-lg' },
  { from: /rounded-\[12px\]/g, to: 'rounded-xl' },
  { from: /rounded-\[16px\]/g, to: 'rounded-2xl' },
  { from: /rounded-\[9999px\]/g, to: 'rounded-full' },
];

let totalReplacements = 0;
const results = {};

for (const relFile of targetFiles) {
  const fullPath = path.resolve('d:/Projects/cd-recruit/codebase', relFile);
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping missing file: ${relFile}`);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  let fileReplacements = 0;

  for (const rule of replacementRules) {
    const matches = content.match(rule.from);
    if (matches) {
      fileReplacements += matches.length;
      content = content.replace(rule.from, rule.to);
    }
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  results[relFile] = fileReplacements;
  totalReplacements += fileReplacements;
}

console.log('Sweep completed:');
console.log(JSON.stringify(results, null, 2));
console.log(`Total replacements: ${totalReplacements}`);
