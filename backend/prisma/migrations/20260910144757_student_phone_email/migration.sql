-- Ajoute les champs optionnels "Téléphone élève" et "Email élève" sur la fiche
-- élève (espace admin, Inscriptions > Détail inscription > Informations élève),
-- également saisissables lors de l'étape d'ajout d'élève de l'inscription.
ALTER TABLE "students" ADD COLUMN "phone" TEXT;
ALTER TABLE "students" ADD COLUMN "email" TEXT;
