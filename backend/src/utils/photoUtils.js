const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const uploadsRoot = path.resolve(__dirname, '../../uploads');
const studentUploadsDir = path.join(uploadsRoot, 'students');

function ensureStudentUploadsDir() {
  fs.mkdirSync(studentUploadsDir, { recursive: true });
}

function parseBase64Image(base64) {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Photo invalide');
  }

  const match = base64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Format d’image non pris en charge');
  }

  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  return { mime, buffer };
}

function getExtensionForMimeType(mime) {
  switch (mime.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'png';
  }
}

function savePhotoBase64(photoBase64) {
  ensureStudentUploadsDir();
  const { mime, buffer } = parseBase64Image(photoBase64);
  const extension = getExtensionForMimeType(mime);
  const filename = `${Date.now()}-${randomUUID()}.${extension}`;
  const destination = path.join(studentUploadsDir, filename);
  fs.writeFileSync(destination, buffer);
  return `/uploads/students/${filename}`;
}

function deletePhotoFile(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string' || !photoUrl.startsWith('/uploads/students/')) {
    return;
  }

  const relativePath = photoUrl.replace(/^\/uploads\//, '');
  const destination = path.join(uploadsRoot, relativePath);
  if (fs.existsSync(destination)) {
    try {
      fs.unlinkSync(destination);
    } catch (error) {
      console.warn(`Impossible de supprimer le fichier photo ${destination}:`, error);
    }
  }
}

module.exports = {
  savePhotoBase64,
  deletePhotoFile,
};
