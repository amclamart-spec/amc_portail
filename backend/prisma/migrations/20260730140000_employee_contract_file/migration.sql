-- Ajout du contrat de travail (fichier) sur la fiche salarié
ALTER TABLE "employees" ADD COLUMN "contract_file_url" TEXT;
ALTER TABLE "employees" ADD COLUMN "contract_file_name" TEXT;
