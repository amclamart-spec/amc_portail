/* eslint-disable no-console */
// Récupération des RIB de production enregistrés dans uploads/ribs (avant leur
// stockage en base, cf. migration 20261007150000_rib_files).
//
// Le serveur de production (Render, sans disque persistant) efface uploads/ à chaque
// redéploiement/redémarrage/mise en veille : seuls les RIB encore présents sur
// l'instance en cours d'exécution peuvent être récupérés. D'où deux étapes :
//
// 1. AVANT de déployer la correction (le déploiement redémarre le serveur) :
//      DATABASE_URL="<url base prod>" node scripts/recoverProdRibs.js download
//    -> lit (sans rien modifier) les paiements ayant un bankDebitRibUrl, télécharge
//       chaque fichier encore servi par l'API de prod dans ./rib-recovery/ et écrit
//       ./rib-recovery/manifest.json.
//
// 2. APRÈS le déploiement (table rib_files créée en prod) :
//      DATABASE_URL="<url base prod>" node scripts/recoverProdRibs.js import
//    -> enregistre les fichiers récupérés dans rib_files et met à jour la metadata
//       des paiements/transactions concernés. Réexécutable sans doublon.
//
// Variable optionnelle : PROD_API_ORIGIN (défaut https://amc-portail-api.onrender.com).

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const API_ORIGIN = (process.env.PROD_API_ORIGIN || 'https://amc-portail-api.onrender.com').replace(/\/$/, '');
const OUT_DIR = path.resolve(process.cwd(), 'rib-recovery');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const TABLES = ['payments', 'payment_transactions'];

async function download() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];

  for (const table of TABLES) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, metadata->>'bankDebitRibUrl' AS url, metadata->>'bankDebitRibFilename' AS filename
       FROM ${table}
       WHERE metadata->>'bankDebitRibUrl' LIKE '/uploads/%' AND metadata->>'bankDebitRibFileId' IS NULL`,
    );
    for (const row of rows) {
      const entry = { table, id: row.id, url: row.url, filename: row.filename || 'RIB.pdf', file: null, mimeType: null, status: null };
      try {
        const response = await fetch(`${API_ORIGIN}${row.url}`);
        entry.status = response.status;
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          entry.file = `${table}-${row.id}${path.extname(row.url) || '.bin'}`;
          entry.mimeType = (response.headers.get('content-type') || 'application/octet-stream').split(';')[0];
          fs.writeFileSync(path.join(OUT_DIR, entry.file), buffer);
        }
      } catch (error) {
        entry.status = `erreur: ${error.message}`;
      }
      manifest.push(entry);
      console.log(`${entry.file ? 'RÉCUPÉRÉ' : 'PERDU   '}  ${table} ${row.id}  ${row.filename || ''}  (${entry.status})`);
    }
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  const recovered = manifest.filter((e) => e.file).length;
  console.log(`\n${recovered} RIB récupéré(s), ${manifest.length - recovered} perdu(s) sur ${manifest.length}. Manifeste : ${MANIFEST}`);
}

async function importFiles() {
  if (!fs.existsSync(MANIFEST)) throw new Error(`Manifeste introuvable (${MANIFEST}) : lancez d'abord l'étape "download".`);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  // Un même fichier est souvent référencé à la fois par le paiement et sa transaction.
  const fileIdByUrl = new Map();
  let updated = 0;

  for (const entry of manifest.filter((e) => e.file)) {
    const [current] = await prisma.$queryRawUnsafe(
      `SELECT metadata->>'bankDebitRibFileId' AS "fileId" FROM ${entry.table} WHERE id = $1`, entry.id,
    );
    if (!current || current.fileId) continue;

    let fileId = fileIdByUrl.get(entry.url);
    if (!fileId) {
      const data = fs.readFileSync(path.join(OUT_DIR, entry.file));
      const ribFile = await prisma.ribFile.create({
        data: { fileName: entry.filename.slice(0, 200), mimeType: entry.mimeType, size: data.length, data },
        select: { id: true },
      });
      fileId = ribFile.id;
      fileIdByUrl.set(entry.url, fileId);
    }

    const patch = { bankDebitRibFileId: fileId, bankDebitRibUrl: `/rib-files/${fileId}`, bankDebitRibFilename: entry.filename };
    await prisma.$executeRawUnsafe(
      `UPDATE ${entry.table} SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
      JSON.stringify(patch), entry.id,
    );
    updated += 1;
    console.log(`IMPORTÉ  ${entry.table} ${entry.id}  ${entry.filename}`);
  }
  console.log(`\n${updated} ligne(s) mise(s) à jour.`);
}

const command = process.argv[2];
const run = command === 'download' ? download : command === 'import' ? importFiles : null;
if (!run) {
  console.error('Usage : node scripts/recoverProdRibs.js download|import');
  process.exit(1);
}
run()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
