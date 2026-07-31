-- CreateEnum
CREATE TYPE "VolunteerEventType" AS ENUM ('JOUMOUAA', 'RAMADAN', 'AID', 'FETE', 'AUTRE');

-- AlterTable
ALTER TABLE "volunteer_events" ADD COLUMN "type" "VolunteerEventType" NOT NULL DEFAULT 'AUTRE';
