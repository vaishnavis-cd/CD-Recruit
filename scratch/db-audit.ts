import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../backend/api/.env") });

const prisma = new PrismaClient();

async function main() {
  console.log("=== DB AUDIT START ===");
  
  // 1. Total Questions
  const totalQuestions = await prisma.question.count();
  const publishedQuestions = await prisma.question.count({ where: { status: "PUBLISHED" } });
  const draftQuestions = await prisma.question.count({ where: { status: "DRAFT" } });
  const archivedQuestions = await prisma.question.count({ where: { status: "ARCHIVED" } });
  
  console.log(`Total questions in DB: ${totalQuestions}`);
  console.log(`Published questions in DB: ${publishedQuestions}`);
  console.log(`Draft questions in DB: ${draftQuestions}`);
  console.log(`Archived questions in DB: ${archivedQuestions}`);

  // 2. Break down by module
  const modules = ["MCQ", "SQL", "NOSQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"];
  console.log("\n=== QUESTIONS BY MODULE ===");
  for (const mod of modules) {
    const pub = await prisma.question.count({ where: { moduleType: mod as any, status: "PUBLISHED" } });
    const draft = await prisma.question.count({ where: { moduleType: mod as any, status: "DRAFT" } });
    const arch = await prisma.question.count({ where: { moduleType: mod as any, status: "ARCHIVED" } });
    const tot = await prisma.question.count({ where: { moduleType: mod as any } });
    console.log(`${mod} | Total: ${tot} | Published: ${pub} | Draft/Archived: ${draft + arch}`);
  }

  // 3. Question Difficulty distribution
  console.log("\n=== DIFFICULTY DISTRIBUTION ===");
  const difficulties = ["easy", "medium", "hard", "expert"];
  for (const mod of modules) {
    const row: any = { module: mod };
    for (const diff of difficulties) {
      row[diff] = await prisma.question.count({ where: { moduleType: mod as any, difficulty: { equals: diff, mode: 'insensitive' } } });
    }
    const nullOrOther = await prisma.question.count({ 
      where: { 
        moduleType: mod as any, 
        OR: [
          { difficulty: null },
          { NOT: { difficulty: { in: difficulties } } }
        ]
      } 
    });
    row.other = nullOrOther;
    console.log(`${mod} | Easy: ${row.easy} | Medium: ${row.medium} | Hard: ${row.hard} | Expert: ${row.expert} | Other/Null: ${row.other}`);
  }

  // 4. Question fields inspection (present in schema and actual data)
  console.log("\n=== METADATA IN DB ===");
  const allQs = await prisma.question.findMany();
  let difficultyCount = 0;
  let experienceCount = 0;
  let seniorityCount = 0;
  let levelCount = 0;
  let roleCount = 0;
  let departmentCount = 0;
  let skillCount = 0;
  let topicCount = 0;
  let tagsCount = 0;
  let moduleCount = 0;
  let versionCount = 0;
  let statusCount = 0;
  let typeCount = 0;
  let sourceCount = 0;
  let competencyCount = 0;

  for (const q of allQs) {
    if (q.difficulty !== null && q.difficulty !== undefined) difficultyCount++;
    if (q.role !== null && q.role !== undefined) roleCount++;
    if (q.tags && q.tags.length > 0) tagsCount++;
    if (q.moduleType) moduleCount++;
    if (q.version !== null && q.version !== undefined) versionCount++;
    if (q.status) statusCount++;
    
    // Check inside content/scoringConfig json if any other fields exist
    const content = q.content as any;
    if (content) {
      if (content.experience) experienceCount++;
      if (content.seniority) seniorityCount++;
      if (content.level) levelCount++;
      if (content.department) departmentCount++;
      if (content.skill) skillCount++;
      if (content.topic) topicCount++;
      if (content.type) typeCount++;
      if (content.source) sourceCount++;
      if (content.competency) competencyCount++;
    }
  }
  console.log(`Total questions: ${allQs.length}`);
  console.log(`difficulty present: ${difficultyCount}`);
  console.log(`role present: ${roleCount}`);
  console.log(`tags present: ${tagsCount}`);
  console.log(`moduleType present: ${moduleCount}`);
  console.log(`version present: ${versionCount}`);
  console.log(`status present: ${statusCount}`);
  console.log(`experience in content present: ${experienceCount}`);
  console.log(`seniority in content present: ${seniorityCount}`);
  console.log(`level in content present: ${levelCount}`);
  console.log(`department in content present: ${departmentCount}`);
  console.log(`skill in content present: ${skillCount}`);
  console.log(`topic in content present: ${topicCount}`);
  console.log(`type in content present: ${typeCount}`);
  console.log(`source in content present: ${sourceCount}`);
  console.log(`competency in content present: ${competencyCount}`);

  // 5. RoleTemplates
  console.log("\n=== ROLE TEMPLATES ===");
  const templates = await prisma.roleTemplate.findMany();
  for (const t of templates) {
    console.log(`ID: ${t.id} | Name: ${t.roleName} | Dept: ${t.department} | Level: ${t.level} | Duration: ${t.durationMinutes} | Active: ${t.isActive} | Modules: ${JSON.stringify(t.weightingPreset)}`);
  }

  // 6. Invite / Candidate / Session Experience / Seniority System
  console.log("\n=== INVITES & CANDIDATES ===");
  const invites = await prisma.invite.findMany({ take: 5 });
  console.log("Invites sample:", invites.map(i => ({ id: i.id, email: i.candidateEmail, roleTemplateId: i.roleTemplateId, driveId: i.driveId })));

  const candidates = await prisma.candidate.findMany({ take: 5 });
  console.log("Candidates sample:", candidates.map(c => ({ id: c.id, email: c.email })));

  const sessions = await prisma.session.findMany({ take: 5 });
  console.log("Sessions sample:", sessions.map(s => ({ id: s.id, status: s.status, driveId: s.driveId, roleTemplateId: s.roleTemplateId })));

  // 7. Context Simulation questions
  console.log("\n=== CONTEXT SIMULATION SCENARIOS ===");
  const simQuestions = await prisma.question.findMany({
    where: { moduleType: "SIMULATION" }
  });
  console.log(`Found ${simQuestions.length} simulation questions.`);
  for (const sq of simQuestions) {
    const c = sq.content as any;
    console.log(`Sim Q: ID: ${sq.id} | Difficulty: ${sq.difficulty} | Role: ${sq.role} | ScenarioId: ${c?.scenarioId || c?.id} | Title: ${c?.title || c?.prompt}`);
  }

  // 8. TEST_SCENARIOS questions
  console.log("\n=== TEST_SCENARIOS ===");
  const testScenarios = await prisma.question.findMany({
    where: { moduleType: "TEST_SCENARIOS" }
  });
  console.log(`Found ${testScenarios.length} test scenarios.`);
  for (const tq of testScenarios) {
    const c = tq.content as any;
    console.log(`Test Scenario Q: ID: ${tq.id} | Difficulty: ${tq.difficulty} | Role: ${tq.role} | Title: ${c?.title || c?.prompt}`);
  }

  // 9. DriveQuestions check
  console.log("\n=== DRIVE QUESTIONS ===");
  const drives = await prisma.drive.findMany();
  for (const d of drives) {
    const count = await prisma.driveQuestion.count({ where: { driveId: d.id } });
    console.log(`Drive: ${d.name} (ID: ${d.id}) | RoleTemplate: ${d.roleTemplateId} | Connected questions: ${count}`);
  }

  console.log("=== DB AUDIT END ===");
}

main().catch(console.error).finally(() => prisma.$disconnect());
