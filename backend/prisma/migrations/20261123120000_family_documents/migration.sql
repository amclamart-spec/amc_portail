-- Pièces jointes de la fiche famille, stockées en base.
CREATE TABLE "family_documents" (
    "id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "family_documents_family_id_idx" ON "family_documents"("family_id");

ALTER TABLE "family_documents" ADD CONSTRAINT "family_documents_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "family_documents" ADD CONSTRAINT "family_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
