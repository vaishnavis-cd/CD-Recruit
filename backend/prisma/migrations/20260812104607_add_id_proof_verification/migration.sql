-- AlterTable
ALTER TABLE "candidate" ADD COLUMN     "id_proof_embedding" JSONB,
ADD COLUMN     "id_proof_model" TEXT,
ADD COLUMN     "id_proof_ref" TEXT,
ADD COLUMN     "id_verified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "invite" ADD COLUMN     "id_proof_embedding" JSONB,
ADD COLUMN     "id_proof_ref" TEXT,
ADD COLUMN     "id_proof_uploaded_at" TIMESTAMP(3);
