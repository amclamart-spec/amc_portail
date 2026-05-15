import { useState, useRef, useEffect } from 'react';
import { FiMessageCircle, FiX, FiMinus, FiPlus, FiSend } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import './FloatingChatbot.css';

const FloatingChatbot = ({ recipientId = null }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [chatRoute, setChatRoute] = useState(null);
  const [chatWithId, setChatWithId] = useState(recipientId);

  // Choisir le bon endpoint de chat selon le rôle
  useEffect(() => {
    if (!user) return;

    if (user.role === 'FAMILLE') {
      setChatRoute('/family');
    } else if (user.role === 'PROFESSEUR') {
      setChatRoute('/teacher');
    } else if (recipientId) {
      setChatWithId(recipientId);
      setChatRoute(null);
    }
  }, [user, recipientId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Charger les messages existants
  useEffect(() => {
    if (isOpen && user?.id && (chatRoute || chatWithId)) {
      loadMessages();
    }
  }, [isOpen, chatRoute, chatWithId, user?.id]);

  const loadMessages = async () => {
    try {
      const endpoint = chatRoute ? `/chat${chatRoute}` : `/chat/thread/${chatWithId}`;
      const response = await api.get(endpoint);
      setMessages(response.data?.messages || response.data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des messages:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || (!chatRoute && !chatWithId)) return;

    const messageToSend = newMessage;
    setNewMessage('');

    try {
      setLoading(true);
      const endpoint = chatRoute ? `/chat${chatRoute}` : '/chat/send';
      const payload = chatRoute
        ? { body: messageToSend }
        : { recipientId: chatWithId, body: messageToSend };

      const response = await api.post(endpoint, payload);
      const createdMessage = response.data?.message || response.data;

      setMessages([
        ...messages,
        {
          id: createdMessage?.id || `${Date.now()}`,
          senderId: createdMessage?.senderId || user.id,
          recipientId: createdMessage?.recipientId || chatWithId,
          body: messageToSend,
          createdAt: createdMessage?.createdAt || new Date().toISOString(),
          read: false,
        },
      ]);
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message:', error);
      setNewMessage(messageToSend);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Bouton flottant */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="floating-chatbot-button"
          title="Ouvrir le chat"
        >
          <FiMessageCircle size={24} />
        </button>
      )}

      {/* Fenêtre du chat */}
      {isOpen && (
        <div className={`floating-chatbot-window ${isMinimized ? 'minimized' : ''}`}>
          {/* Header */}
          <div className="floating-chatbot-header">
            <div className="floating-chatbot-title">
              <FiMessageCircle size={18} />
              <span>Chat Support</span>
            </div>
            <div className="floating-chatbot-controls">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="chatbot-control-btn"
                title={isMinimized ? 'Agrandir' : 'Réduire'}
              >
                {isMinimized ? <FiPlus size={18} /> : <FiMinus size={18} />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="chatbot-control-btn close-btn"
                title="Fermer"
              >
                <FiX size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          {!isMinimized && (
            <>
              <div className="floating-chatbot-messages">
                {messages.length === 0 ? (
                  <div className="chatbot-empty-state">
                    <p>Aucun message. Commencez une conversation!</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`chatbot-message ${
                        msg.senderId === user.id ? 'sent' : 'received'
                      }`}
                    >
                      <div className="message-bubble">{msg.body}</div>
                      <span className="message-time">
                        {new Date(msg.createdAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSendMessage} className="floating-chatbot-input-form">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Écrire un message..."
                  disabled={loading}
                  className="chatbot-input"
                />
                <button
                  type="submit"
                  disabled={loading || !newMessage.trim()}
                  className="chatbot-send-btn"
                  title="Envoyer"
                >
                  <FiSend size={18} />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default FloatingChatbot;
