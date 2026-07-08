-- AlterTable: add family justification fields to evaluations
ALTER TABLE "evaluations" ADD COLUMN "family_justification" TEXT;
ALTER TABLE "evaluations" ADD COLUMN "justification_status" TEXT NOT NULL DEFAULT 'NONE';
