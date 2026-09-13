-- Pièces jointes du justificatif d'absence côté famille (espace famille, suivi
-- pédagogique > onglet Absences) : plusieurs documents possibles par absence,
-- supprimables individuellement.
CREATE TABLE "absence_justification_documents" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absence_justification_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "absence_justification_documents_evaluation_id_idx" ON "absence_justification_documents"("evaluation_id");

ALTER TABLE "absence_justification_documents" ADD CONSTRAINT "absence_justification_documents_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
