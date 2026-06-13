-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'RESPONSABLE_POLE_CORAN';
ALTER TYPE "Role" ADD VALUE 'RESPONSABLE_POLE_ARABE';
ALTER TYPE "Role" ADD VALUE 'RESPONSABLE_POLE_SOUTIEN_SCO';
ALTER TYPE "Role" ADD VALUE 'RESPONSABLE_POLE_SCIENCE_IS';

-- DropIndex
DROP INDEX "time_slots_pole_id_idx";
