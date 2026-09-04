import * as fs from "fs";
import * as path from "path";

const bankPath = path.join(__dirname, "data/proctora_question_bank.json");
const batchPath = path.join(__dirname, "../../seniority_l2_l3_question_batch.json");

if (fs.existsSync(bankPath)) {
  const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
  console.log("proctora_question_bank.json keys:", Object.keys(bank));
  if (bank.questions && bank.questions.length > 0) {
    console.log("Sample question from proctora_question_bank.json:", JSON.stringify(bank.questions[0], null, 2));
    
    // Group by department
    const deptCount = {};
    bank.questions.forEach(q => {
      const dept = q.department || q.dept || "UNKNOWN";
      deptCount[dept] = (deptCount[dept] || 0) + 1;
    });
    console.log("\nQuestions count by department in proctora_question_bank.json:", deptCount);
  }
}

if (fs.existsSync(batchPath)) {
  const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
  console.log("\nsample from seniority_l2_l3_question_batch.json:", JSON.stringify(batch[0], null, 2));
  const deptCount = {};
  batch.forEach(q => {
    const dept = q.department || "UNKNOWN";
    deptCount[dept] = (deptCount[dept] || 0) + 1;
  });
  console.log("\nQuestions count by department in seniority_l2_l3_question_batch.json:", deptCount);
}
