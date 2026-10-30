-- Commentaire saisi par le responsable des absences lorsqu'il refuse un justificatif
-- (Suivi des absences), visible par la famille dans son onglet Absences.
ALTER TABLE "evaluations" ADD COLUMN "rejection_comment" TEXT;
