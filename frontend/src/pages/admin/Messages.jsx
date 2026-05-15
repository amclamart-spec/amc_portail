import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

export default function AdminMessages() {
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  async function loadMessages(page = pagination.page) {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/messages', { params: { page, limit: pagination.limit } });
      setMessages(data.messages || []);
      setPagination({ page: data.page, limit: data.limit, total: data.total });
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Impossible de charger les messages');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages(1);
  }, []);

  async function openDetails(messageId) {
    try {
      const { data } = await api.get(`/admin/messages/${messageId}`);
      setSelectedMessage(data.message);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Impossible de charger le détail');
    }
  }

  const totalPages = Math.max(Math.ceil((pagination.total || 0) / (pagination.limit || 1)), 1);

  return (
    <div>
      <div className="flex-between mb-2">
        <h2 style={{ color: 'var(--amc-primary)' }}>Messages envoyés</h2>
        <button className="btn btn-outline" onClick={() => loadMessages(pagination.page)}>Actualiser</button>
      </div>

      <div className="card">
        <div className="card-header"><h3>Historique</h3></div>
        {loading ? (
          <p>Chargement...</p>
        ) : messages.length === 0 ? (
          <p style={{ color: '#6B7280' }}>Aucun message envoyé.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sujet</th>
                  <th>Type destinataires</th>
                  <th>Volume</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((message) => (
                  <tr key={message.id}>
                    <td>{message.sentAt ? new Date(message.sentAt).toLocaleString('fr-FR') : '—'}</td>
                    <td>{message.subject}</td>
                    <td>{message.recipientType}</td>
                    <td>{message.successCount || 0}/{message.recipientsCount || 0}</td>
                    <td><span className="badge badge-info">{message.status}</span></td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => openDetails(message.id)}>Voir détail</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <button className="btn btn-outline btn-sm" disabled={pagination.page <= 1} onClick={() => loadMessages(pagination.page - 1)}>Précédent</button>
          <span style={{ alignSelf: 'center' }}>Page {pagination.page} / {totalPages}</span>
          <button className="btn btn-outline btn-sm" disabled={pagination.page >= totalPages} onClick={() => loadMessages(pagination.page + 1)}>Suivant</button>
        </div>
      </div>

      {selectedMessage && (
        <div className="card mt-2">
          <div className="card-header">
            <h3>Détail message</h3>
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedMessage(null)}>Fermer</button>
          </div>

          <p><strong>Sujet:</strong> {selectedMessage.subject}</p>
          <p><strong>Envoyé le:</strong> {selectedMessage.sentAt ? new Date(selectedMessage.sentAt).toLocaleString('fr-FR') : '—'}</p>
          <p><strong>Type destinataires:</strong> {selectedMessage.recipientType}</p>
          <p><strong>Statut:</strong> {selectedMessage.status}</p>

          <div style={{ border: '1px solid var(--amc-border)', borderRadius: 8, padding: 12, marginTop: 8 }} dangerouslySetInnerHTML={{ __html: selectedMessage.body }} />

          <div className="mt-2">
            <h4>Livraison</h4>
            <p>Succès: {selectedMessage.deliveryReport?.sent || 0} / Échecs: {selectedMessage.deliveryReport?.failed || 0}</p>
            <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--amc-border)', borderRadius: 8, padding: 8 }}>
              {(selectedMessage.deliveryReport?.recipients || []).length === 0 ? (
                <p style={{ color: '#6B7280' }}>Aucun détail destinataire.</p>
              ) : (
                selectedMessage.deliveryReport.recipients.map((recipient, index) => (
                  <div key={`${recipient.email}-${index}`} style={{ marginBottom: 6 }}>
                    <strong>{recipient.label || recipient.familyId}</strong> — {recipient.email} — {recipient.status}
                    {recipient.error ? ` (${recipient.error})` : ''}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
