-- Nombre de refus d'un justificatif d'absence : permet de signaler au responsable
-- des absences qu'un justificatif en attente a été soumis à nouveau après un refus.
ALTER TABLE "evaluations" ADD COLUMN "rejection_count" INTEGER NOT NULL DEFAULT 0;
UPDATE "evaluations" SET "rejection_count" = 1 WHERE "justification_status" = 'REJECTED';
