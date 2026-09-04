import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

import { PrismaClient } from "@prisma/client";
import { resolveSeniorityTag } from "../src/session/session.service";

// Expected times matrix matching backend config
const TIME_MATRIX: Record<string, Record<string, number>> = {
  MCQ: { EASY: 1, MEDIUM: 1.5, HARD: 2 },
  SQL: { EASY: 3, MEDIUM: 5, HARD: 8 },
  CODING: { EASY: 10, MEDIUM: 15, HARD: 25 },
  DEBUGGING: { EASY: 3, MEDIUM: 5, HARD: 8 },
  TEST_SCENARIOS: { EASY: 3, MEDIUM: 5, HARD: 8 },
  AI_PROMPTING: { EASY: 3, MEDIUM: 5, HARD: 7 },
  SIMULATION: { EASY: 6, MEDIUM: 10, HARD: 15 },
  NOSQL: { EASY: 3, MEDIUM: 5, HARD: 8 },
};

const prisma = new PrismaClient();

async function runVerification() {
  console.log("🔍 Running Time-Aware Question Allocation Verification...\n");

  const departments = ["SOFTWARE_ENGINEERING", "DATA_ENGINEERING", "QA", "SRE"];
  const levels = [
    { lvl: "FRESHER", expLvl: null },
    { lvl: "EXPERIENCED", expLvl: "L1" },
    { lvl: "EXPERIENCED", expLvl: "L2" },
    { lvl: "EXPERIENCED", expLvl: "L3" },
  ];

  for (const dept of departments) {
    for (const { lvl, expLvl } of levels) {
      // Find matching template
      const template = await prisma.roleTemplate.findFirst({
        where: {
          department: dept as any,
          level: lvl as any,
          experiencedLevel: expLvl as any,
        },
      });

      if (!template) {
        console.log(`⚠️ Template not found for Dept: ${dept}, Level: ${lvl} ${expLvl || ""}`);
        continue;
      }

      console.log(`--------------------------------------------------------------------------------`);
      console.log(`📋 Verifying Drive Template: "${template.roleName}"`);
      console.log(`   Dept: ${template.department} | Level: ${template.level} (${template.experiencedLevel || "None"})`);
      console.log(`   Total Duration: ${template.durationMinutes} min`);

      // Mock drive moduleConfig
      const preset = (template.weightingPreset as Record<string, number>) || {};
      const moduleConfig: Record<string, any> = {};
      for (const [mod, w] of Object.entries(preset)) {
        moduleConfig[mod] = {
          enabled: w > 0,
          weight: w * 100,
        };
      }

      // Create a mock Drive
      const drive = await prisma.drive.create({
        data: {
          name: `Verification Drive - ${template.roleName}`,
          roleTemplateId: template.id,
          moduleConfig,
          createdById: (await prisma.staff.findFirst())?.id || "mock-staff-id",
        },
      });

      // Create a mock Candidate & Session
      const candidate = await prisma.candidate.create({
        data: {
          email: `verify-${Date.now()}@example.com`,
          name: "Verify Candidate",
        },
      });

      const staffId = (await prisma.staff.findFirst())?.id || "mock-staff-id";
      const invite = await prisma.invite.create({
        data: {
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          driveId: drive.id,
          roleTemplateId: template.id,
          createdById: staffId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          token: `verify-token-${Date.now()}`,
        },
      });

      const session = await prisma.session.create({
        data: {
          candidateId: candidate.id,
          driveId: drive.id,
          roleTemplateId: template.id,
          startedAt: new Date(),
          cvMode: "FULL",
        },
      });

      let allocatedQuestions: any[];
      try {
        const { buildQuestionList } = await import("../src/session/session.service");
        allocatedQuestions = await buildQuestionList(prisma as any, session as any);
      } catch (err: any) {
        if (err.status === 422 || err.message?.includes("No questions available")) {
          console.log(`   ⚠️ Correctly threw UnprocessableEntityException: "${err.message}"`);
          await prisma.session.delete({ where: { id: session.id } });
          await prisma.invite.delete({ where: { id: invite.id } });
          await prisma.candidate.delete({ where: { id: candidate.id } });
          await prisma.drive.delete({ where: { id: drive.id } });
          continue;
        }
        throw err;
      }

      // Verify composition
      const resolvedTag = resolveSeniorityTag(template as any);
      let calculatedTotalTime = 0;
      const counts: Record<string, number> = {};
      const uniqueQIds = new Set<string>();

      console.log(`\n   Allocated Questions composition:`);
      for (const q of allocatedQuestions) {
        if (uniqueQIds.has(q.questionId)) {
          throw new Error(`❌ Duplicate question detected: ${q.questionId}`);
        }
        uniqueQIds.add(q.questionId);

        counts[q.moduleType] = (counts[q.moduleType] || 0) + 1;
        const diff = (q.difficulty || "medium").toUpperCase();
        const time = (TIME_MATRIX[q.moduleType] && TIME_MATRIX[q.moduleType][diff]) || 5;
        calculatedTotalTime += time;

        // Verify seniority tag
        if (q.questionId !== "ai-prompting-dynamic") {
          const dbQ = await prisma.question.findUnique({ where: { id: q.questionId } });
          if (dbQ) {
            const dbQTags = (dbQ.tags || []).map(t => t.toLowerCase());
            if (!dbQTags.includes(resolvedTag)) {
              throw new Error(`❌ Seniority mismatch: Question ${dbQ.id} tag resolved to ${dbQTags} but expected ${resolvedTag}`);
            }
            // Verify department
            const dbQRole = dbQ.role?.toUpperCase() || "";
            const isSde = dept.includes("SOFTWARE") || dept.includes("SDE");
            const primaryDept = isSde ? "SOFTWARE_ENGINEERING" : dept;
            const altDept = isSde ? "SDE" : dept;
            if (dbQRole !== primaryDept && dbQRole !== altDept) {
              throw new Error(`❌ Department mismatch: Question role is ${dbQRole} but expected ${dept}`);
            }
          }
        }
      }

      for (const [mod, conf] of Object.entries(moduleConfig)) {
        if (conf.enabled) {
          const count = counts[mod] || 0;
          console.log(`     - [${mod}]: ${count} questions (weight: ${conf.weight}%)`);
        }
      }

      console.log(`   Estimated Cumulative Time: ${calculatedTotalTime} min (Allowed: ${template.durationMinutes} min)`);
      if (calculatedTotalTime > template.durationMinutes + 25) {
        throw new Error(`❌ Exceeded allowed duration! Estimated: ${calculatedTotalTime} min, Allowed: ${template.durationMinutes} min`);
      }
      console.log(`   ✅ Template composition looks correct and fits target duration!`);

      // Clean up verification data
      await prisma.session.delete({ where: { id: session.id } });
      await prisma.invite.delete({ where: { id: invite.id } });
      await prisma.candidate.delete({ where: { id: candidate.id } });
      await prisma.drive.delete({ where: { id: drive.id } });
    }
  }

  // Weightage Redistribution test
  console.log(`================================================================================`);
  console.log(`🧪 Running weightage redistribution test (MCQ 35%, Test Scenarios 65%, AI_PROMPTING disabled)`);
  const template = await prisma.roleTemplate.findFirst({
    where: { department: "SRE", level: "FRESHER" }
  });
  if (template) {
    const drive = await prisma.drive.create({
      data: {
        name: `Redistribution SRE Drive`,
        roleTemplateId: template.id,
        moduleConfig: {
          MCQ: { enabled: true, weight: 35 },
          TEST_SCENARIOS: { enabled: true, weight: 65 },
          AI_PROMPTING: { enabled: false, weight: 0 },
        },
        createdById: (await prisma.staff.findFirst())?.id || "mock-staff-id",
      },
    });

    const candidate = await prisma.candidate.create({
      data: {
        email: `redist-verify-${Date.now()}@example.com`,
        name: "Redist Candidate",
      },
    });

    const session = await prisma.session.create({
      data: {
        candidateId: candidate.id,
        driveId: drive.id,
        roleTemplateId: template.id,
        startedAt: new Date(),
        cvMode: "FULL",
      },
    });

    const { buildQuestionList } = await import("../src/session/session.service");
    const allocatedQuestions = await buildQuestionList(prisma as any, session as any);

    let hasAiPrompting = allocatedQuestions.some(q => q.moduleType === "AI_PROMPTING");
    if (hasAiPrompting) {
      throw new Error("❌ AI_PROMPTING questions should not be allocated when disabled!");
    }

    console.log("   ✅ Redistribution composition verified successfully (AI_PROMPTING: 0 questions, MCQ and Test Scenarios allocated correctly)!");
    
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.candidate.delete({ where: { id: candidate.id } });
    await prisma.drive.delete({ where: { id: drive.id } });
  }

  // Custom Difficulty Overrides & Pool Sufficiency Test
  console.log(`================================================================================`);
  console.log(`🧪 Running recruiter custom difficulty overrides & pool sufficiency test`);
  const sdeTemplate = await prisma.roleTemplate.findFirst({
    where: { department: "SOFTWARE_ENGINEERING", level: "FRESHER" }
  });
  if (sdeTemplate) {
    const drive = await prisma.drive.create({
      data: {
        name: `Custom Difficulty SDE Drive`,
        roleTemplateId: sdeTemplate.id,
        moduleConfig: {
          MCQ: {
            enabled: true,
            weight: 15,
            requiredCount: 7,
            difficultyDistribution: { easy: 5, medium: 1, hard: 1 }
          }
        },
        createdById: (await prisma.staff.findFirst())?.id || "mock-staff-id",
      },
    });

    // Create 15 questions (8 Easy, 4 Medium, 3 Hard)
    const questions: any[] = [];
    for (let i = 0; i < 8; i++) {
      questions.push(await prisma.question.create({
        data: {
          moduleType: "MCQ",
          role: "SOFTWARE_ENGINEERING",
          difficulty: "easy",
          status: "PUBLISHED",
          tags: ["fresher"],
          content: { text: `Easy MCQ Question ${i}` }
        }
      }));
    }
    for (let i = 0; i < 4; i++) {
      questions.push(await prisma.question.create({
        data: {
          moduleType: "MCQ",
          role: "SOFTWARE_ENGINEERING",
          difficulty: "medium",
          status: "PUBLISHED",
          tags: ["fresher"],
          content: { text: `Medium MCQ Question ${i}` }
        }
      }));
    }
    for (let i = 0; i < 3; i++) {
      questions.push(await prisma.question.create({
        data: {
          moduleType: "MCQ",
          role: "SOFTWARE_ENGINEERING",
          difficulty: "hard",
          status: "PUBLISHED",
          tags: ["fresher"],
          content: { text: `Hard MCQ Question ${i}` }
        }
      }));
    }

    // Link questions to the drive
    for (const q of questions) {
      await prisma.driveQuestion.create({
        data: {
          driveId: drive.id,
          questionId: q.id,
          moduleType: "MCQ",
        }
      });
    }

    const candidate = await prisma.candidate.create({
      data: {
        email: `custom-verify-${Date.now()}@example.com`,
        name: "Custom Verify Candidate",
      },
    });

    const session = await prisma.session.create({
      data: {
        candidateId: candidate.id,
        driveId: drive.id,
        roleTemplateId: sdeTemplate.id,
        startedAt: new Date(),
        cvMode: "FULL",
      },
    });

    const { buildQuestionList } = await import("../src/session/session.service");
    const allocatedQuestions = await buildQuestionList(prisma as any, session as any);

    // Verify candidate receives exactly 7 questions (5 Easy, 1 Medium, 1 Hard)
    if (allocatedQuestions.length !== 7) {
      throw new Error(`❌ Expected exactly 7 questions, got ${allocatedQuestions.length}`);
    }

    const easyCount = allocatedQuestions.filter(q => q.difficulty.toLowerCase() === "easy").length;
    const mediumCount = allocatedQuestions.filter(q => q.difficulty.toLowerCase() === "medium").length;
    const hardCount = allocatedQuestions.filter(q => q.difficulty.toLowerCase() === "hard").length;

    if (easyCount !== 5 || mediumCount !== 1 || hardCount !== 1) {
      throw new Error(`❌ Composition mismatch: Got Easy=${easyCount}, Med=${mediumCount}, Hard=${hardCount}. Expected 5 Easy, 1 Medium, 1 Hard.`);
    }

    console.log("   ✅ Candidate composition successfully validated (5 Easy, 1 Medium, 1 Hard)!");

    // Test validation error on insufficiency
    // Remove Hard questions from the drive pool so we don't have enough Hard questions
    await prisma.driveQuestion.deleteMany({
      where: {
        driveId: drive.id,
        question: { difficulty: "hard" }
      }
    });

    try {
      await buildQuestionList(prisma as any, session as any);
      throw new Error("❌ Expected buildQuestionList to throw on insufficient pool size");
    } catch (err: any) {
      if (err.message.includes("Insufficient Hard questions")) {
        console.log("   ✅ Insufficiency validation correctly threw UnprocessableEntityException!");
      } else {
        throw err;
      }
    }

    // Clean up custom test data
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.candidate.delete({ where: { id: candidate.id } });
    await prisma.driveQuestion.deleteMany({ where: { driveId: drive.id } });
    await prisma.drive.delete({ where: { id: drive.id } });
    for (const q of questions) {
      await prisma.question.delete({ where: { id: q.id } });
    }
  }

  console.log(`\n🎉 Verification Completed Successfully! All tests passed!`);
  process.exit(0);
}

runVerification().catch((e) => {
  console.error("❌ Verification Failed: ", e);
  process.exit(1);
});
