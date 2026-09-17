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

  // Look for modal triggers or container divs
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      line.includes("fixed inset-0") ||
      line.includes("modal-overlay-backdrop") ||
      (line.includes("fixed ") && line.includes("z-50"))
    ) {
      // Find where this modal ends (roughly look forward up to 100 lines for buttons)
      const modalBlock = lines.slice(i, Math.min(i + 130, lines.length)).join("\n");
      const buttonMatches = [...modalBlock.matchAll(/<button([\s\S]*?)>([\s\S]*?)<\/button>/g)];
      
      if (buttonMatches.length > 0) {
        console.log(`\n======================================================`);
        console.log(`MODAL in ${relPath} around line ${i + 1}`);
        // try to find modal title
        const titleMatch = modalBlock.match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/);
        if (titleMatch) {
          console.log(`Title: ${titleMatch[1].replace(/<[^>]*>/g, "").trim()}`);
        }
        console.log(`======================================================`);

        buttonMatches.forEach(bm => {
          const attrs = bm[1];
          const text = bm[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
          const classMatch = attrs.match(/className=(?:\{`([\s\S]*?)`\}|"([^"]*)"|'([^']*)')/);
          const cls = classMatch ? (classMatch[1] || classMatch[2] || classMatch[3] || "").replace(/\s+/g, " ").trim() : "(no className)";
          
          let shape = "inherited/unspecified";
          if (cls.includes("rounded-full")) shape = "pill (rounded-full)";
          else if (cls.includes("rounded-xl")) shape = "rounded-xl (12px)";
          else if (cls.includes("rounded-lg")) shape = "rounded-lg (10px)";
          else if (cls.includes("rounded-md")) shape = "rounded-md (8px)";
          else if (cls.includes("rounded-[8px]")) shape = "rounded-[8px]";
          else if (cls.includes("rounded-[6px]")) shape = "rounded-[6px]";
          else if (cls.includes("rounded")) shape = "rounded (4px)";
          else if (cls.includes("btn-gradient-primary") || cls.includes("btn-secondary-outline")) shape = "btn-gradient/outline (12px via CSS)";

          console.log(`  * [${shape}] "${text || 'Icon'}":\n      class: ${cls}`);
        });
      }
    }
  }
});
