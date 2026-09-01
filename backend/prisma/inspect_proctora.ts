import * as fs from "fs";
import * as path from "path";

const p = path.join(__dirname, "data/proctora_question_bank.json");
const data = JSON.parse(fs.readFileSync(p, "utf8"));

const codingSample = data.questions.find((q: any) => q.module === "CODING");
console.log("=== Coding Sample ===");
console.log(JSON.stringify(codingSample, null, 2));

const debugSample = data.questions.find((q: any) => q.module === "DEBUGGING");
console.log("=== Debugging Sample ===");
console.log(JSON.stringify(debugSample, null, 2));
