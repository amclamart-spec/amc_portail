import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import ChatPanel from '../../components/ChatPanel';

export default function AdminChat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    setLoading(true);
    try {
      const { data } = await api.get('/chat/admin/conversations');
      setConversations(data.conversations || []);
      if (data.conversations?.length > 0) {
        const first = data.conversations[0].partner.id;
        setSelectedUserId(first);
        await loadConversation(first);
      } else {
        setSelectedUserId(null);
        setPartner(null);
        setMessages([]);
      }
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Impossible de charger les conversations');
    } finally {
      setLoading(false);
    }
  }

  async function loadConversation(userId) {
    setLoading(true);
    try {
      const { data } = await api.get(`/chat/admin/conversations/${userId}`);
      setPartner(data.partner);
      setMessages((data.messages || []).map((message) => ({
        ...message,
        isMine: message.senderId === user?.id,
      })));
      setSelectedUserId(userId);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Impossible de charger la conversation');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!selectedUserId) {
      toast.error('Sélectionnez une conversation.');
      return;
    }
    if (!newMessage.trim()) {
      toast.error('Écrivez un message avant d’envoyer.');
      return;
    }

    setSending(true);
    try {
      await api.post(`/chat/admin/conversations/${selectedUserId}`, { body: newMessage });
      setNewMessage('');
      await loadConversation(selectedUserId);
      await loadConversations();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Erreur lors de l’envoi du message');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 style={{ color: 'var(--amc-primary)', marginBottom: 18 }}>Chat administrateur</h1>
      <ChatPanel
        title="Discussions avec les utilisateurs"
        conversations={conversations}
        selectedConversationId={selectedUserId}
        onSelectConversation={loadConversation}
        partner={partner}
        messages={messages}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        onSend={handleSend}
        onRefresh={() => selectedUserId ? loadConversation(selectedUserId) : loadConversations()}
        loading={loading}
        sending={sending}
        emptyStateMessage="Sélectionnez une conversation pour afficher les messages."
        currentUserId={user?.id}
      />
    </div>
  );
}
