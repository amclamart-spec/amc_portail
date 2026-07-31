-- Self-service : un utilisateur peut demander un rôle supplémentaire depuis son espace ("Mes rôles").
-- Le rôle ajouté par un responsable/admin reste actif immédiatement (statut par défaut APPROVED) ;
-- une demande faite par l'utilisateur lui-même est créée PENDING et validée par le responsable concerné.
CREATE TYPE "UserRoleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "user_roles" ADD COLUMN "status" "UserRoleStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "user_roles" ADD COLUMN "pole_id" TEXT;
ALTER TABLE "user_roles" ADD COLUMN "decided_by" TEXT;
ALTER TABLE "user_roles" ADD COLUMN "decided_at" TIMESTAMP(3);
ALTER TABLE "user_roles" ADD COLUMN "rejection_reason" TEXT;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_pole_id_fkey" FOREIGN KEY ("pole_id") REFERENCES "poles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
