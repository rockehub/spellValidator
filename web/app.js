const summaryEl = document.getElementById('summary');
const comboBody = document.querySelector('#comboTable tbody');
const onlyConflicts = document.getElementById('onlyConflicts');
const searchCombo = document.getElementById('searchCombo');
const unreachableEl = document.getElementById('unreachable');
const datasetEl = document.getElementById('dataset');
const tabButtons = document.querySelectorAll('.tabs button');

let report = null;
let activeTab = 'elements';

function card(title, value) {
  return `<div class="card"><span>${title}</span><b>${value}</b></div>`;
}

function renderSummary() {
  const s = report.summary;
  summaryEl.innerHTML = [
    card('Elementos', s.elements),
    card('Fenômenos Ofensivos', s.offensive),
    card('Fenômenos Protetivos', s.protective),
    card('Fenômenos Utilitários', s.utility),
    card('Combinações Totais', s.total_combinations),
    card('Combinações com conflito', s.conflicted_combinations),
    card('Fenômenos inacessíveis', s.unreachable_phenomena),
  ].join('');
}

function renderCombos() {
  const term = searchCombo.value.trim().toLowerCase();
  const rows = report.combinations.filter(c => {
    if (onlyConflicts.checked && c.conflicts.length === 0) return false;
    if (!term) return true;
    return c.combo.join(', ').toLowerCase().includes(term);
  });

  comboBody.innerHTML = rows.map(c => `
    <tr>
      <td>${c.combo.join(', ')}</td>
      <td>${c.offensive.join('<br/>') || '-'}</td>
      <td>${c.protective.join('<br/>') || '-'}</td>
      <td>${c.utility.join('<br/>') || '-'}</td>
      <td class="${c.conflicts.length ? 'conflict' : 'ok'}">${c.conflicts.join('<br/>') || 'Sem conflito'}</td>
    </tr>
  `).join('');
}

function renderUnreachable() {
  if (!report.unreachable_phenomena.length) {
    unreachableEl.innerHTML = '<li class="ok">Nenhum fenômeno inacessível ✅</li>';
    return;
  }
  unreachableEl.innerHTML = report.unreachable_phenomena
    .map(p => `<li><b>${p.category}</b> - ${p.name} (${p.id})</li>`)
    .join('');
}

function renderDataset() {
  const rows = report[activeTab] || [];
  if (!rows.length) {
    datasetEl.innerHTML = '<p>Nenhum dado.</p>';
    return;
  }
  const cols = Object.keys(rows[0]);
  datasetEl.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map(r => `<tr>${cols.map(c => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function init() {
  const res = await fetch('data/report.json');
  report = await res.json();
  renderSummary();
  renderCombos();
  renderUnreachable();
  renderDataset();

  onlyConflicts.addEventListener('change', renderCombos);
  searchCombo.addEventListener('input', renderCombos);
  tabButtons.forEach(btn => btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    renderDataset();
  }));
}

init();
