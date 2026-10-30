import toast from 'react-hot-toast';
import api from '../api/axios';

// Justificatif d'absence : les documents récents sont stockés en base et servis par
// l'API (/absence-documents/:id, avec la session) ; les anciens pointent vers un
// fichier de uploads/ sur le serveur API (et non sur le site frontend), qui a pu
// disparaître lors d'un redémarrage du serveur de production.
export async function openAbsenceDocument(event, doc) {
  event.preventDefault();
  const fileUrl = doc.fileUrl || '';
  if (!fileUrl.startsWith('/absence-documents/')) {
    const apiOrigin = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
    window.open(/^https?:\/\//i.test(fileUrl) ? fileUrl : `${apiOrigin}${fileUrl}`, '_blank', 'noopener');
    return;
  }
  try {
    const { data } = await api.get(fileUrl, { responseType: 'blob' });
    const objectUrl = window.URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = doc.fileName || 'justificatif';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(objectUrl);
  } catch {
    toast.error('Impossible d\'ouvrir ce document');
  }
}
