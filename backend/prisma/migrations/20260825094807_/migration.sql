-- AlterEnum
ALTER TYPE "ModuleType" ADD VALUE 'TEST_SCENARIOS';

-- AlterTable
ALTER TABLE "score" ALTER COLUMN "composite_score" DROP NOT NULL,
ALTER COLUMN "say_do_consistency_score" DROP NOT NULL,
ALTER COLUMN "ai_confidence" DROP NOT NULL,
ALTER COLUMN "bonus_score" DROP NOT NULL,
ALTER COLUMN "bonus_score" DROP DEFAULT,
ALTER COLUMN "core_score" DROP NOT NULL,
ALTER COLUMN "core_score" DROP DEFAULT,
ALTER COLUMN "total_score" DROP NOT NULL,
ALTER COLUMN "total_score" DROP DEFAULT;
