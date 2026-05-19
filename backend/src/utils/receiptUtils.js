const fs = require('fs');
const path = require('path');

const receiptsDir = path.join(__dirname, '../../uploads/receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

function normalizeReceiptFilename(paymentId) {
  return `recu-${paymentId}.pdf`;
}

function getReceiptFilePath(paymentId) {
  return path.join(receiptsDir, normalizeReceiptFilename(paymentId));
}

function getReceiptRelativePath(paymentId) {
  return `/uploads/receipts/${normalizeReceiptFilename(paymentId)}`;
}

function getReceiptInfo(paymentId) {
  const filePath = getReceiptFilePath(paymentId);
  if (!fs.existsSync(filePath)) return null;

  return {
    filePath,
    filename: normalizeReceiptFilename(paymentId),
    relativePath: getReceiptRelativePath(paymentId),
  };
}

function saveReceiptFile(paymentId, file) {
  if (!file || !file.path) {
    throw new Error('Fichier de reçu invalide');
  }

  const destination = getReceiptFilePath(paymentId);
  try {
    if (fs.existsSync(destination)) {
      fs.unlinkSync(destination);
    }
  } catch (error) {
    console.warn('Impossible de supprimer l’ancien reçu:', error);
  }

  fs.renameSync(file.path, destination);

  return {
    filePath: destination,
    filename: normalizeReceiptFilename(paymentId),
    relativePath: getReceiptRelativePath(paymentId),
  };
}

function deleteReceiptFile(paymentId) {
  const filePath = getReceiptFilePath(paymentId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (error) {
    console.error(`Impossible de supprimer le reçu ${paymentId}:`, error);
  }
  return false;
}

module.exports = {
  getReceiptFilePath,
  getReceiptRelativePath,
  getReceiptInfo,
  saveReceiptFile,
  deleteReceiptFile,
};