-- Équivalent SQL de scripts/backfillNameCase.js, pour exécution directe via pgAdmin
-- (Query Tool) sur la base de production. Corrige la casse Nom/Prénom des lignes déjà
-- existantes : Nom en MAJUSCULES, Prénom avec uniquement la première lettre en
-- majuscule. Idempotent — relancer ce script sur des données déjà corrigées ne
-- change rien.

UPDATE "users" SET
  "last_name" = UPPER(TRIM("last_name")),
  "first_name" = UPPER(LEFT(TRIM("first_name"), 1)) || LOWER(SUBSTRING(TRIM("first_name") FROM 2));

UPDATE "parents" SET
  "last_name" = UPPER(TRIM("last_name")),
  "first_name" = UPPER(LEFT(TRIM("first_name"), 1)) || LOWER(SUBSTRING(TRIM("first_name") FROM 2));

UPDATE "students" SET
  "last_name" = UPPER(TRIM("last_name")),
  "first_name" = UPPER(LEFT(TRIM("first_name"), 1)) || LOWER(SUBSTRING(TRIM("first_name") FROM 2));

UPDATE "teachers" SET
  "last_name" = UPPER(TRIM("last_name")),
  "first_name" = UPPER(LEFT(TRIM("first_name"), 1)) || LOWER(SUBSTRING(TRIM("first_name") FROM 2));

UPDATE "emergency_contacts" SET
  "last_name" = UPPER(TRIM("last_name")),
  "first_name" = UPPER(LEFT(TRIM("first_name"), 1)) || LOWER(SUBSTRING(TRIM("first_name") FROM 2));

UPDATE "social_beneficiaries" SET
  "last_name" = UPPER(TRIM("last_name")),
  "first_name" = UPPER(LEFT(TRIM("first_name"), 1)) || LOWER(SUBSTRING(TRIM("first_name") FROM 2));
