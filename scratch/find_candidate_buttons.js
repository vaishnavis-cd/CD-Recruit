const fs = require("fs");
const path = require("path");
const srcDir = path.join(__dirname, "..", "frontend", "candidate-web", "src");

function walk(dir) {
  let results = [];
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) results.push(...walk(full));
    else if (file.endsWith(".tsx")) results.push(full);
  });
  return results;
}

const files = walk(srcDir);
console.log(`Found ${files.length} tsx files in candidate-web.`);

files.forEach(file => {
  const content = fs.readFileSync(file, "utf8");
  const relPath = path.relative(srcDir, file);

  const buttonMatches = [...content.matchAll(/<button([\s\S]*?)>([\s\S]*?)<\/button>/g)];
  if (buttonMatches.length > 0) {
    console.log(`\n======================================================`);
    console.log(`${relPath} (${buttonMatches.length} buttons)`);
    console.log(`======================================================`);
    buttonMatches.forEach(bm => {
      const attrs = bm[1];
      const text = bm[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      const classMatch = attrs.match(/className=(?:\{`([\s\S]*?)`\}|"([^"]*)"|'([^']*)')/);
      const cls = classMatch ? (classMatch[1] || classMatch[2] || classMatch[3] || "").replace(/\s+/g, " ").trim() : "(no className)";
      console.log(`  * "${text || 'Icon'}":\n      class: ${cls}`);
    });
  }
});
