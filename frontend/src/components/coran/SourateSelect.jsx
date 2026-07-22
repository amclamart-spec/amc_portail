import { useState } from 'react';

const STYLES = `
  .cor-select-wrap { position:relative; }
  .cor-select-list { position:absolute; z-index:20; top:calc(100% + 4px); left:0; right:0; max-height:260px; overflow-y:auto; background:#fff; border:1px solid var(--amc-border); border-radius:var(--amc-border-radius); box-shadow:0 8px 24px rgba(0,0,0,.14); }
  .cor-select-item { display:flex; align-items:center; gap:8px; width:100%; padding:9px 12px; border:none; background:none; cursor:pointer; text-align:left; font-family:var(--amc-font-family); font-size:13px; border-bottom:1px solid var(--amc-light-bg-2); min-height:44px; }
  .cor-select-item:last-child { border-bottom:none; }
  .cor-select-item:hover, .cor-select-item:focus { background:var(--amc-light-bg-2); }
  .cor-select-num { flex-shrink:0; width:26px; height:26px; border-radius:50%; background:var(--amc-light-bg-2); color:var(--amc-primary); font-weight:700; font-size:11px; display:flex; align-items:center; justify-content:center; }
  .cor-select-fr  { flex:1; font-weight:600; color:var(--amc-text); }
  .cor-select-ar  { color:#6B7280; font-size:14px; }
  .cor-select-empty { padding:14px; text-align:center; color:#6B7280; font-size:13px; }
`;

export default function SourateSelect({ sourates, value, onChange, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = sourates.find((s) => s.id === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? sourates.filter((s) => `${s.numero} ${s.nomFr}`.toLowerCase().includes(normalizedQuery))
    : sourates;

  return (
    <div className="cor-select-wrap">
      <style>{STYLES}</style>
      <input
        type="text"
        className="form-control"
        disabled={disabled}
        placeholder={placeholder || 'Rechercher une sourate…'}
        value={open ? query : (selected ? `${selected.numero}. ${selected.nomFr}` : '')}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Rechercher une sourate"
      />
      {open && (
        <div className="cor-select-list" role="listbox">
          {filtered.length === 0 && <div className="cor-select-empty">Aucune sourate trouvée</div>}
          {filtered.map((s) => (
            <button
              type="button"
              key={s.id}
              className="cor-select-item"
              role="option"
              aria-selected={s.id === value}
              onMouseDown={() => { onChange(s.id); setOpen(false); setQuery(''); }}
            >
              <span className="cor-select-num">{s.numero}</span>
              <span className="cor-select-fr">{s.nomFr}</span>
              <span className="cor-select-ar" dir="rtl" lang="ar">{s.nomArabe}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
