-- Suivi Coran (espace famille) : la sourate devient optionnelle pour les révisions
-- et les séances de lecture (déjà le cas pour l'apprentissage), et l'apprentissage
-- gagne une date de début saisissable librement (y compris dans le passé), distincte
-- de la date de création technique de l'enregistrement.
ALTER TABLE "coran_revisions" ALTER COLUMN "sourate_id" DROP NOT NULL;
ALTER TABLE "coran_lectures" ALTER COLUMN "sourate_id" DROP NOT NULL;

ALTER TABLE "coran_repetitions" ADD COLUMN "date_debut" TIMESTAMP(3);
UPDATE "coran_repetitions" SET "date_debut" = "created_at" WHERE "date_debut" IS NULL;
ALTER TABLE "coran_repetitions" ALTER COLUMN "date_debut" SET NOT NULL;
ALTER TABLE "coran_repetitions" ALTER COLUMN "date_debut" SET DEFAULT CURRENT_TIMESTAMP;
