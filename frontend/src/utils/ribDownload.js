import toast from 'react-hot-toast';
import api from '../api/axios';
import { saveFile } from './native';

const resolveUploadUrl = (url) => {
  if (/^https?:\/\//i.test(url)) return url;
  const base = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${prefix}${url.startsWith('/') ? '' : '/'}${url}`;
};

// RIB d'un paiement par prélèvement/virement. Les RIB récents sont stockés en base
// (metadata.bankDebitRibFileId, route authentifiée /rib-files/:id) ; les anciens
// pointent vers un fichier de uploads/ que le serveur de production a pu perdre
// lors d'un redémarrage — dans ce cas, message explicite plutôt qu'une erreur vague.
export async function downloadRib({ ribFileId, ribUrl, filename }) {
  try {
    if (ribFileId) {
      const { data } = await api.get(`/rib-files/${ribFileId}`, { responseType: 'blob' });
      await saveFile(data, filename || 'rib.pdf');
    } else {
      if (!ribUrl) throw new Error('URL RIB invalide');
      const response = await fetch(resolveUploadUrl(ribUrl), { method: 'GET' });
      if (response.status === 404) {
        toast.error('Ce RIB a été enregistré avant la correction du stockage et le fichier n\'est plus disponible sur le serveur. Merci de le téléverser à nouveau en modifiant le paiement.', { duration: 8000 });
        return;
      }
      if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
      await saveFile(await response.blob(), filename || 'rib.pdf');
    }
    toast.success('Téléchargement du RIB en cours...');
  } catch (err) {
    console.error('Erreur téléchargement RIB', err);
    toast.error('Impossible de télécharger le RIB');
  }
}
