const fs = require("fs");
const path = require("path");

const files = [
  path.join(__dirname, "..", "frontend", "admin-web", "src", "routes", "templates.tsx"),
  path.join(__dirname, "..", "frontend", "admin-web", "src", "routes", "drives.$id.tsx"),
  path.join(__dirname, "..", "frontend", "admin-web", "src", "routes", "drives.tsx"),
];

files.forEach(file => {
  const rel = path.basename(file);
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");
  lines.forEach((l, i) => {
    if (l.includes(".version") || l.includes("version") || l.includes("(v") || l.includes("v1")) {
      console.log(`${rel}:${i+1}: ${l.trim()}`);
    }
  });
});
