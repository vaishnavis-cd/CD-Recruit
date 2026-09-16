-- DropIndex
DROP INDEX IF EXISTS "staff_keycloak_user_id_key";

-- AlterTable
ALTER TABLE "staff" DROP COLUMN IF EXISTS "keycloak_user_id";
