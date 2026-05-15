export default function ChatPanel({
  title,
  conversations,
  selectedConversationId,
  onSelectConversation,
  partner,
  messages,
  newMessage,
  setNewMessage,
  onSend,
  onRefresh,
  loading,
  sending,
  emptyStateMessage,
  currentUserId,
}) {
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      {conversations && (
        <div style={{ flex: '0 0 320px', minWidth: 280, maxHeight: 640, overflowY: 'auto', border: '1px solid var(--amc-border)', borderRadius: 12, background: '#ffffff' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--amc-border)', background: '#f8fafc' }}>
            <h3 style={{ margin: 0 }}>Conversations</h3>
          </div>
          {conversations.length === 0 ? (
            <p style={{ padding: 16, color: '#6B7280' }}>Aucune conversation.</p>
          ) : (
            conversations.map((conversation) => {
              const isSelected = conversation.partner.id === selectedConversationId;
              return (
                <button
                  key={conversation.partner.id}
                  type="button"
                  onClick={() => onSelectConversation(conversation.partner.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 14,
                    border: 'none',
                    borderBottom: '1px solid var(--amc-border)',
                    background: isSelected ? '#f1f5f9' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {conversation.partner.firstName} {conversation.partner.lastName}
                  </div>
                  <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 4 }}>
                    {conversation.partner.role}
                  </div>
                  <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {conversation.lastMessage || 'Pas de message.'}
                  </div>
                  {conversation.unreadCount > 0 && (
                    <span style={{ display: 'inline-block', marginTop: 8, padding: '2px 8px', background: '#2563eb', color: '#ffffff', borderRadius: 999 }}>{conversation.unreadCount}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', minHeight: 520, border: '1px solid var(--amc-border)', borderRadius: 12, background: '#ffffff' }}>
        <div style={{ padding: 18, borderBottom: '1px solid var(--amc-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--amc-primary)' }}>{title}</h2>
            {partner && (
              <div style={{ marginTop: 6, color: '#475569' }}>
                {partner.firstName} {partner.lastName} — {partner.role}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-outline" onClick={onRefresh}>Actualiser</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {loading ? (
            <p>Chargement...</p>
          ) : messages.length === 0 ? (
            <p style={{ color: '#6B7280' }}>{emptyStateMessage || 'Aucun message dans cette conversation.'}</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                style={{
                  marginBottom: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: message.isMine ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: 14,
                    borderRadius: 16,
                    background: message.isMine ? 'var(--amc-primary)' : '#f1f5f9',
                    color: message.isMine ? '#ffffff' : '#0f172a',
                    whiteSpace: 'pre-wrap',
                    textAlign: 'left',
                  }}
                >
                  {message.body}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                  {new Date(message.createdAt).toLocaleString('fr-FR')}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: 18, borderTop: '1px solid var(--amc-border)' }}>
          <textarea
            rows={4}
            className="form-control"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Tapez votre message ici..."
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onRefresh}>Rafraîchir</button>
            <button type="button" className="btn btn-primary" onClick={onSend} disabled={sending || !newMessage.trim()}>
              {sending ? 'Envoi...' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
