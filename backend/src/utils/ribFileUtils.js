const { PrismaClient } = require('@prisma/client');
const { parseBase64DataUri } = require('./fileUtils');

const prisma = new PrismaClient();

// Enregistre en base le RIB envoyé par le formulaire ({ name, base64 } en data URI)
// et renvoie les champs à fusionner dans Payment.metadata. bankDebitRibUrl est
// conservé (affichage du lien côté admin/trésorier) mais pointe désormais vers la
// route authentifiée /rib-files/:id et non plus vers un fichier de uploads/.
async function storeRibDocument(ribDocument) {
  const fileName = String(ribDocument.name || 'rib.pdf').trim() || 'rib.pdf';
  const { mime, buffer } = parseBase64DataUri(ribDocument.base64);

  const ribFile = await prisma.ribFile.create({
    data: { fileName: fileName.slice(0, 200), mimeType: mime, size: buffer.length, data: buffer },
    select: { id: true },
  });

  return {
    bankDebitRibFileId: ribFile.id,
    bankDebitRibUrl: `/rib-files/${ribFile.id}`,
    bankDebitRibFilename: fileName,
  };
}

module.exports = { storeRibDocument };
