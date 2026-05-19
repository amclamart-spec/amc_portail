import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit, FiTrash2 } from 'react-icons/fi';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : (import.meta.env.DEV ? 'http://localhost:4000' : '');

export default function FamilyChildren() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', dateOfBirth: '', gender: 'GARCON',
    allergies: '', currentTreatments: '', emergencyContactName: '', emergencyContactPhone: '',
    photoBase64: '', photoUrl: '',
  });

  const fetchStudents = async () => {
    try {
      const { data } = await api.get('/students');
      setStudents(data.students);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchStudents(); }, []);

  const resetForm = () => {
    setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: 'GARCON', allergies: '', currentTreatments: '', emergencyContactName: '', emergencyContactPhone: '', photoBase64: '', photoUrl: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/students/${editing}`, form);
        toast.success('Élève modifié');
      } else {
        await api.post('/students', form);
        toast.success('Élève ajouté !');
      }
      resetForm();
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur');
    }
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, photoBase64: reader.result, photoUrl: '' }));
    };
    reader.readAsDataURL(file);
  };

  const handleEdit = (s) => {
    setForm({
      firstName: s.firstName, lastName: s.lastName,
      dateOfBirth: s.dateOfBirth?.split('T')[0] || '',
      gender: s.gender, allergies: s.allergies || '',
      currentTreatments: s.currentTreatments || '',
      emergencyContactName: s.emergencyContactName || '',
      emergencyContactPhone: s.emergencyContactPhone || '',
      photoBase64: '',
      photoUrl: s.photoUrl || '',
    });
    setEditing(s.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet élève ?')) return;
    try {
      await api.delete(`/students/${id}`);
      toast.success('Élève supprimé');
      fetchStudents();
    } catch { toast.error('Erreur'); }
  };

  const handleChange = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

  const getPhotoSource = (url) => {
    if (!url) return null;
    return url.startsWith('http') ? url : `${BACKEND_ORIGIN}${url}`;
  };

  const isProvisionalClass = (cls) => {
    if (!cls) return false;
    const value = String(cls.teacherName || cls.room || '').trim();
    return ['AFFECTATION_PROVISOIRE', 'Classe fictive'].includes(value);
  };

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <div className="flex-between mb-2">
        <h2 style={{ color: 'var(--amc-primary)' }}>Mes enfants</h2>
        <button className="btn btn-outline" onClick={() => navigate('/famille/inscription/nouveau')}>
          <FiPlus /> Inscrire un nouveau membre
        </button>
      </div>

      {/* Liste */}
      {students.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 16, color: '#6B7280', marginBottom: 16 }}>Aucun enfant enregistré</p>
          <button className="btn btn-primary" onClick={() => navigate('/famille/inscription/nouveau')}>
            <FiPlus /> Inscrire un nouveau membre
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {students.map((s) => {
            const age = Math.floor((Date.now() - new Date(s.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            return (
              <div key={s.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  {s.photoUrl && (
                    <img
                      src={getPhotoSource(s.photoUrl)}
                      alt={`${s.firstName} ${s.lastName}`}
                      style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 12, border: '1px solid #E2E8F0' }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 16 }}>{s.lastName} {s.firstName}</strong>
                    <div style={{ color: '#6B7280', fontSize: 13 }}>
                      Né{s.gender === 'FILLE' ? 'e' : ''} le {new Date(s.dateOfBirth).toLocaleDateString('fr-FR')} ({age} ans) • {s.gender === 'GARCON' ? 'Garçon' : 'Fille'}
                    </div>
                    {s.enrollments?.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {s.enrollments.filter((e) => e.status !== 'CANCELLED').map((e) => {
                          const provisional = isProvisionalClass(e.class);
                          return (
                            <span key={e.id} className="badge badge-info" style={{ marginRight: 6 }}>
                              {provisional ? 'Classe fictive' : `${e.class?.level?.pole?.name} — ${e.class?.level?.name}`}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => handleEdit(s)}><FiEdit /> Modifier</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}><FiTrash2 /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
