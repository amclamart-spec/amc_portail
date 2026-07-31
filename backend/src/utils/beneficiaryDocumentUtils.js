const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const docsDir = path.join(__dirname, '../../uploads/social-documents');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

function saveBeneficiaryDocumentFile(beneficiaryId, file) {
  if (!file || !file.path) {
    throw new Error('Fichier invalide');
  }

  const ext = path.extname(file.originalname || '') || '.bin';
  const filename = `${beneficiaryId}-${Date.now()}-${randomUUID()}${ext}`;
  const destination = path.join(docsDir, filename);
  fs.renameSync(file.path, destination);

  return {
    filePath: destination,
    fileName: file.originalname || filename,
    relativePath: `/uploads/social-documents/${filename}`,
  };
}

function deleteBeneficiaryDocumentFile(relativePath) {
  if (!relativePath) return;
  const filePath = path.join(__dirname, '../..', relativePath);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn('Impossible de supprimer le document bénéficiaire:', error);
  }
}

module.exports = { saveBeneficiaryDocumentFile, deleteBeneficiaryDocumentFile };
