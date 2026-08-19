-- AlterEnum
ALTER TYPE "ModuleType" ADD VALUE 'DEBUGGING';
ALTER TYPE "ModuleType" ADD VALUE 'NOSQL';

-- AlterTable
ALTER TABLE "module_response" ADD COLUMN     "execution_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_operation" JSONB,
ADD COLUMN     "sandbox_db_name" TEXT;
