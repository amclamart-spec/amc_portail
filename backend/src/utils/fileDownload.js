const path = require('path');

const MIME_BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.txt': 'text/plain',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

function mimeTypeFromFileName(fileName) {
  return MIME_BY_EXTENSION[path.extname(String(fileName || '')).toLowerCase()] || 'application/octet-stream';
}

// Envoie un fichier stocké en base en téléchargement (nom UTF-8 conservé).
function sendFileBuffer(res, { fileName, mimeType, data }) {
  const asciiName = fileName.replace(/[^ -~]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', data.length);
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(data);
}

module.exports = { mimeTypeFromFileName, sendFileBuffer };
