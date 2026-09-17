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

const stats = { full: 0, xl: 0, lg: 0, md: 0, rounded: 0, custom: 0, none: 0 };
const perFile = {};

walk(srcDir).forEach(f => {
  const rel = path.relative(srcDir, f);
  const content = fs.readFileSync(f, "utf8");
  const matches = content.match(/<button[\s\S]*?>/g) || [];
  perFile[rel] = { full: 0, xl: 0, lg: 0, md: 0, rounded: 0, custom: 0, none: 0 };

  matches.forEach(m => {
    const classMatch = m.match(/className=(?:\{`([\s\S]*?)`\}|"([^"]*)"|'([^']*)')/);
    const cls = classMatch ? (classMatch[1] || classMatch[2] || classMatch[3] || "") : "";
    let cat = "none";
    if (cls.includes("rounded-full")) cat = "full";
    else if (cls.includes("rounded-xl")) cat = "xl";
    else if (cls.includes("rounded-lg")) cat = "lg";
    else if (cls.includes("rounded-md")) cat = "md";
    else if (cls.includes("rounded-[") || cls.includes("rounded-2xl")) cat = "custom";
    else if (cls.includes("rounded")) cat = "rounded";
    else cat = "none";

    stats[cat]++;
    perFile[rel][cat]++;
  });
});

console.log("Overall stats:", stats);
console.log("\nPer-file breakdown:");
Object.entries(perFile).forEach(([f, s]) => {
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  if (total > 0) {
    console.log(`  ${f.padEnd(35)}: total ${total.toString().padStart(3)} | full: ${s.full}, lg: ${s.lg}, md: ${s.md}, xl: ${s.xl}, rounded: ${s.rounded}, custom: ${s.custom}, none: ${s.none}`);
  }
});
