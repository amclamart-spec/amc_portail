import { useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { lastNWeekBuckets, isInBucket } from './sourateUtils';

const STATUS_COLORS = { maitrisee: '#16A34A', enCours: '#D97706', nonCommencee: '#9CA3AF' };
const CATEGORICAL_COLORS = ['#0088CC', '#FF8042'];

const STYLES = `
  .cor-kpi-chart-card { background:#fff; border:1px solid var(--amc-border); border-radius:var(--amc-border-radius-lg); box-shadow:var(--amc-shadow); padding:14px; margin-bottom:16px; }
  .cor-kpi-chart-title { font-weight:700; font-size:13px; color:var(--amc-text); margin-bottom:10px; }
`;

function formatMinutes(totalMinutes) {
  if (!totalMinutes) return '0 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes ? `${minutes} min` : ''}`.trim();
}

function KpiCard({ icon, iconClass, value, label }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconClass}`}>{icon}</div>
      <div className="stat-info">
        <h4>{value}</h4>
        <p>{label}</p>
      </div>
    </div>
  );
}

export function ApprentissageKpis({ repetitions }) {
  const stats = useMemo(() => {
    const total = repetitions.length;
    const mastered = repetitions.filter((r) => r.compteur >= 30).length;
    const inProgress = repetitions.filter((r) => r.compteur > 0 && r.compteur < 30).length;
    const notStarted = total - mastered - inProgress;
    const evaluated = repetitions.filter((r) => r.appreciation).length;
    const currentWeek = lastNWeekBuckets(1)[0];
    const activeThisWeek = repetitions.filter((r) => isInBucket(r.derniereDate, currentWeek)).length;

    return { total, mastered, inProgress, notStarted, evaluated, activeThisWeek };
  }, [repetitions]);

  const pieData = [
    { name: 'Maîtrisée (≥30 rép.)', value: stats.mastered, color: STATUS_COLORS.maitrisee },
    { name: 'En cours (1-29 rép.)', value: stats.inProgress, color: STATUS_COLORS.enCours },
    { name: 'Non commencée (0 rép.)', value: stats.notStarted, color: STATUS_COLORS.nonCommencee },
  ].filter((d) => d.value > 0);

  if (stats.total === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <style>{STYLES}</style>
      <div className="stats-grid" style={{ marginBottom: 14 }}>
        <KpiCard icon="📄" iconClass="primary" value={stats.total} label="Pages ajoutées" />
        <KpiCard icon="🟢" iconClass="success" value={`${stats.mastered} (${Math.round((stats.mastered / stats.total) * 100)}%)`} label="Maîtrisées" />
        <KpiCard icon="✅" iconClass="success" value={`${stats.evaluated} (${Math.round((stats.evaluated / stats.total) * 100)}%)`} label="Évaluées par le professeur" />
        <KpiCard icon="🔥" iconClass="warning" value={stats.activeThisWeek} label="Pages actives cette semaine" />
      </div>
      <div className="cor-kpi-chart-card">
        <div className="cor-kpi-chart-title">Répartition des pages par niveau de mémorisation</div>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={pieData.length > 1 ? 2 : 0}
              label={({ percent, value }) => `${value} (${Math.round(percent * 100)}%)`}
            >
              {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
            </Pie>
            <Tooltip formatter={(value, name) => [`${value} page${value > 1 ? 's' : ''}`, name]} />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RevisionKpis({ revisions }) {
  const buckets = useMemo(() => lastNWeekBuckets(8), []);

  const stats = useMemo(() => {
    const total = revisions.length;
    const nouvelle = revisions.filter((r) => r.type === 'NOUVELLE_PAGE').length;
    const ancienne = revisions.filter((r) => r.type === 'ANCIENNE_PAGE').length;
    const distinctPages = new Set(revisions.map((r) => `${r.sourateId}-${r.pageDebut}-${r.pageFin}`)).size;
    return { total, nouvelle, ancienne, distinctPages };
  }, [revisions]);

  const chartData = useMemo(() => buckets.map((b) => {
    const row = { label: b.label, Nouvelle: 0, Ancienne: 0 };
    revisions.forEach((r) => {
      if (!isInBucket(r.date, b)) return;
      if (r.type === 'NOUVELLE_PAGE') row.Nouvelle += 1;
      else if (r.type === 'ANCIENNE_PAGE') row.Ancienne += 1;
    });
    return row;
  }), [buckets, revisions]);

  if (stats.total === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <style>{STYLES}</style>
      <div className="stats-grid" style={{ marginBottom: 14 }}>
        <KpiCard icon="📖" iconClass="primary" value={stats.total} label="Révisions au total" />
        <KpiCard icon="🆕" iconClass="success" value={stats.nouvelle} label="Nouvelle page" />
        <KpiCard icon="🔄" iconClass="warning" value={stats.ancienne} label="Ancienne page" />
      </div>
      <div className="cor-kpi-chart-card">
        <div className="cor-kpi-chart-title">Révisions par semaine (8 dernières semaines)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barCategoryGap={8}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Nouvelle" stackId="rev" fill={CATEGORICAL_COLORS[0]} radius={[0, 0, 0, 0]} />
            <Bar dataKey="Ancienne" stackId="rev" fill={CATEGORICAL_COLORS[1]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LectureKpis({ lectures }) {
  const buckets = useMemo(() => lastNWeekBuckets(8), []);

  const stats = useMemo(() => {
    const total = lectures.length;
    const totalMinutes = lectures.reduce((sum, l) => sum + (l.dureeMinutes || 0), 0);
    const avgMinutes = total > 0 ? Math.round(totalMinutes / total) : 0;
    return { total, totalMinutes, avgMinutes };
  }, [lectures]);

  const chartData = useMemo(() => buckets.map((b) => {
    const minutes = lectures
      .filter((l) => isInBucket(l.date, b))
      .reduce((sum, l) => sum + (l.dureeMinutes || 0), 0);
    return { label: b.label, minutes };
  }), [buckets, lectures]);

  if (stats.total === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <style>{STYLES}</style>
      <div className="stats-grid" style={{ marginBottom: 14 }}>
        <KpiCard icon="🎤" iconClass="primary" value={stats.total} label="Séances de lecture" />
        <KpiCard icon="⏱️" iconClass="success" value={formatMinutes(stats.totalMinutes)} label="Temps total" />
        <KpiCard icon="📊" iconClass="warning" value={formatMinutes(stats.avgMinutes)} label="Durée moyenne / séance" />
      </div>
      <div className="cor-kpi-chart-card">
        <div className="cor-kpi-chart-title">Minutes de lecture par semaine (8 dernières semaines)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barCategoryGap={8}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip formatter={(value) => [`${value} min`, 'Lecture']} />
            <Bar dataKey="minutes" fill={CATEGORICAL_COLORS[0]} radius={[4, 4, 0, 0]} name="Minutes" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
