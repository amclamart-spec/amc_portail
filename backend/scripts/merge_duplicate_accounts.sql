-- ============================================================================
-- Fusionne 4 paires de comptes en double (même email, casse différente sur la
-- première lettre) : supprime le compte "professeur" créé par erreur avec une
-- casse différente, et attribue le rôle PROFESSEUR au compte principal (repéré
-- par l'email en minuscules), sans perdre les données du professeur (classes,
-- devoirs, séances Coran, etc.).
--
-- Reproduit en SQL pur la même logique que scripts/mergeDuplicateAccounts.js
-- (déjà testée) : on NE fait PAS un simple DELETE (qui mettrait à NULL le
-- professeur de ses classes via ON DELETE SET NULL sur classes.teacher_id, et
-- laisserait classes.teacher_user_id — un champ dénormalisé, pas une vraie
-- clé étrangère — pointer vers un compte supprimé). On re-pointe d'abord
-- TOUTES les tables qui référencent l'utilisateur vers le compte conservé,
-- puis seulement ensuite on supprime le compte devenu vide.
--
-- Sécurité :
--   - Tout est dans UNE SEULE transaction (BEGIN/COMMIT) : soit tout
--     s'applique, soit rien (erreur = ROLLBACK automatique).
--   - Pour chaque paire, si les deux comptes ont chacun un profil
--     Famille/Professeur/Salarié (vrai conflit de données, pas un doublon),
--     le script s'arrête en erreur au lieu d'écraser quoi que ce soit.
--   - Faites une sauvegarde de la base avant de lancer ceci sur la prod.
--
-- Usage :
--   psql "$DATABASE_URL" -f scripts/merge_duplicate_accounts.sql
-- (ou collez le contenu dans le client SQL de votre choix connecté à la base)
-- ============================================================================

BEGIN;

DO $$
DECLARE
  pairs text[][] := ARRAY[
    ARRAY['A.benltaief@orange.fr',  'a.benltaief@orange.fr'],
    ARRAY['Famille.yams@gmail.com', 'famille.yams@gmail.com'],
    ARRAY['Ghribsonia29@gmail.com', 'ghribsonia29@gmail.com'],
    ARRAY['Moiketty.gun@gmail.com', 'moiketty.gun@gmail.com']
  ];
  pair text[];
  loser_email text;
  survivor_email text;
  -- users.id est de type text (UUID généré côté Prisma, pas le type Postgres uuid)
  loser_id text;
  survivor_id text;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    loser_email := pair[1];
    survivor_email := pair[2];

    SELECT id INTO loser_id FROM users WHERE email = loser_email;
    SELECT id INTO survivor_id FROM users WHERE email = survivor_email;

    IF loser_id IS NULL THEN
      RAISE NOTICE 'Ignoré : compte "%" introuvable (déjà supprimé ?)', loser_email;
      CONTINUE;
    END IF;
    IF survivor_id IS NULL THEN
      RAISE EXCEPTION 'Compte principal "%" introuvable — abandon.', survivor_email;
    END IF;
    IF loser_id = survivor_id THEN
      RAISE EXCEPTION 'Les deux emails "%"/"%" pointent vers le même compte — abandon.', loser_email, survivor_email;
    END IF;

    RAISE NOTICE 'Fusion : % (%) -> % (%)', loser_email, loser_id, survivor_email, survivor_id;

    -- Vrai conflit de données (les deux comptes ont chacun un profil) : arrêt.
    IF EXISTS (SELECT 1 FROM families WHERE user_id = loser_id)
       AND EXISTS (SELECT 1 FROM families WHERE user_id = survivor_id) THEN
      RAISE EXCEPTION 'Conflit "famille" pour %/% — fusion manuelle requise.', loser_email, survivor_email;
    END IF;
    IF EXISTS (SELECT 1 FROM teachers WHERE user_id = loser_id)
       AND EXISTS (SELECT 1 FROM teachers WHERE user_id = survivor_id) THEN
      RAISE EXCEPTION 'Conflit "professeur" pour %/% — fusion manuelle requise.', loser_email, survivor_email;
    END IF;
    IF EXISTS (SELECT 1 FROM employees WHERE user_id = loser_id)
       AND EXISTS (SELECT 1 FROM employees WHERE user_id = survivor_id) THEN
      RAISE EXCEPTION 'Conflit "salarié" pour %/% — fusion manuelle requise.', loser_email, survivor_email;
    END IF;

    -- Re-pointage de toutes les tables référençant users.id (hors user_roles,
    -- traité séparément plus bas pour éviter un doublon sur la contrainte
    -- unique (user_id, role) et parce qu'elle cascade proprement à la
    -- suppression finale).
    UPDATE teachers                          SET user_id        = survivor_id WHERE user_id        = loser_id;
    UPDATE families                          SET user_id        = survivor_id WHERE user_id        = loser_id;
    UPDATE employees                         SET user_id        = survivor_id WHERE user_id        = loser_id;
    UPDATE chat_messages                     SET sender_id      = survivor_id WHERE sender_id      = loser_id;
    UPDATE chat_messages                     SET recipient_id   = survivor_id WHERE recipient_id   = loser_id;
    UPDATE payment_transactions              SET recorded_by_id = survivor_id WHERE recorded_by_id = loser_id;
    UPDATE refunds                           SET approved_by_id = survivor_id WHERE approved_by_id = loser_id;
    UPDATE refund_security_codes             SET generated_by   = survivor_id WHERE generated_by   = loser_id;
    UPDATE refund_security_codes             SET used_by        = survivor_id WHERE used_by        = loser_id;
    UPDATE social_beneficiaries              SET created_by     = survivor_id WHERE created_by     = loser_id;
    UPDATE social_beneficiary_documents      SET uploaded_by    = survivor_id WHERE uploaded_by    = loser_id;
    UPDATE social_cases                      SET created_by     = survivor_id WHERE created_by     = loser_id;
    UPDATE social_cases                      SET processed_by   = survivor_id WHERE processed_by   = loser_id;
    UPDATE case_decisions                    SET user_id        = survivor_id WHERE user_id        = loser_id;
    UPDATE stock_movements                   SET user_id        = survivor_id WHERE user_id        = loser_id;
    UPDATE distributions                     SET user_id        = survivor_id WHERE user_id        = loser_id;
    UPDATE social_collections                SET user_id        = survivor_id WHERE user_id        = loser_id;
    UPDATE purchases                         SET user_id        = survivor_id WHERE user_id        = loser_id;
    UPDATE social_budgets                    SET user_id        = survivor_id WHERE user_id        = loser_id;
    UPDATE volunteer_events                  SET created_by     = survivor_id WHERE created_by     = loser_id;
    UPDATE volunteer_groups                  SET created_by     = survivor_id WHERE created_by     = loser_id;
    UPDATE volunteer_group_members           SET volunteer_id   = survivor_id WHERE volunteer_id   = loser_id;
    UPDATE volunteer_event_participations    SET volunteer_id   = survivor_id WHERE volunteer_id   = loser_id;
    UPDATE volunteer_event_participations    SET validated_by   = survivor_id WHERE validated_by   = loser_id;
    UPDATE leave_requests                    SET decided_by     = survivor_id WHERE decided_by     = loser_id;
    UPDATE payslips                          SET uploaded_by    = survivor_id WHERE uploaded_by    = loser_id;
    UPDATE mail_logs                         SET sent_by_id     = survivor_id WHERE sent_by_id     = loser_id;
    UPDATE user_roles                        SET decided_by     = survivor_id WHERE decided_by     = loser_id;

    -- Champ dénormalisé (PAS une clé étrangère Prisma) : copie de l'id sur les
    -- classes du professeur, utilisée en repli dans les contrôles d'accès
    -- (classAccessUtils.js) — non couverte par les contraintes ci-dessus.
    UPDATE classes SET teacher_user_id = survivor_id WHERE teacher_user_id = loser_id;

    -- Rôle PROFESSEUR sur le compte conservé, seulement s'il ne l'a pas déjà
    -- (rôle principal ou rôle additionnel), pour ne pas violer la contrainte
    -- unique (user_id, role).
    INSERT INTO user_roles (id, user_id, role, status, created_at)
    SELECT gen_random_uuid()::text, survivor_id, 'PROFESSEUR', 'APPROVED', now()
    WHERE (SELECT role FROM users WHERE id = survivor_id) <> 'PROFESSEUR'
      AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = survivor_id AND role = 'PROFESSEUR');

    -- Suppression du compte absorbé, maintenant vide de toute donnée propre.
    -- Ses éventuelles lignes user_roles restantes disparaissent en cascade
    -- (ON DELETE CASCADE), sans risque puisqu'on ne les a pas ré-attribuées.
    DELETE FROM users WHERE id = loser_id;

    RAISE NOTICE '  -> OK, rôle PROFESSEUR actif sur %', survivor_email;
  END LOOP;
END $$;

COMMIT;
