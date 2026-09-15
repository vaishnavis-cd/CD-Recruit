const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.question.groupBy({
    by: ['moduleType'],
    _count: { id: true },
  });
  console.log('Current DB Questions by module:', existing);

  // Check data files
  const dataDir = path.join(__dirname, 'data');
  const files = fs.readdirSync(dataDir);
  console.log('Files in data dir:', files);

  for (const f of files) {
    if (f.endsWith('.json')) {
      const content = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
      const sample = Array.isArray(content) ? content[0] : (content.questions ? content.questions[0] : content);
      const count = Array.isArray(content) ? content.length : (content.questions ? content.questions.length : 1);
      console.log(`File: ${f} | Count: ${count} | Sample moduleType: ${sample?.moduleType || sample?.module}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
