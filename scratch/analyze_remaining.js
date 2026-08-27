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

const remainingColors = {};
const remainingFonts = {};
const remainingRadii = {};

for (const file of [...adminFiles, ...candidateFiles]) {
  if (file.endsWith('styles.css') || file.endsWith('index.css') || file.includes('monacoTheme.ts')) continue;
  const content = fs.readFileSync(file, 'utf8');

  const colorMatches = content.match(/(?:bg|text|border|divide|ring|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/g);
  if (colorMatches) {
    for (const m of colorMatches) {
      remainingColors[m] = (remainingColors[m] || 0) + 1;
    }
  }

  const fontMatches = content.match(/text-\[\d+px\]/g);
  if (fontMatches) {
    for (const m of fontMatches) {
      remainingFonts[m] = (remainingFonts[m] || 0) + 1;
    }
  }

  const radiusMatches = content.match(/rounded-\[\d+px\]/g);
  if (radiusMatches) {
    for (const m of radiusMatches) {
      remainingRadii[m] = (remainingRadii[m] || 0) + 1;
    }
  }
}

console.log('Remaining Colors:', remainingColors);
console.log('Remaining Fonts:', remainingFonts);
console.log('Remaining Radii:', remainingRadii);
