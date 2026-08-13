-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "Department" AS ENUM ('SOFTWARE_ENGINEERING', 'DATA_ENGINEERING', 'PMO', 'QA', 'SYSOPS', 'ITOPS', 'SECOPS', 'SRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ExperienceLevel" AS ENUM ('FRESHER', 'EXPERIENCED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
ALTER TABLE "role_template" ADD COLUMN     "department" "Department",
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "level" "ExperienceLevel",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "role_template_question" (
    "id" TEXT NOT NULL,
    "role_template_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "module_type" "ModuleType" NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "question_version_snapshot" INTEGER,
    "point_share" DOUBLE PRECISION,

    CONSTRAINT "role_template_question_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_template_question_role_template_id_question_id_key" ON "role_template_question"("role_template_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_template_department_level_version_key" ON "role_template"("department", "level", "version");

-- AddForeignKey
ALTER TABLE "role_template_question" ADD CONSTRAINT "role_template_question_role_template_id_fkey" FOREIGN KEY ("role_template_id") REFERENCES "role_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_template_question" ADD CONSTRAINT "role_template_question_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
