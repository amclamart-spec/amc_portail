import { useState } from 'react';
import toast from 'react-hot-toast';

/* ─── Cahier de liaison : éléments partagés espace famille / espace professeur ── */

export const LIAISON_STYLES = `
  .lz-wrap        { --lz-accent: var(--amc-primary); --lz-accent-light: #EFF6FF; }
  .lz-card        { background:#fff; border-radius:var(--amc-border-radius-lg); border:1px solid var(--amc-border); box-shadow:var(--amc-shadow); margin-bottom:14px; overflow:hidden; }
  .lz-card-head   { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; padding:10px 14px; background:var(--lz-accent-light); border-bottom:1px solid var(--amc-border); font-weight:700; font-size:13px; color:var(--lz-accent); }
  .lz-card-body   { padding:12px 14px; }
  .lz-label       { font-size:12px; font-weight:700; color:#4B5563; display:block; margin-bottom:4px; }
  .lz-field       { margin-bottom:10px; }
  .lz-row2        { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; }
  .lz-seg         { display:inline-flex; border:1.5px solid var(--amc-border); border-radius:6px; overflow:hidden; }
  .lz-seg button  { padding:5px 12px; border:none; background:#fff; cursor:pointer; font-size:12px; font-weight:700; color:#6B7280; font-family:var(--amc-font-family); }
  .lz-seg button.active { background:var(--lz-accent); color:#fff; }
  .lz-students    { display:flex; flex-wrap:wrap; gap:6px; max-height:150px; overflow-y:auto; padding:6px; border:1px solid var(--amc-border); border-radius:var(--amc-border-radius); }
  .lz-student-chip{ display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:999px; border:1px solid var(--amc-border); font-size:12px; cursor:pointer; user-select:none; background:#fff; }
  .lz-student-chip.on { background:var(--lz-accent); border-color:var(--lz-accent); color:#fff; }
  .lz-file-chip   { display:inline-flex; align-items:center; gap:6px; background:#F8FAFC; border:1px solid var(--amc-border); border-radius:8px; padding:4px 8px; font-size:12px; max-width:100%; }
  .lz-file-chip span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px; }
  .lz-x           { border:none; background:none; cursor:pointer; color:#DC2626; font-size:13px; padding:0; line-height:1; }

  .lz-filters     { display:grid; grid-template-columns:2fr repeat(auto-fit,minmax(140px,1fr)); gap:8px; align-items:end; }
  .lz-filters .form-control { font-size:13px; padding:6px 8px; }
  .lz-filter-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-top:8px; font-size:12px; color:#6B7280; }

  .lz-grid        { width:100%; }
  .lz-grid-head,
  .lz-grid-row    { display:grid; grid-template-columns:var(--lz-cols); gap:10px; align-items:center; padding:9px 14px; }
  .lz-grid-head   { background:var(--amc-light-bg-2, #F8FAFC); border-bottom:1px solid var(--amc-border); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:#6B7280; }
  .lz-grid-row    { border-bottom:1px solid var(--amc-border); cursor:pointer; font-size:13px; transition:background .12s; }
  .lz-grid-row:hover { background:#F9FAFB; }
  .lz-grid-row.unread { background:var(--lz-accent-light); }
  .lz-grid-row.open   { background:#F3F4F6; border-bottom-color:transparent; }
  .lz-cell-date   { font-size:12px; color:#4B5563; white-space:nowrap; }
  .lz-subject     { font-weight:700; color:var(--amc-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lz-grid-row.unread .lz-subject { color:var(--lz-accent); }
  .lz-excerpt     { font-size:12px; color:#6B7280; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px; }
  .lz-muted       { font-size:12px; color:#6B7280; }
  .lz-tag         { display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; font-weight:700; white-space:nowrap; }
  .lz-tag.coll    { background:#EDE9FE; color:#5B21B6; }
  .lz-tag.ind     { background:#E0F2FE; color:#075985; }

  .lz-thread      { padding:12px 14px 16px; background:#F3F4F6; border-bottom:1px solid var(--amc-border); }
  .lz-msg         { background:#fff; border:1px solid var(--amc-border); border-radius:var(--amc-border-radius-lg); padding:10px 12px; margin-bottom:8px; border-left:4px solid #9CA3AF; }
  .lz-msg.staff   { border-left-color:var(--lz-accent); }
  .lz-msg.family  { border-left-color:#D97706; }
  .lz-msg.new     { box-shadow:0 0 0 2px var(--lz-accent-light), var(--amc-shadow); }
  .lz-msg-head    { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:6px; font-size:12px; }
  .lz-msg-body    { white-space:pre-wrap; font-size:14px; line-height:1.6; color:var(--amc-text); word-break:break-word; }
  .lz-reply       { background:#fff; border:1px dashed var(--amc-border); border-radius:var(--amc-border-radius-lg); padding:10px 12px; margin-bottom:12px; }
  .lz-more        { text-align:center; padding:10px; }

  @media (max-width: 760px) {
    .lz-grid-head { display:none; }
    .lz-grid-row  { grid-template-columns:1fr auto; grid-auto-flow:row; gap:4px 10px; }
    .lz-grid-row > .lz-col-main { grid-column:1 / -1; order:-1; }
    .lz-grid-row > .lz-col-opt  { display:none; }
    .lz-filters   { grid-template-columns:1fr 1fr; }
    .lz-filters > :first-child { grid-column:1 / -1; }
  }
`;

export const MAX_ATTACHMENT_MB = 5;
const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.odt,.ods,.txt';
export const PAGE_SIZE = 20;

export function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Recherche plein texte (objet, contenu, expéditeur, élève) + filtres communs aux deux espaces.
export function matchesCommonFilters(thread, { search, status, dateFrom, dateTo, attachment }) {
  if (search) {
    const q = search.trim().toLowerCase();
    const haystack = [
      thread.subject, thread.classLabel, thread.studentName,
      ...thread.messages.flatMap((m) => [m.body, m.senderName, m.studentName, m.attachmentFilename]),
    ].filter(Boolean).join(' ').toLowerCase();
    if (q && !haystack.includes(q)) return false;
  }
  if (status === 'UNREAD' && thread.unreadCount === 0) return false;
  if (status === 'AWAITING_STAFF' && !thread.awaitingStaffReply) return false;
  if (status === 'ANSWERED' && thread.awaitingStaffReply) return false;
  if (attachment === 'WITH' && !thread.hasAttachment) return false;
  if (attachment === 'WITHOUT' && thread.hasAttachment) return false;
  const last = new Date(thread.lastActivityAt);
  if (dateFrom && last < new Date(`${dateFrom}T00:00:00`)) return false;
  if (dateTo && last > new Date(`${dateTo}T23:59:59`)) return false;
  return true;
}

export function AttachmentInput({ value, onChange }) {
  const handleSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      toast.error(`La pièce jointe ne doit pas dépasser ${MAX_ATTACHMENT_MB} Mo`);
      return;
    }
    try {
      onChange({ fileName: file.name, base64: await fileToBase64(file) });
    } catch {
      toast.error('Impossible de lire le fichier sélectionné');
    }
  };

  if (value) {
    return (
      <span className="lz-file-chip">
        <span>📎 {value.fileName}</span>
        <button type="button" className="lz-x" onClick={() => onChange(null)} aria-label={`Retirer ${value.fileName}`}>✕</button>
      </span>
    );
  }
  return (
    <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
      📎 Joindre un fichier
      <input type="file" accept={ATTACHMENT_ACCEPT} onChange={handleSelect} style={{ display: 'none' }} />
    </label>
  );
}

export function StatusBadge({ thread, side }) {
  if (thread.unreadCount > 0) {
    return <span className="badge badge-danger">{thread.unreadCount} non lu{thread.unreadCount > 1 ? 's' : ''}</span>;
  }
  if (side === 'STAFF') {
    if (thread.awaitingStaffReply) return <span className="badge badge-warning">À traiter</span>;
    return <span className="badge badge-success">{thread.messageCount > 1 ? 'Répondu' : 'Envoyé'}</span>;
  }
  if (thread.awaitingStaffReply) return <span className="badge badge-info">En attente de réponse</span>;
  return <span className="badge badge-gray">Lu</span>;
}

function ReplyForm({ thread, side, onReply }) {
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  // Conversation collective, côté professeur : répondre à toute la classe ou en
  // privé à la famille d'un élève ayant participé (par défaut, l'auteur du dernier
  // message famille, puisque c'est en général à lui qu'on répond).
  const lastFamilyMessage = thread.messages.find((m) => m.senderType === 'FAMILY');
  const [target, setTarget] = useState(thread.isCollective && side === 'STAFF' ? (lastFamilyMessage?.studentId || '') : '');

  const submit = async () => {
    if (!body.trim()) { toast.error('Veuillez saisir un message'); return; }
    setSending(true);
    const ok = await onReply(thread, { body, attachment, studentId: target || undefined });
    setSending(false);
    if (ok) { setBody(''); setAttachment(null); }
  };

  return (
    <div className="lz-reply">
      {thread.isCollective && side === 'STAFF' && (
        <div className="lz-field">
          <label className="lz-label">Répondre à</label>
          <select className="form-control" value={target} onChange={(e) => setTarget(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">👥 Toute la classe</option>
            {thread.involvedStudents.map((s) => (
              <option key={s.id} value={s.id}>👤 Famille de {s.name} (privé)</option>
            ))}
          </select>
        </div>
      )}
      {thread.isCollective && side === 'FAMILY' && (
        <div className="lz-muted" style={{ marginBottom: 6 }}>🔒 Votre réponse ne sera visible que par l'équipe pédagogique.</div>
      )}
      <textarea
        className="form-control"
        rows={3}
        placeholder="Votre réponse…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={5000}
        style={{ fontSize: 13, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <AttachmentInput value={attachment} onChange={setAttachment} />
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={sending || !body.trim()}>
          {sending ? 'Envoi…' : '↩ Répondre'}
        </button>
      </div>
    </div>
  );
}

function MessageCard({ message, thread, side }) {
  const isStaff = message.senderType === 'STAFF';
  // Sur une conversation collective, distinguer les messages privés (une famille) des messages à toute la classe.
  const privateTo = thread.isCollective && message.studentId && message.id !== thread.id ? message.studentName : null;
  return (
    <div className={`lz-msg ${isStaff ? 'staff' : 'family'}${message.isUnread ? ' new' : ''}`}>
      <div className="lz-msg-head">
        <span>
          <strong>{message.isMine ? 'Vous' : message.senderName}</strong>
          <span className="lz-muted"> · {message.senderLabel}</span>
          {message.isUnread && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Nouveau</span>}
          {privateTo && side === 'STAFF' && <span className="lz-tag ind" style={{ marginLeft: 6 }}>🔒 Famille de {privateTo}</span>}
          {thread.isCollective && !message.studentId && message.id !== thread.id && isStaff && (
            <span className="lz-tag coll" style={{ marginLeft: 6 }}>👥 Toute la classe</span>
          )}
        </span>
        <span className="lz-muted">{fmtDateTime(message.createdAt)}</span>
      </div>
      <div className="lz-msg-body">{message.body}</div>
      {message.attachmentUrl && (
        <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="lz-file-chip" style={{ marginTop: 8, textDecoration: 'none', color: 'var(--lz-accent)' }}>
          <span>📥 {message.attachmentFilename || 'Pièce jointe'}</span>
        </a>
      )}
    </div>
  );
}

/**
 * Grille des conversations, de la plus récente à la plus ancienne. Un clic sur une
 * ligne déplie l'échange (dernier message en tête) avec le formulaire de réponse.
 * `columns` : [{ key, label, width, optional, render(thread) }] — la colonne
 * "Objet / dernier message" et les colonnes date/statut sont communes.
 */
export default function LiaisonThreadGrid({ threads, side, columns, onOpen, onReply, emptyText }) {
  const [openId, setOpenId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const cols = ['120px', 'minmax(0,3fr)', ...columns.map((c) => c.width || 'minmax(0,1fr)'), '44px', '130px'].join(' ');

  const toggle = (thread) => {
    const next = openId === thread.id ? null : thread.id;
    setOpenId(next);
    if (next && thread.unreadCount > 0) onOpen(thread);
  };

  if (threads.length === 0) {
    return (
      <div style={{ padding: '28px 16px', textAlign: 'center', color: '#6B7280' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📒</div>
        <p style={{ margin: 0, fontSize: 13 }}>{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="lz-grid" style={{ '--lz-cols': cols }}>
      <div className="lz-grid-head">
        <span>Dernier échange</span>
        <span>Objet / dernier message</span>
        {columns.map((c) => <span key={c.key}>{c.label}</span>)}
        <span title="Nombre de messages">💬</span>
        <span>Statut</span>
      </div>
      {threads.slice(0, visibleCount).map((thread) => {
        const isOpen = openId === thread.id;
        return (
          <div key={thread.id}>
            <div
              className={`lz-grid-row${thread.unreadCount > 0 ? ' unread' : ''}${isOpen ? ' open' : ''}`}
              onClick={() => toggle(thread)}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(thread); } }}
            >
              <span className="lz-cell-date">{fmtDateTime(thread.lastActivityAt)}</span>
              <div className="lz-col-main" style={{ minWidth: 0 }}>
                <div className="lz-subject">
                  {isOpen ? '▾ ' : '▸ '}{thread.subject}
                  {thread.hasAttachment && <span title="Pièce jointe" style={{ marginLeft: 6 }}>📎</span>}
                </div>
                <div className="lz-excerpt">
                  <strong>{thread.lastMessage.senderName}</strong> : {thread.lastMessage.body}
                </div>
              </div>
              {columns.map((c) => (
                <div key={c.key} className={c.optional ? 'lz-col-opt' : ''} style={{ minWidth: 0 }}>{c.render(thread)}</div>
              ))}
              <span className="lz-col-opt lz-muted" style={{ textAlign: 'center' }}>{thread.messageCount}</span>
              <span><StatusBadge thread={thread} side={side} /></span>
            </div>
            {isOpen && (
              <div className="lz-thread">
                <ReplyForm thread={thread} side={side} onReply={onReply} />
                {thread.messages.map((m) => <MessageCard key={m.id} message={m} thread={thread} side={side} />)}
              </div>
            )}
          </div>
        );
      })}
      {threads.length > visibleCount && (
        <div className="lz-more">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            Afficher plus ({threads.length - visibleCount} restante{threads.length - visibleCount > 1 ? 's' : ''})
          </button>
        </div>
      )}
    </div>
  );
}
