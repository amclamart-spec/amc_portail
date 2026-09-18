// Fusionne deux comptes utilisateur qui ne diffèrent que par la casse de leur email
// (ex. "Ghribsonia29@gmail.com" vs "ghribsonia29@gmail.com") — bug historique : une
// contrainte unique Postgres standard sur `email` est sensible à la casse, donc les
// deux valeurs ont pu coexister avant que register()/login() (authController.js)
// soient corrigés pour comparer les emails de façon insensible à la casse. Résultat :
// deux comptes séparés pour la même personne, chacun avec un rôle différent, au lieu
// d'un seul compte avec plusieurs rôles (mécanisme déjà supporté par le modèle
// UserRole — voir "Mes rôles").
//
// Le script :
//   1. Retrouve tous les comptes partageant le même email (comparaison insensible à
//      la casse).
//   2. Choisit automatiquement lequel conserver ("survivor") et lequel absorber
//      ("loser") — par défaut celui qui a un profil Famille (généralement le compte
//      d'origine, avec le plus de données rattachées), sinon le plus ancien. Peut être
//      forcé avec --survivor=<userId>.
//   3. Redécouvre dynamiquement (via le DMMF Prisma) TOUTES les clés étrangères du
//      schéma qui pointent vers User.id, pour ne rien oublier même si le schéma
//      évolue, et les re-pointe du compte absorbé vers le compte conservé.
//   4. Cas particulier : `Class.teacherUserId` est un champ dénormalisé (copie de
//      l'id, pas une vraie relation Prisma) utilisé comme repli dans les contrôles
//      d'accès professeur — non détecté par le scan générique, donc traité à part.
//   5. Fusionne les rôles (rôle principal + rôles additionnels approuvés) sur le
//      compte conservé via UserRole, normalise son email en minuscules, puis
//      supprime le compte absorbé (ses UserRole restantes sont alors supprimées en
//      cascade par le schéma, sans risque de doublon avec celles déjà fusionnées).
//   6. Tout est exécuté dans une seule transaction : soit tout est appliqué, soit rien
//      ne l'est (ex. si un conflit imprévu — contrainte unique sur une relation
//      métier partagée par les deux comptes — apparaît, la transaction échoue
//      proprement et aucune donnée n'est modifiée).
//
// Sécurité : par défaut le script tourne en mode "dry run" (aucune écriture, juste un
// rapport de ce qui serait fait). Ajouter --apply pour exécuter réellement la fusion.
// Si les deux comptes ont chacun un profil Famille/Professeur/Salarié (vrai conflit de
// données, pas juste un doublon), le script s'arrête sans rien faire : ce cas demande
// une décision humaine.
//
// Usage (pointer DATABASE_URL vers la base ciblée avant de lancer) :
//   node scripts/mergeDuplicateAccounts.js <email>                    # dry run
//   node scripts/mergeDuplicateAccounts.js <email> --apply            # applique
//   node scripts/mergeDuplicateAccounts.js <email> --survivor=<id> --apply

const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

// Champ à traiter à part : dénormalisé, pas une relation Prisma déclarée (voir en-tête).
const MANUAL_FK_FIELDS = [{ model: 'Class', fk: 'teacherUserId' }];

// UserRole.userId est volontairement exclu du scan générique : la relation porte
// `onDelete: Cascade`, et la re-pointer aveuglément risquerait en plus une violation
// de la contrainte @@unique([userId, role]) si les deux comptes partagent déjà le
// même rôle additionnel. Les rôles du compte absorbé sont fusionnés séparément
// (voir plus bas), puis ses lignes UserRole restantes disparaissent avec lui.
const EXCLUDED_FK_FIELDS = [{ model: 'UserRole', fk: 'userId' }];

function discoverUserForeignKeys() {
  const fields = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (field.kind === 'object' && field.type === 'User' && field.relationFromFields?.length) {
        fields.push({ model: model.name, fk: field.relationFromFields[0] });
      }
    }
  }
  const isExcluded = (f) => EXCLUDED_FK_FIELDS.some((x) => x.model === f.model && x.fk === f.fk);
  return [...fields.filter((f) => !isExcluded(f)), ...MANUAL_FK_FIELDS];
}

const clientNameFor = (modelName) => modelName.charAt(0).toLowerCase() + modelName.slice(1);

async function main() {
  const email = process.argv[2];
  const apply = process.argv.includes('--apply');
  const survivorArg = process.argv.find((a) => a.startsWith('--survivor='));
  const forcedSurvivorId = survivorArg ? survivorArg.split('=')[1] : null;

  if (!email) {
    console.error('Usage: node scripts/mergeDuplicateAccounts.js <email> [--survivor=<userId>] [--apply]');
    process.exitCode = 1;
    return;
  }

  const users = await prisma.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { family: true, teacherProfile: true, employeeProfile: true, additionalRoles: true },
    orderBy: { createdAt: 'asc' },
  });

  if (users.length < 2) {
    console.log(`Trouvé ${users.length} compte(s) pour "${email}" — rien à fusionner.`);
    return;
  }
  if (users.length > 2) {
    console.error(`${users.length} comptes trouvés pour "${email}" — ce script ne fusionne que 2 comptes à la fois. Relancez-le par paires (ex. avec --survivor pour fixer le premier pivot).`);
    process.exitCode = 1;
    return;
  }

  console.log(`Comptes trouvés pour "${email}" :`);
  users.forEach((u) => {
    console.log(`  - ${u.id} | email="${u.email}" | role=${u.role} | famille=${!!u.family} | professeur=${!!u.teacherProfile} | salarié=${!!u.employeeProfile} | rôles additionnels=${u.additionalRoles.map((r) => r.role).join(', ') || '-'} | créé le ${u.createdAt.toISOString()}`);
  });

  let survivor;
  let loser;
  if (forcedSurvivorId) {
    survivor = users.find((u) => u.id === forcedSurvivorId);
    if (!survivor) {
      console.error(`--survivor=${forcedSurvivorId} ne correspond à aucun des comptes trouvés ci-dessus.`);
      process.exitCode = 1;
      return;
    }
    loser = users.find((u) => u.id !== forcedSurvivorId);
  } else {
    survivor = users.find((u) => u.family) || users[0];
    loser = users.find((u) => u.id !== survivor.id);
  }

  console.log(`\nCompte conservé (survivor) : ${survivor.id} (${survivor.email})`);
  console.log(`Compte absorbé  (loser)    : ${loser.id} (${loser.email})`);

  const oneToOneConflicts = ['family', 'teacherProfile', 'employeeProfile'].filter((rel) => survivor[rel] && loser[rel]);
  if (oneToOneConflicts.length > 0) {
    console.error(`\nConflit : les deux comptes ont chacun un profil "${oneToOneConflicts.join(', ')}" — ce n'est pas un simple doublon, une fusion manuelle est nécessaire pour ce(s) profil(s). Arrêt sans modification.`);
    process.exitCode = 1;
    return;
  }

  const fkFields = discoverUserForeignKeys();

  console.log('\nLignes qui seraient re-pointées du compte absorbé vers le compte conservé :');
  const nonEmpty = [];
  for (const { model, fk } of fkFields) {
    const count = await prisma[clientNameFor(model)].count({ where: { [fk]: loser.id } });
    if (count > 0) nonEmpty.push({ model, fk, count });
  }
  if (nonEmpty.length === 0) console.log('  (aucune)');
  else nonEmpty.forEach((c) => console.log(`  - ${c.model}.${c.fk} : ${c.count} ligne(s)`));

  const survivorRoles = new Set([survivor.role, ...survivor.additionalRoles.map((r) => r.role)]);
  const rolesToAdd = [];
  if (!survivorRoles.has(loser.role)) rolesToAdd.push(loser.role);
  loser.additionalRoles.forEach((r) => {
    if (!survivorRoles.has(r.role) && !rolesToAdd.includes(r.role)) rolesToAdd.push(r.role);
  });
  console.log(`\nRôle(s) additionnel(s) à donner au compte conservé : ${rolesToAdd.length ? rolesToAdd.join(', ') : '(aucun, déjà présents)'}`);

  const normalizedEmail = survivor.email.trim().toLowerCase();
  if (normalizedEmail !== survivor.email) {
    console.log(`Email du compte conservé normalisé en minuscules : "${survivor.email}" → "${normalizedEmail}"`);
  }

  if (!apply) {
    console.log('\n[DRY RUN] Aucune modification effectuée — relancez avec --apply pour exécuter la fusion.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const { model, fk } of fkFields) {
      await tx[clientNameFor(model)].updateMany({ where: { [fk]: loser.id }, data: { [fk]: survivor.id } });
    }

    for (const role of rolesToAdd) {
      await tx.userRole.upsert({
        where: { userId_role: { userId: survivor.id, role } },
        update: { status: 'APPROVED' },
        create: { userId: survivor.id, role, status: 'APPROVED' },
      });
    }

    // Le compte absorbé est supprimé AVANT de normaliser l'email du compte conservé :
    // tant que le compte absorbé existe encore, il peut porter exactement la valeur
    // en minuscules (ex. "loser" = "testdup29@..." déjà), ce qui ferait échouer la
    // mise à jour du survivor sur la contrainte unique (email).
    // Cascade sur UserRole (onDelete: Cascade) pour les rôles additionnels restés
    // attachés au compte absorbé.
    await tx.user.delete({ where: { id: loser.id } });

    if (normalizedEmail !== survivor.email) {
      await tx.user.update({ where: { id: survivor.id }, data: { email: normalizedEmail } });
    }
  });

  console.log('\n✅ Fusion effectuée avec succès.');
}

main()
  .catch((error) => {
    console.error('Erreur lors de la fusion :', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
