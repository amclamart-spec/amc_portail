-- Motif d'absence saisi par la famille lors de la justification (espace famille,
-- suivi pédagogique > onglet Absences) : MALADE, VOYAGE ou AUTRE.
ALTER TABLE "evaluations" ADD COLUMN "absence_reason" TEXT;
