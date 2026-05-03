import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { BarChart, Bar, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import api from '../../api/axios';

const COLORS = ['#0088CC', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

function formatCurrency(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

export default function AdminStatistics() {
  const [schoolYears, setSchoolYears] = useState([]);
  const [filters, setFilters] = useState({ schoolYearId: '' });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    evolution: [],
    distribution: { byPole: [], byLevel: [] },
    fillRate: [],
    financial: { summary: {}, unpaidTrend: [] },
  });

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: yearsData }, evolutionRes, distributionRes, fillRateRes, financialRes] = await Promise.all([
        api.get('/admin/school-years'),
        api.get('/admin/statistics/enrollment-evolution'),
        api.get('/admin/statistics/distribution', { params: filters.schoolYearId ? { schoolYearId: filters.schoolYearId } : {} }),
        api.get('/admin/statistics/fill-rate', { params: filters.schoolYearId ? { schoolYearId: filters.schoolYearId } : {} }),
        api.get('/admin/statistics/financial', { params: filters.schoolYearId ? { schoolYearId: filters.schoolYearId } : {} }),
      ]);

      setSchoolYears(yearsData.schoolYears || []);
      setData({
        evolution: evolutionRes.data.data || [],
        distribution: distributionRes.data || { byPole: [], byLevel: [] },
        fillRate: fillRateRes.data.data || [],
        financial: financialRes.data || { summary: {}, unpaidTrend: [] },
      });
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Impossible de charger les statistiques');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [filters.schoolYearId]);

  const sortedFillRate = useMemo(() => [...(data.fillRate || [])].sort((a, b) => b.fillRate - a.fillRate).slice(0, 12), [data.fillRate]);

  function exportStatisticsExcel() {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.evolution), 'Evolution Inscriptions');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.distribution.byPole || []), 'Répartition Pôles');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sortedFillRate || []), 'Taux Remplissage');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.financial.unpaidTrend || []), 'Tendance Financière');

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([data.financial.summary || {}]), 'Résumé Financier');

    XLSX.writeFile(workbook, `statistiques-admin-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Export Excel des statistiques généré');
  }

  if (loading) return <p>Chargement des statistiques...</p>;

  return (
    <div>
      <div className="flex-between mb-2" style={{ gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ color: 'var(--amc-primary)' }}>Statistiques administratives</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-control" value={filters.schoolYearId} onChange={(e) => setFilters((prev) => ({ ...prev, schoolYearId: e.target.value }))} style={{ minWidth: 220 }}>
            <option value="">Année en cours / Toutes</option>
            {schoolYears.map((year) => <option key={year.id} value={year.id}>{year.label || year.name}</option>)}
          </select>
          <button className="btn btn-outline" onClick={loadData}>Actualiser</button>
          <button className="btn btn-primary" onClick={exportStatisticsExcel}>Exporter Excel</button>
        </div>
      </div>

      <div className="card mb-2">
        <div className="card-header"><h3>Évolution des inscriptions</h3></div>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={data.evolution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="enrollments" stroke="#0088CC" strokeWidth={2} name="Inscriptions" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="card-header"><h3>Répartition par pôle</h3></div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data.distribution.byPole || []} dataKey="count" nameKey="name" outerRadius={90} label>
                  {(data.distribution.byPole || []).map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Taux de remplissage des classes</h3></div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={sortedFillRate}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="classLabel" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="fillRate" fill="#00C49F" name="Remplissage (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-header"><h3>Tableau financier</h3></div>

        <div className="stats-grid" style={{ marginBottom: 12 }}>
          <div className="stat-card"><div className="stat-info"><h4>{data.financial.summary.paymentRate || 0}%</h4><p>Taux de paiement</p></div></div>
          <div className="stat-card"><div className="stat-info"><h4>{formatCurrency(data.financial.summary.totalExpected)}</h4><p>Montant attendu</p></div></div>
          <div className="stat-card"><div className="stat-info"><h4>{formatCurrency(data.financial.summary.totalPaid)}</h4><p>Montant encaissé</p></div></div>
          <div className="stat-card"><div className="stat-info"><h4>{formatCurrency(data.financial.summary.totalUnpaid)}</h4><p>Montant impayé</p></div></div>
          <div className="stat-card"><div className="stat-info"><h4>{data.financial.summary.familiesWithUnpaid || 0}</h4><p>Familles avec impayés</p></div></div>
        </div>

        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={data.financial.unpaidTrend || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="succeeded" stroke="#0088CC" name="Encaissements" />
              <Line type="monotone" dataKey="failed" stroke="#FF8042" name="Transactions échouées" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
