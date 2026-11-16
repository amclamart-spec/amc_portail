-- Pièces jointes des devoirs stockées en base : les fichiers écrits dans uploads/
-- sont perdus à chaque redéploiement/redémarrage en production, et le lien relatif
-- /uploads/... pointait vers le site frontend et non vers l'API.
ALTER TABLE "homework_messages" ADD COLUMN "attachment_mime_type" TEXT;
ALTER TABLE "homework_messages" ADD COLUMN "attachment_data" BYTEA;
