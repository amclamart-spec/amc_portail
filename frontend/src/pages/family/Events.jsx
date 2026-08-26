import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiCalendar, FiMapPin, FiFileText, FiPaperclip } from 'react-icons/fi';
import { FaMosque, FaMoon, FaGift } from 'react-icons/fa';
import { GiPartyPopper } from 'react-icons/gi';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : (import.meta.env.DEV ? 'http://localhost:4000' : '');

const fileUrl = (url) => (!url ? null : url.startsWith('http') ? url : `${BACKEND_ORIGIN}${url}`);
const isPdfUrl = (url) => !!url && /\.pdf($|\?)/i.test(url);

const EVENT_TYPE_LABEL = { JOUMOUAA: 'Joumouaa', RAMADAN: 'Ramadan', AID: 'Aid', FETE: 'Fête', AUTRE: 'Autre' };
const EVENT_TYPE_ICON = { JOUMOUAA: FaMosque, RAMADAN: FaMoon, AID: FaGift, FETE: GiPartyPopper, AUTRE: FiCalendar };

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function FamilyEvents() {
  const [events, setEvents] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/family/events');
      setEvents(data.events || []);
      setChildren(data.children || []);
    } catch { toast.error('Impossible de charger les événements'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleRegister = async (eventId, studentId, registered) => {
    setSavingKey(eventId + studentId);
    try {
      await api.put(`/family/events/${eventId}/registration`, { studentId, registered });
      toast.success(registered ? 'Inscription enregistrée' : 'Désinscription enregistrée');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setSavingKey(''); }
  };

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Événements ouverts à l'inscription</h2>

      {loading ? <p style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Chargement…</p> : (
        events.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>
            Aucun événement ouvert à l'inscription pour le moment
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {events.map((e) => {
              const TypeIcon = EVENT_TYPE_ICON[e.type] || FiCalendar;
              return (
                <div key={e.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, color: 'var(--amc-primary)' }}>{e.title}</h3>
                    <span className="badge badge-gray" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <TypeIcon size={10} /> {EVENT_TYPE_LABEL[e.type] || e.type}
                    </span>
                    {e.posterUrl && (
                      <a href={fileUrl(e.posterUrl)} target="_blank" rel="noreferrer" className="badge badge-gray" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                        {isPdfUrl(e.posterUrl) ? <FiFileText size={10} /> : <FiPaperclip size={10} />} Affiche
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#6B7280', marginBottom: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FiCalendar size={13} /> {fmtDateTime(e.startDate)}{e.endDate ? ` → ${fmtDateTime(e.endDate)}` : ''}</span>
                    {e.location && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FiMapPin size={13} /> {e.location}</span>}
                  </div>
                  {e.description && <p style={{ margin: '0 0 12px', color: '#374151', fontSize: 14 }}>{e.description}</p>}

                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--amc-border)' }}>
                    {children.length === 0 ? (
                      <p style={{ color: '#94A3B8', fontSize: 12, margin: 0 }}>Ajoutez un enfant à votre profil pour pouvoir l'inscrire à cet événement.</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {children.map((child) => {
                          const registered = e.registeredStudentIds.includes(child.id);
                          return (
                            <label
                              key={child.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: registered ? '#EEF2FF' : '#F8FAFC',
                                border: '1px solid', borderColor: registered ? 'var(--amc-primary)' : 'var(--amc-border)',
                                borderRadius: 16, padding: '4px 10px', fontSize: 13, cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={registered}
                                disabled={savingKey === e.id + child.id}
                                onChange={() => handleRegister(e.id, child.id, !registered)}
                              />
                              {child.firstName} {child.lastName}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
