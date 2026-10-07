import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import LiaisonThreadGrid, { LIAISON_STYLES, AttachmentInput, matchesCommonFilters } from './LiaisonThreadGrid';

const EMPTY_FILTERS = { search: '' };

function ComposeForm({ classId, students, onSent }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('COLLECTIVE');
  const [studentIds, setStudentIds] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);

  const reset = () => { setMode('COLLECTIVE'); setStudentIds([]); setSubject(''); setBody(''); setAttachment(null); };
  const toggleStudent = (id) => setStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const canSend = subject.trim() && body.trim() && (mode === 'COLLECTIVE' || studentIds.length > 0);

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const { data } = await api.post('/liaison', { classId, mode, studentIds, subject, body, attachment });
      toast.success(mode === 'COLLECTIVE'
        ? 'Message envoyé à toute la classe'
        : `Message envoyé à ${data.count} famille${data.count > 1 ? 's' : ''}`);
      reset();
      setOpen(false);
      onSent();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Impossible d\'envoyer le message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="lz-card">
      <div className="lz-card-head">
        <span>✉️ Nouveau message</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { if (open) reset(); setOpen((v) => !v); }}>
          {open ? 'Annuler' : '+ Écrire aux familles'}
        </button>
      </div>
      {open && (
        <div className="lz-card-body">
          <div className="lz-field">
            <label className="lz-label">Destinataires</label>
            <div className="lz-seg">
              <button type="button" className={mode === 'COLLECTIVE' ? 'active' : ''} onClick={() => setMode('COLLECTIVE')}>👥 Toute la classe</button>
              <button type="button" className={mode === 'INDIVIDUAL' ? 'active' : ''} onClick={() => setMode('INDIVIDUAL')}>👤 Élève(s) choisi(s)</button>
            </div>
          </div>
          {mode === 'INDIVIDUAL' && (
            <div className="lz-field">
              <label className="lz-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Élèves ({studentIds.length} sélectionné{studentIds.length > 1 ? 's' : ''}) — une conversation privée par famille</span>
                {students.length > 0 && (
                  <button type="button" className="lz-x" style={{ color: 'var(--lz-accent)', fontWeight: 700, fontSize: 12 }}
                    onClick={() => setStudentIds(studentIds.length === students.length ? [] : students.map((s) => s.studentId))}>
                    {studentIds.length === students.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </button>
                )}
              </label>
              <div className="lz-students">
                {students.length === 0 && <span className="lz-muted">Aucun élève inscrit dans cette classe.</span>}
                {students.map((s) => (
                  <span key={s.studentId} className={`lz-student-chip${studentIds.includes(s.studentId) ? ' on' : ''}`} onClick={() => toggleStudent(s.studentId)}>
                    {studentIds.includes(s.studentId) ? '✓ ' : ''}{s.studentName}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="lz-field">
            <label className="lz-label">Objet</label>
            <input className="form-control" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} placeholder="Ex. : Sortie du 15 novembre, matériel à prévoir…" style={{ fontSize: 13 }} />
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

export default function LiaisonTeacherPanel({ classId, accent }) {
  const [threads, setThreads] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const load = useCallback(() => {
    if (!classId) return Promise.resolve();
    return api.get('/liaison', { params: { classId } })
      .then(({ data }) => setThreads(data.threads || []))
      .catch((e) => toast.error(e.response?.data?.error || 'Impossible de charger le cahier de liaison'));
  }, [classId]);

  useEffect(() => {
    setThreads([]);
    setStudents([]);
    setFilters(EMPTY_FILTERS);
    if (!classId) return;
    setLoading(true);
    Promise.all([
      load(),
      api.get('/absences/class-students', { params: { classId } })
        .then(({ data }) => setStudents(data.students || []))
        .catch(() => setStudents([])),
    ]).finally(() => setLoading(false));
  }, [classId, load]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const filtered = useMemo(() => threads.filter((t) => matchesCommonFilters(t, filters)), [threads, filters]);

  const unreadTotal = threads.reduce((n, t) => n + t.unreadCount, 0);
  const awaitingTotal = threads.filter((t) => t.awaitingStaffReply).length;
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const handleOpen = (thread) => {
    api.post(`/liaison/${thread.id}/read`, { classId })
      .then(() => setThreads((prev) => prev.map((t) => (t.id === thread.id
        ? { ...t, unreadCount: 0, messages: t.messages.map((m) => ({ ...m, isUnread: false })) }
        : t))))
      .catch(() => {});
  };

  const handleReply = async (thread, { body, attachment, studentId }) => {
    try {
      await api.post(`/liaison/${thread.id}/replies`, { classId, body, attachment, studentId });
      toast.success('Réponse envoyée');
      await load();
      return true;
    } catch (e) {
      toast.error(e.response?.data?.error || 'Impossible d\'envoyer la réponse');
      return false;
    }
  };

  const columns = [
    {
      key: 'to', label: 'Destinataire', width: 'minmax(0,1.3fr)',
      render: (t) => (t.isCollective
        ? <span className="lz-tag coll">👥 Toute la classe</span>
        : <span className="lz-tag ind" title={t.studentName}>👤 {t.studentName}</span>),
    },
    {
      key: 'from', label: 'Initié par', width: '100px', optional: true,
      render: (t) => <span className="lz-muted">{t.startedBy === 'FAMILY' ? 'Famille' : 'Équipe'}</span>,
    },
  ];

  if (!classId) {
    return <p style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>Sélectionnez une classe pour accéder au cahier de liaison.</p>;
  }

  return (
    <div className="lz-wrap" style={accent ? { '--lz-accent': accent.primary, '--lz-accent-light': accent.light } : undefined}>
      <style>{LIAISON_STYLES}</style>

      <ComposeForm classId={classId} students={students} onSent={load} />

      <div className="lz-card">
        <div className="lz-card-head">
          <span>📒 Cahier de liaison</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {unreadTotal > 0 && <span className="badge badge-danger">{unreadTotal} non lu{unreadTotal > 1 ? 's' : ''}</span>}
            {awaitingTotal > 0 && <span className="badge badge-warning">{awaitingTotal} à traiter</span>}
          </span>
        </div>
        <div className="lz-card-body" style={{ borderBottom: '1px solid var(--amc-border)' }}>
          <div className="lz-filters">
            <div>
              <label className="lz-label">Rechercher</label>
              <input className="form-control" placeholder="Objet, contenu, nom, pièce jointe…" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
            </div>
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
            key={classId}
            threads={filtered}
            side="STAFF"
            columns={columns}
            onOpen={handleOpen}
            onReply={handleReply}
            emptyText={filtersActive ? 'Aucune conversation ne correspond à ces filtres.' : 'Aucun échange pour cette classe. Écrivez aux familles avec « Nouveau message ».'}
          />
        )}
      </div>
    </div>
  );
}
