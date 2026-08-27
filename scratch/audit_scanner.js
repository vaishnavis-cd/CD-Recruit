const fs = require('fs');
const path = require('path');

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

function auditFiles(files, label) {
  let colorBrackets = 0;
  let fontSizeBrackets = 0;
  let radiusBrackets = 0;

  for (const file of files) {
    if (file.endsWith('styles.css') || file.endsWith('index.css') || file.includes('monacoTheme.ts')) continue;
    const content = fs.readFileSync(file, 'utf8');

    // Color brackets like bg-[#...], text-[#...], border-[#...]
    const colorMatches = content.match(/(?:bg|text|border|divide|ring|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/g);
    if (colorMatches) colorBrackets += colorMatches.length;

    // Font size brackets like text-[10px], text-[11px]
    const fontMatches = content.match(/text-\[\d+px\]/g);
    if (fontMatches) fontSizeBrackets += fontMatches.length;

    // Radius brackets like rounded-[10px]
    const radiusMatches = content.match(/rounded-\[\d+px\]/g);
    if (radiusMatches) radiusBrackets += radiusMatches.length;
  }

  return { label, colorBrackets, fontSizeBrackets, radiusBrackets };
}

console.log('--- Current Audit Results ---');
console.log(auditFiles(adminFiles, 'admin-web'));
console.log(auditFiles(candidateFiles, 'candidate-web'));
