const fs = require('fs');
const path = require('path');

const contractsDir = path.join(__dirname, '../../uploads/contracts');
if (!fs.existsSync(contractsDir)) {
  fs.mkdirSync(contractsDir, { recursive: true });
}

const MIME_EXTENSIONS = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

function getExtension(file) {
  return path.extname(file.originalname || '') || MIME_EXTENSIONS[file.mimetype] || '.bin';
}

function saveContractFile(employeeId, file) {
  if (!file || !file.path) {
    throw new Error('Fichier de contrat invalide');
  }

  try {
    for (const existing of fs.readdirSync(contractsDir)) {
      if (existing.startsWith(`${employeeId}.`)) fs.unlinkSync(path.join(contractsDir, existing));
    }
  } catch (error) {
    console.warn('Impossible de nettoyer l’ancien contrat:', error);
  }

  const filename = `${employeeId}${getExtension(file)}`;
  const destination = path.join(contractsDir, filename);
  fs.renameSync(file.path, destination);

  return {
    fileName: file.originalname || filename,
    relativePath: `/uploads/contracts/${filename}`,
  };
}

function deleteContractFile(relativePath) {
  if (!relativePath) return;
  const filePath = path.join(__dirname, '../..', relativePath);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn('Impossible de supprimer le contrat:', error);
  }
}

module.exports = { saveContractFile, deleteContractFile };
