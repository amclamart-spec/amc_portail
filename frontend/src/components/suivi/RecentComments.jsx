export default function RecentComments({ comments }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3>Derniers commentaires</h3>
      </div>
      {comments.length === 0 ? (
        <p>Aucun commentaire récent.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {comments.map((item) => (
            <div key={`${item.studentId}-${item.createdAt}`} style={{ border: '1px solid var(--amc-border)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong>{item.studentName}</strong>
                <span style={{ fontSize: 12, color: '#6B7280' }}>{new Date(item.createdAt).toLocaleDateString('fr-FR')}</span>
              </div>
              <p style={{ margin: 0, color: '#374151' }}>{item.appreciation || '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
