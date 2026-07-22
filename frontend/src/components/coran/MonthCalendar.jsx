import { Fragment, useMemo, useState } from 'react';
import { isoWeekNumber } from './sourateUtils';

const STYLES = `
  .cor-cal         { background:#fff; border:1px solid var(--amc-border); border-radius:var(--amc-border-radius-lg); box-shadow:var(--amc-shadow); padding:14px; }
  .cor-cal-head    { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:12px; }
  .cor-cal-title   { flex:1; text-align:center; font-weight:800; color:var(--amc-primary); font-size:14px; text-transform:capitalize; }
  .cor-cal-nav-btn { width:28px; height:28px; border-radius:50%; border:1px solid var(--amc-border); background:#fff; color:var(--amc-primary); font-size:14px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .cor-cal-nav-btn:disabled { opacity:.35; cursor:default; }
  .cor-cal-today-btn { display:block; margin:0 auto 12px; font-size:11px; color:var(--amc-primary); background:none; border:none; cursor:pointer; font-weight:700; padding:0; }
  .cor-cal-grid    { display:grid; grid-template-columns:28px repeat(7,1fr); gap:4px; align-items:center; }
  .cor-cal-daylbl  { font-size:11px; color:#6B7280; text-align:center; font-weight:700; }
  .cor-cal-weeklbl { font-size:10px; color:#6B7280; font-weight:700; text-align:center; }
  .cor-cal-cell    { aspect-ratio:1; min-height:26px; display:flex; align-items:center; justify-content:center; font-size:12px; border-radius:6px; color:var(--amc-text); }
  .cor-cal-cell.outside { color:#D1D5DB; }
  .cor-cal-cell.marked:not(.today) { background:#DCFCE7; color:#166534; font-weight:700; }
  .cor-cal-cell.today    { background:var(--amc-primary); color:#fff; font-weight:800; }
  .cor-cal-legend  { display:flex; align-items:center; gap:6px; margin-top:12px; font-size:11px; color:#6B7280; }
  .cor-cal-dot     { display:inline-block; width:9px; height:9px; border-radius:50%; background:#DCFCE7; border:1px solid #166534; }

  @media(max-width:899px) { .cor-cal-grid { grid-template-columns:24px repeat(7,minmax(0,1fr)); } }
`;

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function mondayIndex(date) {
  return (date.getDay() + 6) % 7; // 0 = lundi … 6 = dimanche
}

function buildMonthWeeks(reference) {
  const firstOfMonth = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const lastOfMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);

  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - mondayIndex(firstOfMonth));

  const gridEnd = new Date(lastOfMonth);
  gridEnd.setDate(lastOfMonth.getDate() + (6 - mondayIndex(lastOfMonth)));

  const weeks = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }
  return weeks;
}

/**
 * Calendrier mensuel en lecture seule. Navigation limitée aux mois de l'année en
 * cours (janvier à décembre). `markedDates` (dates ISO ou Date) est optionnel et
 * permet de surligner les jours où une activité existe pour l'onglet affiché.
 */
export default function MonthCalendar({ markedDates, legendLabel }) {
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const [viewedMonthIndex, setViewedMonthIndex] = useState(today.getMonth());

  const viewedMonth = useMemo(() => new Date(currentYear, viewedMonthIndex, 1), [currentYear, viewedMonthIndex]);
  const monthLabel = viewedMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const weeks = useMemo(() => buildMonthWeeks(viewedMonth), [viewedMonth]);

  const markedSet = useMemo(() => {
    const set = new Set();
    (markedDates || []).forEach((d) => { if (d) set.add(new Date(d).toDateString()); });
    return set;
  }, [markedDates]);

  const isCurrentMonth = viewedMonthIndex === today.getMonth();

  return (
    <div className="cor-cal">
      <style>{STYLES}</style>
      <div className="cor-cal-head">
        <button
          type="button"
          className="cor-cal-nav-btn"
          aria-label="Mois précédent"
          disabled={viewedMonthIndex <= 0}
          onClick={() => setViewedMonthIndex((m) => Math.max(0, m - 1))}
        >
          ‹
        </button>
        <span className="cor-cal-title">📅 {monthLabel}</span>
        <button
          type="button"
          className="cor-cal-nav-btn"
          aria-label="Mois suivant"
          disabled={viewedMonthIndex >= 11}
          onClick={() => setViewedMonthIndex((m) => Math.min(11, m + 1))}
        >
          ›
        </button>
      </div>
      {!isCurrentMonth && (
        <button type="button" className="cor-cal-today-btn" onClick={() => setViewedMonthIndex(today.getMonth())}>
          ← Revenir au mois en cours
        </button>
      )}
      <div className="cor-cal-grid">
        <span />
        {DAY_LABELS.map((label, i) => <span key={i} className="cor-cal-daylbl">{label}</span>)}
        {weeks.map((week, wi) => (
          <Fragment key={wi}>
            <span className="cor-cal-weeklbl">S{isoWeekNumber(week[0])}</span>
            {week.map((day) => {
              const isOutside = day.getMonth() !== viewedMonth.getMonth();
              const isToday = day.toDateString() === today.toDateString();
              const isMarked = markedSet.has(day.toDateString());
              return (
                <span
                  key={day.toISOString()}
                  className={`cor-cal-cell${isOutside ? ' outside' : ''}${isMarked ? ' marked' : ''}${isToday ? ' today' : ''}`}
                >
                  {day.getDate()}
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
      {markedDates && markedDates.length > 0 && (
        <div className="cor-cal-legend"><span className="cor-cal-dot" /> {legendLabel || 'Jour avec activité'}</div>
      )}
    </div>
  );
}
