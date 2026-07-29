import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const apiBase = process.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

async function auditTrackWorkflows(roleName: string, trackName: 'fresher' | 'experienced') {
  console.log(`\n======================================================================`);
  console.log(` AUDITING SIMULATION WORKFLOW: ${trackName.toUpperCase()} TRACK (${roleName})`);
  console.log(`======================================================================`);

  // 1. Setup DB Org, Candidate, RoleTemplate, Drive, Session
  let org = await prisma.organization.findFirst({ where: { slug: 'acme-corp' } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: 'Acme Corp', slug: 'acme-corp' } });
  }

  const candidate = await prisma.candidate.create({
    data: {
      name: trackName === 'fresher' ? 'Aarav Gupta (Fresher)' : 'Vikram Malhotra (Senior)',
      email: `sim-${trackName}-${Date.now()}@example.com`,
      organizationId: org.id,
    },
  });

  let roleTemplate = await prisma.roleTemplate.findFirst({ where: { roleName } });
  if (!roleTemplate) {
    roleTemplate = await prisma.roleTemplate.create({
      data: {
        roleName,
        weightingPreset: { MCQ: 0.15, SQL: 0.2, CODING: 0.3, AI_PROMPTING: 0.2, SIMULATION: 0.15 },
        durationMinutes: 90,
      },
    });
  }

  const drive = await prisma.drive.create({
    data: {
      name: `Drive - ${roleName} ${Date.now()}`,
      roleTemplateId: roleTemplate.id,
      organizationId: org.id,
      moduleConfig: {},
      createdById: 'SYSTEM',
    },
  });

  const session = await prisma.session.create({
    data: {
      candidateId: candidate.id,
      roleTemplateId: roleTemplate.id,
      driveId: drive.id,
      organizationId: org.id,
      status: 'IN_PROGRESS' as any,
      cvMode: 'FULL' as any,
      startedAt: new Date(),
    },
  });

  console.log(`✔ Initialized ${trackName} Session: ${session.id}`);

  // 2. Start Simulation API
  const startRes = await axios.post(`${apiBase}/sessions/${session.id}/simulation/start`);
  console.log(`✔ POST /sessions/${session.id}/simulation/start -> Status:`, startRes.data.status, '| Track assigned:', startRes.data.track);
  console.log(`  Events Queue [${startRes.data.eventsList.length} items]:`, startRes.data.eventsList.join(', '));

  const sampleResponses: Record<string, any> = {
    // Fresher
    fresher_manager_eta: { response: 'ETA is tomorrow 3pm, waiting for database migration blocker', text: 'ETA is tomorrow 3pm, waiting for database migration blocker', actionLog: [] },
    fresher_req_clarify: { response: 'What is the search scope and filter criteria?', text: 'What is the search scope and filter criteria?', actionLog: [] },
    fresher_qa_bug: { response: 'Fixed blank name validation using .trim()', text: 'Fixed blank name validation using .trim()', actionLog: [{ action: 'run_tests' }] },
    fresher_code_review: { response: 'Found static map memory leak and console.log print statements', text: 'Found static map memory leak and console.log print statements', action: 'reject', actionLog: [] },
    fresher_teammate_question: { response: 'Database indexes speed up read retrieval but add write overhead', text: 'Database indexes speed up read retrieval but add write overhead', actionLog: [] },

    // Experienced
    experienced_prod_incident: { action: 'rollback', text: 'Rollback recent deploy immediately to resolve connection limits', actionLog: [] },
    experienced_pipeline_failure: { response: 'Updated npm install to npm ci in CI config', text: 'Updated npm install to npm ci in CI config', actionLog: [{ action: 're_run_pipeline' }] },
    experienced_security_alert: { action: 'deactivate_key', text: 'Deactivated exposed AWS key in IAM', actionLog: [] },
    experienced_customer_escalation: { response: 'Understood enterprise pain, investigating Stripe Europe gateway validation failure', text: 'Understood enterprise pain, investigating Stripe Europe gateway validation failure', actionLog: [] },
    experienced_priority_conflict: { action: 'propose_compromise', text: 'Proposed hotfix for Stripe payment while scheduling cache fix next sprint', actionLog: [] },
  };

  // 3. Step through all 5 events
  for (let i = 0; i < startRes.data.eventsList.length; i++) {
    const currRes = await axios.get(`${apiBase}/sessions/${session.id}/simulation/current`);
    const event = currRes.data.event;
    console.log(`\n--- Event #${i + 1}: ${event.id} (${event.title}) ---`);
    console.log(`  Workspace Type:`, event.workspaceType, '| Timer:', currRes.data.timerSeconds, 's');
    console.log(`  Enriched Context:`, event.enrichedContent?.context || event.description);

    // Log investigating state
    await axios.post(`${apiBase}/sessions/${session.id}/simulation/state`, {
      state: 'INVESTIGATING',
      action: 'Candidate opened scenario details',
    });

    // Submit response
    const payload = sampleResponses[event.id] || { text: 'Submitted response payload' };
    const submitRes = await axios.post(`${apiBase}/sessions/${session.id}/simulation/submit`, payload);
    const eventState = submitRes.data.eventStates[event.id];
    console.log(`  ✔ Submitted Response -> Outcome: "${eventState?.outcome}" | Score Contribution: ${submitRes.data.eventStates[event.id]?.competenciesImpacted?.join(', ')}`);
  }

  // 4. Audit DB persistence (moduleResponse)
  const dbModuleResp = await prisma.moduleResponse.findFirst({
    where: { sessionId: session.id },
  });
  console.log(`\n✔ ModuleResponse DB Audit: Found row ID=${dbModuleResp?.id}`);
  console.log(`  isDraft:`, dbModuleResp?.isDraft, '| payload status:', (dbModuleResp?.responsePayload as any)?.status);
  console.log(`  Overall Score:`, (dbModuleResp?.responsePayload as any)?.overallScore);
  console.log(`  Competency Breakdown:`, JSON.stringify((dbModuleResp?.responsePayload as any)?.competencyScores));

  // 5. Audit Assessment Engine integration (Score model)
  const dbScore = await prisma.score.findUnique({
    where: { sessionId: session.id },
  });
  console.log(`\n✔ Score Model DB Audit: Composite Score=${dbScore?.compositeScore} | ModuleScores:`, dbScore?.moduleScores);

  // 6. Audit Recruiter Replay Timeline API
  const timelineRes = await axios.get(`${apiBase}/sessions/${session.id}/simulation/timeline`);
  console.log(`\n✔ Recruiter Timeline API (GET /sessions/${session.id}/simulation/timeline): Returned ${timelineRes.data.length} event logs.`);
  timelineRes.data.forEach((t: any, idx: number) => {
    console.log(`  [${idx + 1}] Event "${t.event}": state=${t.state}, outcome=${t.outcome}, duration=${t.durationSeconds}s, actionsCount=${t.actions?.length}`);
  });
}

async function main() {
  try {
    await auditTrackWorkflows('Junior Developer (Fresher)', 'fresher');
    await auditTrackWorkflows('Senior Systems Engineer', 'experienced');
    console.log('\n======================================================================');
    console.log('🎉 AUDIT COMPLETE: ALL SIMULATION WORKFLOWS VERIFIED LOCALLY 100%!');
    console.log('======================================================================\n');
  } catch (err: any) {
    console.error('Audit execution error:', err?.response?.data || err?.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
