import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import ChatPanel from '../../components/ChatPanel';

export default function ProfesseurChat() {
  const { user } = useAuth();
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadChat();
  }, []);

  async function loadChat() {
    setLoading(true);
    try {
      const { data } = await api.get('/chat/teacher');
      setPartner(data.partner);
      setMessages((data.messages || []).map((message) => ({
        ...message,
        isMine: message.senderId === user?.id,
      })));
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Impossible de charger le chat');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!newMessage.trim()) {
      toast.error('Écrivez un message avant d’envoyer.');
      return;
    }
    setSending(true);
    try {
      await api.post('/chat/teacher', { body: newMessage });
      setNewMessage('');
      await loadChat();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur lors de l’envoi du message');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 style={{ color: 'var(--amc-primary)', marginBottom: 18 }}>Contact administrateur</h1>
      <ChatPanel
        title="Échange avec l’administration"
        partner={partner}
        messages={messages}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        onSend={handleSend}
        onRefresh={loadChat}
        loading={loading}
        sending={sending}
        emptyStateMessage="Aucun message pour le moment. Envoyez un message à l'administration pour commencer la conversation."
        currentUserId={user?.id}
      />
    </div>
  );
}
