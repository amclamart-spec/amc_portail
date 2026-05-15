export default function ClassOverview({ stats }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3>Vue d’ensemble</h3>
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="form-section">
          <p style={{ marginBottom: 8, color: '#4B5563' }}>Élèves inscrits</p>
          <strong style={{ fontSize: 24 }}>{stats?.totalStudents ?? 0}</strong>
        </div>
        <div className="form-section">
          <p style={{ marginBottom: 8, color: '#4B5563' }}>Moyenne</p>
          <strong style={{ fontSize: 24 }}>{stats?.averageGrade?.toFixed(2) ?? '0.00'}</strong>
        </div>
        <div className="form-section">
          <p style={{ marginBottom: 8, color: '#4B5563' }}>Taux de présence</p>
          <strong style={{ fontSize: 24 }}>{stats?.participationRate ?? 0}%</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'relative', width: 180, height: 180 }}>
            <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%' }}>
              <path
                d="M18 2.0845a15.9155 15.9155 0 1 1 0 31.831"
                fill="none"
                stroke="#E5E7EB"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845a15.9155 15.9155 0 1 1 0 31.831"
                fill="none"
                stroke="var(--amc-primary)"
                strokeWidth="3"
                strokeDasharray={`${stats?.progressionRate ?? 0}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <strong style={{ fontSize: 20 }}>{stats?.progressionRate ?? 0}%</strong>
                <div style={{ fontSize: 12, color: '#6B7280' }}>Progression</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
