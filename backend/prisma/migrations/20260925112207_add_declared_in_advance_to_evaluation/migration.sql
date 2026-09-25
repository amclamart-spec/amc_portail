-- Distingue une déclaration d'absence anticipée par la famille (avant le cours,
-- familyPedagogyService.declareAbsence) d'une absence déjà enregistrée puis
-- justifiée a posteriori — utilisé par la grille "Déclarations & justificatifs"
-- côté professeur/responsable de pôle (onglet Absences).
ALTER TABLE "evaluations" ADD COLUMN "declared_in_advance" BOOLEAN NOT NULL DEFAULT false;
