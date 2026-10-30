-- Contenu des justificatifs d'absence stocké en base (les fichiers de uploads/ sont
-- perdus à chaque redémarrage en production).
CREATE TABLE "absence_justification_document_files" (
    "document_id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absence_justification_document_files_pkey" PRIMARY KEY ("document_id")
);

ALTER TABLE "absence_justification_document_files" ADD CONSTRAINT "absence_justification_document_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "absence_justification_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
