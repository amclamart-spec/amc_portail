// Corrige la casse Nom/Prénom des lignes déjà existantes (Nom en MAJUSCULES, Prénom
// avec seulement la première lettre en majuscule), pour tous les profils du portail.
// Complète le middleware Prisma (src/lib/prismaNameMiddleware.js) qui ne s'applique
// qu'aux nouvelles écritures — ce script traite les données déjà en base.
//
// Idempotent : relancer ce script sur des données déjà corrigées ne modifie rien.
//
// Usage (pointer DATABASE_URL vers la base ciblée avant de lancer) :
//   node scripts/backfillNameCase.js

const { PrismaClient } = require('@prisma/client');
const { formatLastName, formatFirstName } = require('../src/utils/nameCase');

const prisma = new PrismaClient();

const MODELS = ['user', 'parent', 'student', 'teacher', 'emergencyContact', 'socialBeneficiary'];

(async () => {
  const summary = {};
  for (const model of MODELS) {
    const rows = await prisma[model].findMany({ select: { id: true, firstName: true, lastName: true } });
    let changed = 0;
    for (const row of rows) {
      const newFirst = formatFirstName(row.firstName);
      const newLast = formatLastName(row.lastName);
      if (newFirst !== row.firstName || newLast !== row.lastName) {
        await prisma[model].update({ where: { id: row.id }, data: { firstName: newFirst, lastName: newLast } });
        changed += 1;
      }
    }
    summary[model] = { total: rows.length, changed };
  }
  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
})();
