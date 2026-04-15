import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit, FiTrash2 } from 'react-icons/fi';

export default function FamilyChildren() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', dateOfBirth: '', gender: 'GARCON',
    allergies: '', currentTreatments: '', emergencyContactName: '', emergencyContactPhone: '',
  });

  const fetchStudents = async () => {
    try {
      const { data } = await api.get('/students');
      setStudents(data.students);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchStudents(); }, []);

  const resetForm = () => {
    setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: 'GARCON', allergies: '', currentTreatments: '', emergencyContactName: '', emergencyContactPhone: '' });
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

  const handleEdit = (s) => {
    setForm({
      firstName: s.firstName, lastName: s.lastName,
      dateOfBirth: s.dateOfBirth?.split('T')[0] || '',
      gender: s.gender, allergies: s.allergies || '',
      currentTreatments: s.currentTreatments || '',
      emergencyContactName: s.emergencyContactName || '',
      emergencyContactPhone: s.emergencyContactPhone || '',
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

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <div className="flex-between mb-2">
        <h2 style={{ color: 'var(--amc-primary)' }}>Mes enfants</h2>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <FiPlus /> Ajouter un enfant
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="card mb-2">
          <div className="card-header">
            <h3>{editing ? 'Modifier l\'enfant' : 'Ajouter un enfant'}</h3>
            <button className="btn btn-outline btn-sm" onClick={resetForm}>Annuler</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Nom <span className="required">*</span></label>
                <input className="form-control" value={form.lastName} onChange={handleChange('lastName')} required />
              </div>
              <div className="form-group">
                <label>Prénom <span className="required">*</span></label>
                <input className="form-control" value={form.firstName} onChange={handleChange('firstName')} required />
              </div>
              <div className="form-group">
                <label>Date de naissance <span className="required">*</span></label>
                <input type="date" className="form-control" value={form.dateOfBirth} onChange={handleChange('dateOfBirth')} required />
              </div>
              <div className="form-group">
                <label>Sexe <span className="required">*</span></label>
                <select className="form-control" value={form.gender} onChange={handleChange('gender')}>
                  <option value="GARCON">Garçon</option>
                  <option value="FILLE">Fille</option>
                </select>
              </div>
            </div>

            <h4 style={{ color: 'var(--amc-primary)', margin: '16px 0 12px', fontSize: 15 }}>Informations médicales (optionnel)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Allergies connues</label>
                <textarea className="form-control" value={form.allergies} onChange={handleChange('allergies')} rows={2} />
              </div>
              <div className="form-group">
                <label>Traitements en cours</label>
                <textarea className="form-control" value={form.currentTreatments} onChange={handleChange('currentTreatments')} rows={2} />
              </div>
              <div className="form-group">
                <label>Personne à prévenir en urgence</label>
                <input className="form-control" placeholder="Nom" value={form.emergencyContactName} onChange={handleChange('emergencyContactName')} />
              </div>
              <div className="form-group">
                <label>Téléphone d'urgence</label>
                <input className="form-control" placeholder="06 XX XX XX XX" value={form.emergencyContactPhone} onChange={handleChange('emergencyContactPhone')} />
              </div>
            </div>

            <button type="submit" className="btn btn-primary mt-2">
              {editing ? 'Modifier' : 'Enregistrer l\'enfant'}
            </button>
          </form>
        </div>
      )}

      {/* Liste */}
      {students.length === 0 && !showForm ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 16, color: '#6B7280', marginBottom: 16 }}>Aucun enfant enregistré</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <FiPlus /> Ajouter mon premier enfant
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {students.map((s) => {
            const age = Math.floor((Date.now() - new Date(s.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            return (
              <div key={s.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{s.lastName} {s.firstName}</strong>
                  <div style={{ color: '#6B7280', fontSize: 13 }}>
                    Né{s.gender === 'FILLE' ? 'e' : ''} le {new Date(s.dateOfBirth).toLocaleDateString('fr-FR')} ({age} ans) • {s.gender === 'GARCON' ? 'Garçon' : 'Fille'}
                  </div>
                  {s.enrollments?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {s.enrollments.filter((e) => e.status !== 'CANCELLED').map((e) => (
                        <span key={e.id} className="badge badge-info" style={{ marginRight: 6 }}>
                          {e.class?.level?.pole?.name} — {e.class?.level?.name}
                        </span>
                      ))}
                    </div>
                  )}
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
