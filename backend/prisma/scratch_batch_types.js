const fs = require('fs');
const path = require('path');

const batch = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/seniority_l2_l3_question_batch.json'), 'utf8'));
const modTypes = {};
for (const q of batch) {
  const m = q.moduleType || q.module;
  modTypes[m] = (modTypes[m] || 0) + 1;
}
console.log('seniority_l2_l3_question_batch modules:', modTypes);
