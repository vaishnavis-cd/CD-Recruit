const fs = require('fs');
['drives.tsx', 'drives.$id.tsx', 'templates.tsx', 'invites.tsx', 'results.$id.tsx', 'questions.tsx'].forEach(f => {
  const p = 'frontend/admin-web/src/routes/' + f;
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, idx) => {
    // Check if within 5 lines around a button
    const window = lines.slice(Math.max(0, idx - 4), Math.min(lines.length, idx + 5)).join(' ');
    if (window.includes('<button') && (l.includes('rounded') || l.includes('btn-')) && !l.includes('rounded-full')) {
      // Check if it's not a close icon (e.g. p-1 rounded-lg)
      if (!l.includes('p-1') && !l.includes('p-1.5') && !l.includes('rounded-full')) {
        console.log(`${f}:${idx + 1}: ${l.trim()}`);
      }
    }
  });
});
