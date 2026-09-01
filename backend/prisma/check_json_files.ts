import * as fs from "fs";
import * as path from "path";

const dataDir = path.join(__dirname, "data");
const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));

for (const file of files) {
  try {
    const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
    if (Array.isArray(content)) {
      const moduleTypes = new Set();
      content.forEach(item => {
        moduleTypes.add(item.moduleType || item.module || "MCQ");
      });
      console.log(`File: ${file} | Count: ${content.length} | Modules: ${Array.from(moduleTypes).join(", ")}`);
    }
  } catch (e: any) {
    console.log(`File ${file}: error reading: ${e.message}`);
  }
}
