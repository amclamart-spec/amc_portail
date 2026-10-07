import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import LiaisonThreadGrid, { LIAISON_STYLES, AttachmentInput, matchesCommonFilters } from './LiaisonThreadGrid';

const EMPTY_FILTERS = { search: '', classId: '' };

function ComposeForm({ student, contacts, onSent }) {
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);

  // Un seul cours : présélectionné.
  useEffect(() => { setClassId(contacts.length === 1 ? contacts[0].classId : ''); }, [contacts]);

  const reset = () => { setClassId(contacts.length === 1 ? contacts[0].classId : ''); setSubject(''); setBody(''); setAttachment(null); };
  const canSend = classId && subject.trim() && body.trim();

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await api.post('/family/pedagogy/liaison', { studentId: student.id, classId, subject, body, attachment });
      toast.success('Message envoyé à l\'enseignant');
      reset();
      setOpen(false);
      onSent();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Impossible d\'envoyer le message');
    } finally {
      setSending(false);
    }
  };

  if (contacts.length === 0) return null;

  return (
    <div className="lz-card">
      <div className="lz-card-head">
        <span>✉️ Contacter l'enseignant de {student.firstName}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { if (open) reset(); setOpen((v) => !v); }}>
          {open ? 'Annuler' : '+ Nouveau message'}
        </button>
      </div>
      {open && (
        <div className="lz-card-body">
          <div className="lz-field">
            <label className="lz-label">Cours / enseignant</label>
            <select className="form-control" value={classId} onChange={(e) => setClassId(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">Sélectionner un cours…</option>
              {contacts.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.classLabel}{c.teacherNames.length > 0 ? ` — ${c.teacherNames.join(', ')}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="lz-field">
            <label className="lz-label">Objet</label>
            <input className="form-control" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} placeholder="Ex. : Question sur les devoirs, rendez-vous…" style={{ fontSize: 13 }} />
          </div>
          <div className="lz-field">
            <label className="lz-label">Message</label>
            <textarea className="form-control" rows={4} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} style={{ fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <AttachmentInput value={attachment} onChange={setAttachment} />
            <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={sending || !canSend}>
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Cahier de liaison d'un membre de la famille. Les données sont chargées par la
 * page (pour afficher le nombre de messages non lus sur l'onglet) et passées ici.
 */
export default function LiaisonFamilyPanel({ student, threads, contacts, loading, onReload, onThreadsChange }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  useEffect(() => { setFilters(EMPTY_FILTERS); }, [student?.id]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const filtered = useMemo(() => threads.filter((t) => {
    if (!matchesCommonFilters(t, filters)) return false;
    if (filters.classId && t.classId !== filters.classId) return false;
    return true;
  }), [threads, filters]);

  const unreadTotal = threads.reduce((n, t) => n + t.unreadCount, 0);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const handleOpen = (thread) => {
    api.post(`/family/pedagogy/liaison/${thread.id}/read`, { studentId: student.id })
      .then(() => onThreadsChange((prev) => prev.map((t) => (t.id === thread.id
        ? { ...t, unreadCount: 0, messages: t.messages.map((m) => ({ ...m, isUnread: false })) }
        : t))))
      .catch(() => {});
  };

  const handleReply = async (thread, { body, attachment }) => {
    try {
      await api.post(`/family/pedagogy/liaison/${thread.id}/replies`, { studentId: student.id, body, attachment });
      toast.success('Réponse envoyée');
      await onReload();
      return true;
    } catch (e) {
      toast.error(e.response?.data?.error || 'Impossible d\'envoyer la réponse');
      return false;
    }
  };

  const columns = [
    {
      key: 'class', label: 'Cours', width: 'minmax(0,1.3fr)',
      render: (t) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.classLabel}>{t.classLabel}</div>
          <span className={`lz-tag ${t.isCollective ? 'coll' : 'ind'}`}>{t.isCollective ? '👥 Toute la classe' : `👤 ${student.firstName}`}</span>
        </div>
      ),
    },
    {
      key: 'from', label: 'Initié par', width: '100px', optional: true,
      render: (t) => <span className="lz-muted">{t.startedBy === 'FAMILY' ? 'Vous' : 'Enseignant'}</span>,
    },
  ];

  return (
    <div className="lz-wrap">
      <style>{LIAISON_STYLES}</style>

      <ComposeForm student={student} contacts={contacts} onSent={onReload} />

      <div className="lz-card">
        <div className="lz-card-head">
          <span>📒 Cahier de liaison — {student.firstName}</span>
          {unreadTotal > 0 && <span className="badge badge-danger">{unreadTotal} non lu{unreadTotal > 1 ? 's' : ''}</span>}
        </div>
        <div className="lz-card-body" style={{ borderBottom: '1px solid var(--amc-border)' }}>
          <div className="lz-filters">
            <div>
              <label className="lz-label">Rechercher</label>
              <input className="form-control" placeholder="Objet, contenu, enseignant, pièce jointe…" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
            </div>
            {contacts.length > 1 && (
              <div>
                <label className="lz-label">Cours</label>
                <select className="form-control" value={filters.classId} onChange={(e) => setFilter('classId', e.target.value)}>
                  <option value="">Tous</option>
                  {contacts.map((c) => <option key={c.classId} value={c.classId}>{c.classLabel}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="lz-filter-foot">
            <span>{filtered.length} conversation{filtered.length > 1 ? 's' : ''}{filtersActive ? ` sur ${threads.length}` : ''}</span>
            {filtersActive && <button type="button" className="btn btn-outline btn-sm" onClick={() => setFilters(EMPTY_FILTERS)}>Réinitialiser les filtres</button>}
          </div>
        </div>
        {loading ? (
          <p style={{ textAlign: 'center', padding: 30, color: '#6B7280' }}>Chargement…</p>
        ) : (
          <LiaisonThreadGrid
            key={student.id}
            threads={filtered}
            side="FAMILY"
            columns={columns}
            onOpen={handleOpen}
            onReply={handleReply}
            emptyText={filtersActive ? 'Aucune conversation ne correspond à ces filtres.' : `Aucun échange pour ${student.firstName} pour le moment.`}
          />
        )}
      </div>
    </div>
  );
}
