const fs = require('fs');
const path = require('path');

const payslipsDir = path.join(__dirname, '../../uploads/payslips');
if (!fs.existsSync(payslipsDir)) {
  fs.mkdirSync(payslipsDir, { recursive: true });
}

const MIME_EXTENSIONS = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

function getExtension(file) {
  return path.extname(file.originalname || '') || MIME_EXTENSIONS[file.mimetype] || '.bin';
}

function savePayslipFile(employeeId, period, file) {
  if (!file || !file.path) {
    throw new Error('Fichier de fiche de paie invalide');
  }

  const safePeriod = String(period).replace(/[^0-9A-Za-z-]/g, '');
  const prefix = `${employeeId}-${safePeriod}`;

  try {
    for (const existing of fs.readdirSync(payslipsDir)) {
      if (existing.startsWith(`${prefix}.`)) fs.unlinkSync(path.join(payslipsDir, existing));
    }
  } catch (error) {
    console.warn('Impossible de nettoyer l’ancienne fiche de paie:', error);
  }

  const filename = `${prefix}${getExtension(file)}`;
  const destination = path.join(payslipsDir, filename);
  fs.renameSync(file.path, destination);

  return {
    fileName: file.originalname || filename,
    relativePath: `/uploads/payslips/${filename}`,
  };
}

function deletePayslipFile(relativePath) {
  if (!relativePath) return;
  const filePath = path.join(__dirname, '../..', relativePath);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn('Impossible de supprimer la fiche de paie:', error);
  }
}

module.exports = { savePayslipFile, deletePayslipFile };
