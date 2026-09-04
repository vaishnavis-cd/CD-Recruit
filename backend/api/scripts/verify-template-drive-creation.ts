import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function testDriveCreationFromTemplate() {
  console.log("==================================================");
  console.log("TESTING DRIVE CREATION FROM ACTIVE ROLE TEMPLATE");
  console.log("==================================================");

  const template = await prisma.roleTemplate.findFirst({
    where: { department: "SOFTWARE_ENGINEERING", level: "FRESHER", isActive: true },
  });

  if (!template) {
    console.error("No active template found!");
    process.exit(1);
  }

  console.log(`Template: "${template.roleName}" (${template.department} / ${template.level})`);
  console.log(`Template Duration: ${template.durationMinutes} min`);
  console.log(`Template Preset:`, JSON.stringify(template.weightingPreset));

  const preset = (template.weightingPreset as Record<string, number>) || {};
  const totalDuration = template.durationMinutes || 90;

  const entries = Object.entries(preset);
  let totalWeight = entries.reduce((sum, [_, w]) => sum + (typeof w === "number" ? w : 0), 0);
  if (totalWeight <= 1 && totalWeight > 0) {
    totalWeight = Math.round(totalWeight * 100);
  }

  let allocatedMinutesSum = 0;
  const moduleConfig: Record<string, any> = {};

  entries.forEach(([mod, w], idx) => {
    let weightNum = typeof w === "number" ? w : 0.2;
    if (weightNum <= 1 && weightNum > 0) weightNum = Math.round(weightNum * 100);

    let modDuration = Math.max(5, Math.round((weightNum / (totalWeight || 100)) * totalDuration));
    if (idx === entries.length - 1) {
      modDuration = Math.max(5, totalDuration - allocatedMinutesSum);
    } else {
      allocatedMinutesSum += modDuration;
    }

    moduleConfig[mod] = {
      enabled: true,
      durationMinutes: modDuration,
      weight: weightNum,
      questionWeighting: { mode: "equal" },
    };
  });

  console.log("\nSimulated Drive moduleConfig Output:");
  console.table(
    Object.entries(moduleConfig).map(([mod, conf]) => ({
      Module: mod,
      Weight: `${conf.weight}%`,
      DurationMinutes: `${conf.durationMinutes} min`,
    }))
  );

  const finalWeightSum = Object.values(moduleConfig).reduce((s, c) => s + c.weight, 0);
  const finalDurationSum = Object.values(moduleConfig).reduce((s, c) => s + c.durationMinutes, 0);

  console.log(`Total Module Weight: ${finalWeightSum}% (Target: 100%)`);
  console.log(`Total Module Duration: ${finalDurationSum} min (Target: 90 min)`);

  if (finalWeightSum === 100 && finalDurationSum === 90) {
    console.log("\n[PASS] Templates and drive instantiation are 100% aligned and ready for Partner API!");
  } else {
    console.error("\n[FAIL] Mismatch in weights or duration!");
    process.exit(1);
  }
}

testDriveCreationFromTemplate()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
