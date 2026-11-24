// Tableaux lisibles sur téléphone (et dans l'application mobile) : chaque cellule
// reçoit l'intitulé de sa colonne (data-label), utilisé par index.css pour afficher
// sous 640 px chaque ligne comme une carte « Intitulé : valeur ». Automatique pour
// tous les tableaux à en-tête, y compris ceux ajoutés plus tard — un tableau peut
// s'en exclure avec l'attribut data-no-cards.

const MIN_COLUMNS = 3;

function labelTable(table) {
  if (table.hasAttribute('data-no-cards')) return;
  const headerRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headerRow) return;

  // Intitulé par index de colonne, en tenant compte des colspan de l'en-tête.
  const labels = [];
  Array.from(headerRow.cells).forEach((cell) => {
    const text = cell.textContent.trim();
    for (let i = 0; i < (cell.colSpan || 1); i += 1) labels.push(text);
  });
  if (labels.length < MIN_COLUMNS) return;

  table.classList.add('rt-cards');
  Array.from(table.tBodies).forEach((tbody) => {
    Array.from(tbody.rows).forEach((row) => {
      let column = 0;
      Array.from(row.cells).forEach((cell) => {
        const label = labels[column] || '';
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
        column += cell.colSpan || 1;
      });
    });
  });
}

let scheduled = false;

function labelAllTables() {
  scheduled = false;
  document.querySelectorAll('table').forEach(labelTable);
}

export function initResponsiveTables() {
  labelAllTables();
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(labelAllTables);
  }).observe(document.body, { childList: true, subtree: true });
}
