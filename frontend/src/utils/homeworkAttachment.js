import toast from 'react-hot-toast';
import api from '../api/axios';

// Pièce jointe d'un devoir : téléchargée via l'API (avec la session), le fichier
// étant stocké en base — un lien direct /uploads/... pointait vers le site frontend
// et non vers le serveur API. `endpoint` dépend de l'espace (professeur ou famille).
export async function downloadHomeworkAttachment(event, endpoint, fileName) {
  event?.preventDefault();
  try {
    const { data } = await api.get(endpoint, { responseType: 'blob' });
    const objectUrl = window.URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName || 'piece-jointe';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(objectUrl);
  } catch (error) {
    // Avec responseType 'blob', le message d'erreur JSON du serveur arrive sous forme de Blob.
    let message = 'Impossible d\'ouvrir cette pièce jointe';
    try {
      const body = JSON.parse(await error.response?.data?.text());
      if (body?.error) message = body.error;
    } catch { /* message par défaut */ }
    toast.error(message);
  }
}
