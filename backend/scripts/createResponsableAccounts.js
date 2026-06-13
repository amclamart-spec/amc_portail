/**
 * Script de création des 4 comptes responsables de pôle
 * Usage : node backend/scripts/createResponsableAccounts.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const ACCOUNTS = [
  {
    role:      'RESPONSABLE_POLE_CORAN',
    email:     'responsable.coran@amc-lamart.fr',
    firstName: 'Responsable',
    lastName:  'Coran',
    password:  'Amc@Coran2025',
  },
  {
    role:      'RESPONSABLE_POLE_ARABE',
    email:     'responsable.arabe@amc-lamart.fr',
    firstName: 'Responsable',
    lastName:  'Arabe',
    password:  'Amc@Arabe2025',
  },
  {
    role:      'RESPONSABLE_POLE_SOUTIEN_SCO',
    email:     'responsable.soutien@amc-lamart.fr',
    firstName: 'Responsable',
    lastName:  'Soutien Scolaire',
    password:  'Amc@Soutien2025',
  },
  {
    role:      'RESPONSABLE_POLE_SCIENCE_IS',
    email:     'responsable.sciences@amc-lamart.fr',
    firstName: 'Responsable',
    lastName:  'Sciences Islamiques',
    password:  'Amc@Sciences2025',
  },
];

async function main() {
  console.log('Création des comptes responsables de pôle...\n');

  for (const account of ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    if (existing) {
      console.log(`[SKIP] ${account.email} existe déjà (rôle: ${existing.role})`);
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, 12);
    const user = await prisma.user.create({
      data: {
        email:            account.email,
        firstName:        account.firstName,
        lastName:         account.lastName,
        role:             account.role,
        passwordHash,
        emailVerified:    true,
        validationStatus: 'APPROVED',
      },
    });

    console.log(`[OK] Compte créé :`);
    console.log(`     Email    : ${user.email}`);
    console.log(`     Rôle     : ${user.role}`);
    console.log(`     Mot de passe : ${account.password}`);
    console.log('');
  }

  console.log('Terminé. Changez les mots de passe après la première connexion.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
