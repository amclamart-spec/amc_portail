-- Adresse email secondaire par famille : toutes les notifications automatiques
-- envoyées à la famille (absences/présences, mailing admin, paiements...) partent
-- aussi vers cette adresse quand elle est renseignée, en plus de l'email du compte.
ALTER TABLE "families" ADD COLUMN "email_secondary" TEXT;
