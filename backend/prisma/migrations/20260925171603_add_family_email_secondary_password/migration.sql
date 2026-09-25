-- Mot de passe dédié à l'email secondaire d'une famille (indépendant du mot de
-- passe du compte, utilisé par l'email principal) — généré par un admin et envoyé
-- par email ; la connexion via l'email secondaire est refusée tant qu'il est nul.
ALTER TABLE "families" ADD COLUMN "email_secondary_password_hash" TEXT;
