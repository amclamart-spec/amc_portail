const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const uploadsRoot = path.resolve(__dirname, '../../uploads');

function ensureUploadsDir(subDir) {
  const dir = path.join(uploadsRoot, subDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function parseBase64DataUri(base64) {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Fichier encodé en base64 invalide');
  }

  const match = base64.match(/^data:([a-zA-Z0-9+/.-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Format base64 non pris en charge');
  }

  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  return { mime, buffer };
}

function getExtensionForMimeType(mime) {
  switch (mime.toLowerCase()) {
    case 'application/pdf':
      return '.pdf';
    case 'image/png':
      return '.png';
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'application/msword':
      return '.doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return '.docx';
    case 'text/plain':
      return '.txt';
    default:
      return '.bin';
  }
}

function sanitizeFileName(filename) {
  if (!filename || typeof filename !== 'string') return 'file';
  return filename.replace(/[^a-zA-Z0-9_.()-]/g, '_').slice(0, 120);
}

function saveBase64File(base64, subDir, originalFilename) {
  const { mime, buffer } = parseBase64DataUri(base64);
  const extension = path.extname(originalFilename || '') || getExtensionForMimeType(mime);
  const safeBaseName = sanitizeFileName(path.basename(originalFilename || `file${extension}`));
  const filename = `${Date.now()}-${randomUUID()}${extension || path.extname(safeBaseName) || '.bin'}`;
  const dir = ensureUploadsDir(subDir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${subDir}/${filename}`;
}

module.exports = {
  saveBase64File,
};
