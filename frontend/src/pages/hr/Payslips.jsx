import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiFile, FiDownload } from 'react-icons/fi';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : (import.meta.env.DEV ? 'http://localhost:4000' : '');

const fileHref = (url) => (url?.startsWith('http') ? url : `${BACKEND_ORIGIN}${url}`);

function fmtPeriod(period) {
  if (!period) return '—';
  const [year, month] = period.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function HrPayslips() {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/hr/me/payslips')
      .then(({ data }) => setPayslips(data.payslips || []))
      .catch(() => toast.error('Impossible de charger vos fiches de paie'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Mes fiches de paie</h2>

      <div className="card">
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
          <div className="table-container">
            <table>
              <thead><tr><th>Période</th><th>Document</th><th>Déposée le</th><th>Actions</th></tr></thead>
              <tbody>
                {payslips.length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign: 'center', padding: 24, color: '#6B7280' }}>Aucune fiche de paie disponible pour le moment</td></tr>
                ) : payslips.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{fmtPeriod(p.period)}</td>
                    <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiFile size={14} color="#6B7280" /> {p.fileName || 'Document'}</td>
                    <td>{new Date(p.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <a href={fileHref(p.fileUrl)} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline">
                        <FiDownload size={12} /> Télécharger
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
