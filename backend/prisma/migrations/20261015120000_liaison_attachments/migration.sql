-- Pièces jointes du cahier de liaison stockées en base : les fichiers écrits dans
-- uploads/ sont perdus à chaque redéploiement/redémarrage en production, et le lien
-- relatif /uploads/... pointait vers le site frontend et non vers l'API.
CREATE TABLE "liaison_attachments" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liaison_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "liaison_messages" ADD COLUMN "attachment_id" TEXT;

CREATE INDEX "liaison_messages_attachment_id_idx" ON "liaison_messages"("attachment_id");

ALTER TABLE "liaison_messages" ADD CONSTRAINT "liaison_messages_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "liaison_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
