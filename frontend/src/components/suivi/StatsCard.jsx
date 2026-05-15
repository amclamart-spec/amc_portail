export default function StatsCard({ icon: Icon, label, value, subtitle }) {
  return (
    <div className="stat-card">
      <div className="stat-icon primary"><Icon size={22} /></div>
      <div className="stat-info">
        <h4>{value}</h4>
        <p>{label}</p>
        {subtitle && <small style={{ color: '#6B7280' }}>{subtitle}</small>}
      </div>
    </div>
  );
}
