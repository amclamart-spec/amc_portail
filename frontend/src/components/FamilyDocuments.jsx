import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiDownload, FiPaperclip, FiTrash2 } from 'react-icons/fi';
import api from '../api/axios';
import { saveFile } from '../utils/native';

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const formatFileSize = (bytes) => (bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  : `${Math.max(1, Math.round(bytes / 1024))} Ko`);

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

// Le serveur renvoie ses erreurs en JSON, même pour une requête attendue en blob.
async function readBlobError(error, fallback) {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).error || fallback; } catch { return fallback; }
  }
  return data?.error || fallback;
}

// Pièces jointes de la fiche famille (fiche famille et détail d'inscription admin).
// Tous les boutons sont en type="button" : le composant peut être placé dans un formulaire.
export default function FamilyDocuments({ familyId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const inputRef = useRef(null);

  async function loadDocuments() {
    try {
      const { data } = await api.get(`/admin/families/${familyId}/documents`);
      setDocuments(data.documents || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Impossible de charger les documents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!familyId) return;
    setLoading(true);
    loadDocuments();
  }, [familyId]);

  async function uploadDocuments(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    files
      .filter((file) => file.size > MAX_DOCUMENT_BYTES)
      .forEach((file) => toast.error(`« ${file.name} » dépasse 5 Mo`));
    const toUpload = files.filter((file) => file.size <= MAX_DOCUMENT_BYTES);
    if (!toUpload.length) return;

    setUploading(true);
    let added = 0;
    for (const file of toUpload) {
      try {
        const contentBase64 = await readFileAsBase64(file);
        await api.post(`/admin/families/${familyId}/documents`, { fileName: file.name, contentBase64 });
        added += 1;
      } catch (error) {
        toast.error(error?.response?.data?.error || `Échec de l'envoi de « ${file.name} »`);
      }
    }
    setUploading(false);
    if (added) {
      toast.success(added > 1 ? `${added} documents ajoutés` : 'Document ajouté');
      loadDocuments();
    }
  }

  async function downloadDocument(doc) {
    try {
      setDownloading(doc.id);
      const response = await api.get(`/admin/families/${familyId}/documents/${doc.id}`, { responseType: 'blob' });
      await saveFile(response.data, doc.fileName);
    } catch (error) {
      toast.error(await readBlobError(error, 'Erreur lors du téléchargement du document'));
    } finally {
      setDownloading(null);
    }
  }

  async function deleteDocument(doc) {
    if (!window.confirm(`Supprimer le document « ${doc.fileName} » ?`)) return;
    try {
      await api.delete(`/admin/families/${familyId}/documents/${doc.id}`);
      toast.success('Document supprimé');
      loadDocuments();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur suppression document');
    }
  }

  if (!familyId) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: '#6B7280' }}>Un ou plusieurs fichiers, 5 Mo maximum chacun.</span>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <FiPaperclip size={14} /> {uploading ? 'Envoi en cours...' : 'Ajouter des documents'}
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={uploadDocuments} />
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Fichier</th><th>Taille</th><th>Ajouté le</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', color: '#6B7280' }}>Chargement...</td></tr>
            ) : documents.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', color: '#6B7280' }}>Aucun document</td></tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id}>
                  <td style={{ wordBreak: 'break-word' }}>{doc.fileName}</td>
                  <td>{formatFileSize(doc.size)}</td>
                  <td>
                    {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                    {doc.uploadedBy && ` — ${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`}
                  </td>
                  <td>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => downloadDocument(doc)}
                      disabled={downloading === doc.id}
                      title="Télécharger"
                    >
                      <FiDownload size={14} /> {downloading === doc.id ? '...' : 'Ouvrir'}
                    </button>{' '}
                    <button className="btn btn-danger btn-sm" type="button" onClick={() => deleteDocument(doc)} title="Supprimer">
                      <FiTrash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
