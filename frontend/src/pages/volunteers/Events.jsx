import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiMapPin, FiCalendar, FiCheck, FiX, FiClock, FiUsers } from 'react-icons/fi';
import { FaMosque, FaMoon, FaGift } from 'react-icons/fa';
import { GiPartyPopper } from 'react-icons/gi';

const EMPTY = { title: '', type: 'AUTRE', description: '', location: '', startDate: '', endDate: '', groupIds: [] };

const ATTENDANCE_LABEL = { PENDING: 'En attente de réponse', CONFIRMED: 'Présence confirmée', DECLINED: 'Absence signalée' };
const ATTENDANCE_BADGE = { PENDING: 'badge-gray', CONFIRMED: 'badge-success', DECLINED: 'badge-danger' };

const EVENT_TYPES = [
  { value: 'JOUMOUAA', label: 'Joumouaa', icon: FaMosque },
  { value: 'RAMADAN', label: 'Ramadan', icon: FaMoon },
  { value: 'AID', label: 'Aid', icon: FaGift },
  { value: 'FETE', label: 'Fête', icon: GiPartyPopper },
  { value: 'AUTRE', label: 'Autre', icon: FiCalendar },
];
const EVENT_TYPE_LABEL = Object.fromEntries(EVENT_TYPES.map((t) => [t.value, t.label]));
const EVENT_TYPE_ICON = Object.fromEntries(EVENT_TYPES.map((t) => [t.value, t.icon]));

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toInputValue(d) {
  if (!d) return '';
  const date = new Date(d);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

// Extrait l'heure locale "HH:MM" d'un timestamp ISO
function toTimeInput(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toTimeString().slice(0, 5);
}

// Combine la date d'un événement avec une heure "HH:MM" saisie par l'utilisateur
function combineDateAndTime(referenceDateISO, timeHHMM) {
  if (!timeHHMM) return null;
  const ref = new Date(referenceDateISO);
  const [h, m] = timeHHMM.split(':').map(Number);
  const combined = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), h, m, 0, 0);
  return combined.toISOString();
}

function fmtHours(h) {
  if (h == null) return '—';
  return `${Number(h).toFixed(2).replace(/\.00$/, '')} h`;
}

function monthLabel(date) {
  const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Regroupe une liste d'événements par mois (clé triable "AAAA-MM")
function groupByMonth(list, order = 'asc') {
  const map = new Map();
  for (const e of list) {
    const d = new Date(e.startDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, { key, label: monthLabel(d), events: [] });
    map.get(key).events.push(e);
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => (order === 'asc' ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key)));
  return groups;
}

export default function VolunteerEvents() {
  const { user } = useAuth();
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const canManage = userRoles.includes('RESPONSABLE_POLE_BENEVOLES') || userRoles.includes('SUPER_ADMIN');

  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'archive'
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  // bénévole : saisie de l'imputation (heure début/fin) par événement
  const [imputationDraft, setImputationDraft] = useState({});
  const [savingParticipation, setSavingParticipation] = useState('');
  const [validatedHours, setValidatedHours] = useState(null);

  // responsable : imputations d'un événement
  const [participationsModal, setParticipationsModal] = useState(null); // event
  const [participations, setParticipations] = useState([]);
  const [participationsLoading, setParticipationsLoading] = useState(false);
  const [participationEdits, setParticipationEdits] = useState({});
  const [validatingId, setValidatingId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const requests = [api.get('/volunteers/events')];
      if (canManage) requests.push(api.get('/volunteers/groups'));
      else requests.push(api.get('/volunteers/hours'));
      const [{ data: evData }, secondRes] = await Promise.all(requests);
      setEvents(evData.events || []);
      if (canManage) setGroups(secondRes?.data.groups || []);
      else setValidatedHours(secondRes?.data ?? null);
    } catch { toast.error('Impossible de charger les événements'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setEditId(null); setModal(true); };
  const openEdit = (e) => {
    setForm({
      title: e.title,
      type: e.type || 'AUTRE',
      description: e.description || '',
      location: e.location || '',
      startDate: toInputValue(e.startDate),
      endDate: toInputValue(e.endDate),
      groupIds: (e.groups || []).map((g) => g.id),
    });
    setEditId(e.id);
    setModal(true);
  };

  const toggleFormGroup = (groupId) => {
    setForm((p) => ({
      ...p,
      groupIds: p.groupIds.includes(groupId) ? p.groupIds.filter((id) => id !== groupId) : [...p.groupIds, groupId],
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title || !form.startDate) { toast.error('Titre et date de début requis'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        type: form.type,
        description: form.description || null,
        location: form.location || null,
        startDate: new Date(form.startDate).toISOString(),
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        groupIds: form.groupIds,
      };
      if (editId) await api.put(`/volunteers/events/${editId}`, payload);
      else await api.post('/volunteers/events', payload);
      toast.success(editId ? 'Événement modifié' : 'Événement créé');
      setModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/volunteers/events/${id}`);
      toast.success('Événement supprimé');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
  };

  // ─── bénévole : RSVP + imputation (heure début/fin) ──────────────────────

  const handleAttendance = async (eventId, attendanceStatus) => {
    setSavingParticipation(eventId + attendanceStatus);
    try {
      await api.put(`/volunteers/events/${eventId}/participation`, { attendanceStatus });
      toast.success(attendanceStatus === 'CONFIRMED' ? 'Présence confirmée' : 'Absence signalée');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSavingParticipation(''); }
  };

  const setImputationField = (eventId, field, value) => {
    setImputationDraft((prev) => ({ ...prev, [eventId]: { ...prev[eventId], [field]: value } }));
  };

  const handleImputationSave = async (event) => {
    const draft = imputationDraft[event.id] || {};
    const startTimeInput = draft.start ?? toTimeInput(event.myParticipation?.startTime);
    const endTimeInput = draft.end ?? toTimeInput(event.myParticipation?.endTime);
    if (!startTimeInput || !endTimeInput) { toast.error('Saisissez une heure de début et de fin'); return; }

    setSavingParticipation(event.id + 'imputation');
    try {
      await api.put(`/volunteers/events/${event.id}/participation`, {
        startTime: combineDateAndTime(event.startDate, startTimeInput),
        endTime: combineDateAndTime(event.startDate, endTimeInput),
      });
      toast.success('Imputation enregistrée');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSavingParticipation(''); }
  };

  // ─── responsable : imputations ───────────────────────────────────────────

  const openParticipations = async (event) => {
    setParticipationsModal(event);
    setParticipationsLoading(true);
    try {
      const { data } = await api.get(`/volunteers/events/${event.id}/participations`);
      setParticipations(data.participations || []);
      setParticipationEdits({});
    } catch { toast.error('Impossible de charger les imputations'); }
    finally { setParticipationsLoading(false); }
  };

  const setParticipationEditField = (participationId, field, value) => {
    setParticipationEdits((prev) => ({ ...prev, [participationId]: { ...prev[participationId], [field]: value } }));
  };

  const handleValidate = async (participation) => {
    const edits = participationEdits[participation.id] || {};
    const startTimeInput = edits.start ?? toTimeInput(participation.startTime);
    const endTimeInput = edits.end ?? toTimeInput(participation.endTime);

    setValidatingId(participation.id);
    try {
      const payload = { hoursValidated: true };
      if (startTimeInput) payload.startTime = combineDateAndTime(participationsModal.startDate, startTimeInput);
      if (endTimeInput) payload.endTime = combineDateAndTime(participationsModal.startDate, endTimeInput);
      const { data } = await api.put(`/volunteers/events/${participationsModal.id}/participations/${participation.id}`, payload);
      setParticipations((prev) => prev.map((p) => (p.id === participation.id ? data.participation : p)));
      toast.success('Imputation validée');
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setValidatingId(''); }
  };

  const now = new Date();
  const upcomingEvents = events.filter((e) => new Date(e.startDate) >= now);
  const pastEvents = events.filter((e) => new Date(e.startDate) < now);
  const visibleGroups = activeTab === 'upcoming' ? groupByMonth(upcomingEvents, 'asc') : groupByMonth(pastEvents, 'desc');

  const renderEventCard = (e) => {
    const attendance = e.myParticipation?.attendanceStatus || 'PENDING';
    const TypeIcon = EVENT_TYPE_ICON[e.type] || FiCalendar;
    return (
      <div key={e.id} className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <h3 style={{ margin: 0, color: 'var(--amc-primary)' }}>{e.title}</h3>
              <span className="badge badge-gray" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <TypeIcon size={10} /> {EVENT_TYPE_LABEL[e.type] || e.type}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#6B7280', marginBottom: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FiCalendar size={13} /> {fmtDateTime(e.startDate)}{e.endDate ? ` → ${fmtDateTime(e.endDate)}` : ''}</span>
              {e.location && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FiMapPin size={13} /> {e.location}</span>}
            </div>
            {e.description && <p style={{ margin: '0 0 8px', color: '#374151', fontSize: 14 }}>{e.description}</p>}
            {e.groups?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {e.groups.map((g) => (
                  <span key={g.id} style={{ background: '#EEF2FF', color: 'var(--amc-primary)', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>{g.name}</span>
                ))}
              </div>
            )}
            {e.groups?.length === 0 && (
              <span style={{ color: '#94A3B8', fontSize: 12 }}>Ouvert à tous les bénévoles</span>
            )}
          </div>
          {canManage && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn btn-sm btn-outline" onClick={() => openParticipations(e)}><FiUsers size={12} /> Imputations</button>
              <button className="btn btn-sm btn-outline" onClick={() => openEdit(e)}><FiEdit2 size={12} /></button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(e.id)}><FiTrash2 size={12} /></button>
            </div>
          )}
        </div>

        {!canManage && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--amc-border)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <span className={`badge ${ATTENDANCE_BADGE[attendance]}`}>{ATTENDANCE_LABEL[attendance]}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={savingParticipation === e.id + 'CONFIRMED'}
                  onClick={() => handleAttendance(e.id, 'CONFIRMED')}
                ><FiCheck size={12} /> Je participe</button>
                <button
                  className="btn btn-sm btn-outline"
                  disabled={savingParticipation === e.id + 'DECLINED'}
                  onClick={() => handleAttendance(e.id, 'DECLINED')}
                ><FiX size={12} /> Je ne participe pas</button>
              </div>
            </div>

            {attendance === 'CONFIRMED' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <FiClock size={14} color="#6B7280" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B7280' }}>
                  Début
                  <input
                    type="time"
                    className="form-control"
                    style={{ width: 110 }}
                    defaultValue={toTimeInput(e.myParticipation?.startTime)}
                    onChange={(ev) => setImputationField(e.id, 'start', ev.target.value)}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B7280' }}>
                  Fin
                  <input
                    type="time"
                    className="form-control"
                    style={{ width: 110 }}
                    defaultValue={toTimeInput(e.myParticipation?.endTime)}
                    onChange={(ev) => setImputationField(e.id, 'end', ev.target.value)}
                  />
                </label>
                <button className="btn btn-sm btn-secondary" disabled={savingParticipation === e.id + 'imputation'} onClick={() => handleImputationSave(e)}>
                  {savingParticipation === e.id + 'imputation' ? '…' : 'Enregistrer mon imputation'}
                </button>
                {e.myParticipation?.hoursSpent != null && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong style={{ fontSize: 13 }}>{fmtHours(e.myParticipation.hoursSpent)}</strong>
                    <span className={`badge ${e.myParticipation.hoursValidated ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: 11 }}>
                      {e.myParticipation.hoursValidated ? 'Validées' : 'En attente de validation'}
                    </span>
                  </span>
                )}
              </div>
            ) : (
              <p style={{ color: '#94A3B8', fontSize: 12, margin: '10px 0 0' }}>
                Confirmez votre présence pour saisir votre imputation (heure de début / heure de fin).
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--amc-primary)', margin: 0 }}>Événements</h2>
        {canManage && <button className="btn btn-primary" onClick={openCreate}><FiPlus size={14} /> Nouvel événement</button>}
      </div>

      {!canManage && validatedHours != null && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
          <FiClock size={20} color="var(--amc-primary)" />
          <div>
            <strong style={{ color: 'var(--amc-primary)', fontSize: 16 }}>{fmtHours(validatedHours.validatedHours)}</strong>
            <span style={{ color: '#374151', marginLeft: 8, fontSize: 13 }}>validées en {validatedHours.year}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${activeTab === 'upcoming' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('upcoming')}>
          Événements ({upcomingEvents.length})
        </button>
        <button className={`btn btn-sm ${activeTab === 'archive' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('archive')}>
          Archive ({pastEvents.length})
        </button>
      </div>

      {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
        visibleGroups.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>
            {activeTab === 'upcoming' ? 'Aucun événement à venir' : 'Aucun événement archivé'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 24 }}>
            {visibleGroups.map((group) => (
              <div key={group.key}>
                <h3 style={{ margin: '0 0 12px', color: '#374151', fontSize: 15 }}>{group.label}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, alignItems: 'start' }}>
                  {group.events.map((e) => renderEventCard(e))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Modal création/édition événement */}
      {modal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 480 }}>
            <div className="card-header"><h3>{editId ? 'Modifier l\'événement' : 'Nouvel événement'}</h3><button className="btn btn-outline btn-sm" onClick={() => setModal(false)}>Fermer</button></div>
            <form onSubmit={handleSave} style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Titre *</label>
                <input className="form-control" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Type *</label>
                <select className="form-control" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} required>
                  {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Description</label>
                <textarea className="form-control" rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Lieu</label>
                <input className="form-control" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Début *</label>
                  <input className="form-control" type="datetime-local" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Fin</label>
                  <input className="form-control" type="datetime-local" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Groupes concernés (laisser vide = ouvert à tous les bénévoles)</label>
                {groups.length === 0 ? (
                  <p style={{ color: '#94A3B8', fontSize: 13, margin: '4px 0' }}>Aucun groupe créé pour le moment</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                    {groups.map((g) => (
                      <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: form.groupIds.includes(g.id) ? '#EEF2FF' : '#F8FAFC', border: '1px solid var(--amc-border)', borderRadius: 16, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.groupIds.includes(g.id)} onChange={() => toggleFormGroup(g.id)} />
                        {g.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal imputations (responsable) */}
      {participationsModal && (
        <div className="modal-overlay">
          <div className="card modal-card" style={{ maxWidth: 980 }}>
            <div className="card-header">
              <h3>Imputations — {participationsModal.title}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setParticipationsModal(null)}>Fermer</button>
            </div>
            <div style={{ padding: 16 }}>
              {participationsLoading ? <p style={{ textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
                participations.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#6B7280' }}>Aucun bénévole n'a encore répondu</p>
                ) : (
                  <div className="table-container">
                    <table>
                      <thead><tr><th>Bénévole</th><th>Présence</th><th>Début</th><th>Fin</th><th>Heures</th><th>Statut</th><th>Actions</th></tr></thead>
                      <tbody>
                        {participations.map((p) => {
                          const canEditImputation = p.attendanceStatus === 'CONFIRMED';
                          return (
                            <tr key={p.id}>
                              <td style={{ fontWeight: 600 }}>{p.volunteer?.lastName} {p.volunteer?.firstName}</td>
                              <td><span className={`badge ${ATTENDANCE_BADGE[p.attendanceStatus]}`}>{ATTENDANCE_LABEL[p.attendanceStatus]}</span></td>
                              <td>
                                <input
                                  type="time"
                                  className="form-control"
                                  style={{ width: 100 }}
                                  disabled={!canEditImputation}
                                  defaultValue={toTimeInput(p.startTime)}
                                  onChange={(e) => setParticipationEditField(p.id, 'start', e.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="time"
                                  className="form-control"
                                  style={{ width: 100 }}
                                  disabled={!canEditImputation}
                                  defaultValue={toTimeInput(p.endTime)}
                                  onChange={(e) => setParticipationEditField(p.id, 'end', e.target.value)}
                                />
                              </td>
                              <td>{fmtHours(p.hoursSpent)}</td>
                              <td>
                                {p.hoursSpent == null ? '—' : (
                                  <span className={`badge ${p.hoursValidated ? 'badge-success' : 'badge-warning'}`}>{p.hoursValidated ? 'Validé' : 'À valider'}</span>
                                )}
                              </td>
                              <td>
                                {canEditImputation && (
                                  <button
                                    className="btn btn-sm btn-primary"
                                    disabled={validatingId === p.id}
                                    onClick={() => handleValidate(p)}
                                  >
                                    {validatingId === p.id ? '…' : 'Valider'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
