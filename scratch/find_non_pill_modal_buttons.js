const fs = require("fs");
const path = require("path");
const srcDir = path.join(__dirname, "..", "frontend", "admin-web", "src");

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

files.forEach(file => {
  const content = fs.readFileSync(file, "utf8");
  const relPath = path.relative(srcDir, file);

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      line.includes("fixed inset-0") ||
      line.includes("modal-overlay-backdrop") ||
      (line.includes("fixed ") && line.includes("z-50"))
    ) {
      const modalBlock = lines.slice(i, Math.min(i + 150, lines.length)).join("\n");
      const buttonMatches = [...modalBlock.matchAll(/<button([\s\S]*?)>([\s\S]*?)<\/button>/g)];
      
      const nonPillButtons = [];
      buttonMatches.forEach(bm => {
        const attrs = bm[1];
        const text = bm[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        const classMatch = attrs.match(/className=(?:\{`([\s\S]*?)`\}|"([^"]*)"|'([^']*)')/);
        const cls = classMatch ? (classMatch[1] || classMatch[2] || classMatch[3] || "").replace(/\s+/g, " ").trim() : "(no className)";
        
        // Exclude modal close X icon buttons (e.g. p-1 rounded-lg hover:bg-...)
        const isCloseX = text === "" || text === "Icon" || attrs.includes("<X ") || attrs.includes("size={16}") || attrs.includes("size={18}") || attrs.includes("size={20}");
        if (isCloseX && (cls.includes("p-1") || cls.includes("p-1.5") || cls.includes("p-2"))) {
          return;
        }

        if (!cls.includes("rounded-full")) {
          nonPillButtons.push({ text: text.slice(0, 50), cls });
        }
      });

      if (nonPillButtons.length > 0) {
        console.log(`\n------------------------------------------------------`);
        console.log(`MODAL in ${relPath} around line ${i + 1}:`);
        nonPillButtons.forEach(b => {
          console.log(`  - Text: "${b.text}"`);
          console.log(`    Class: ${b.cls}`);
        });
      }
    }
  }
});
