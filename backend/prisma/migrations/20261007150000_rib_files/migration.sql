-- RIB des paiements par prélèvement/virement stockés en base : les fichiers écrits
-- dans uploads/ sont perdus à chaque redéploiement/redémarrage en production.
CREATE TABLE "rib_files" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rib_files_pkey" PRIMARY KEY ("id")
);
