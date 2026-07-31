const fs = require('fs');
const path = require('path');

const receiptsDir = path.join(__dirname, '../../uploads/purchase-receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

const MIME_EXTENSIONS = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

function getExtension(file) {
  return path.extname(file.originalname || '') || MIME_EXTENSIONS[file.mimetype] || '.bin';
}

function savePurchaseReceiptFile(purchaseId, file) {
  if (!file || !file.path) {
    throw new Error('Fichier de ticket invalide');
  }

  try {
    for (const existing of fs.readdirSync(receiptsDir)) {
      if (existing.startsWith(`${purchaseId}.`)) fs.unlinkSync(path.join(receiptsDir, existing));
    }
  } catch (error) {
    console.warn('Impossible de nettoyer l’ancien ticket de caisse:', error);
  }

  const filename = `${purchaseId}${getExtension(file)}`;
  const destination = path.join(receiptsDir, filename);
  fs.renameSync(file.path, destination);

  return {
    fileName: file.originalname || filename,
    relativePath: `/uploads/purchase-receipts/${filename}`,
  };
}

function deletePurchaseReceiptFile(relativePath) {
  if (!relativePath) return;
  const filePath = path.join(__dirname, '../..', relativePath);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn('Impossible de supprimer le ticket de caisse:', error);
  }
}

module.exports = { savePurchaseReceiptFile, deletePurchaseReceiptFile };
