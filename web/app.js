// ============================================================
// Element color/config map
// ============================================================
const ELEM = {
  Fire:       { color: '#ff6b35', hex: 0xff6b35 },
  Wind:       { color: '#4ecdc4', hex: 0x4ecdc4 },
  Water:      { color: '#45b7d1', hex: 0x45b7d1 },
  Earth:      { color: '#c49a6c', hex: 0xc49a6c },
  Lightning:  { color: '#ffd93d', hex: 0xffd93d },
  Reality:    { color: '#bd5cfc', hex: 0xbd5cfc },
  Protection: { color: '#6bcb77', hex: 0x6bcb77 },
  Aether:     { color: '#b8c0ff', hex: 0xb8c0ff },
};

let report = null;
let currentPage = 1;
const PAGE_SIZE = 30;
const selectedComboKeys = new Set();
const STAT_FIELDS = [
  'Heat', 'Pressure', 'Humidity', 'Density', 'Conductivity',
  'Distortion', 'Protection', 'Volatility', 'Stability', 'Essence', 'Damage',
];
const REQ_FIELDS = ['Heat', 'Pressure', 'Humidity', 'Density', 'Conductivity', 'Distortion'];

// ============================================================
// Navigation
// ============================================================
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      const view = document.getElementById('view-' + btn.dataset.view);
      if (view) view.classList.add('active');
      if (btn.dataset.view === 'visualizer') initThreeScene();
    });
  });
}

// ============================================================
// Overview: Summary Cards
// ============================================================
function renderSummary() {
  const s = report.summary;
  const cards = [
    { label: 'Elementos',            value: s.elements,                icon: '' },
    { label: 'Ofensivos',            value: s.offensive,               icon: '' },
    { label: 'Protetivos',           value: s.protective,              icon: '' },
    { label: 'Utilitarios',          value: s.utility,                 icon: '' },
    { label: 'Combinacoes',          value: s.total_combinations,      icon: '' },
    { label: 'Conflitos',            value: s.conflicted_combinations, icon: '', cls: s.conflicted_combinations > 0 ? 'warn' : 'ok' },
    { label: 'Inacessiveis',         value: s.unreachable_phenomena,   icon: '', cls: s.unreachable_phenomena > 0 ? 'warn' : 'ok' },
  ];
  document.getElementById('summary').innerHTML = cards.map(c =>
    `<div class="card ${c.cls || ''}">
      <span class="card-label">${c.label}</span>
      <span class="card-value">${c.value}</span>
    </div>`
  ).join('');
}

// ============================================================
// Overview: Unreachable
// ============================================================
function renderUnreachable() {
  const el = document.getElementById('unreachable');
  if (!report.unreachable_phenomena.length) {
    el.innerHTML = '<li class="ok">Todos os fenomenos sao alcancaveis</li>';
    return;
  }
  el.innerHTML = report.unreachable_phenomena
    .map(p => `<li><b>${p.category}</b> — ${p.name} <span style="color:var(--text-dim)">(${p.id})</span></li>`)
    .join('');
}

// ============================================================
// Overview: Tier Chart
// ============================================================
function renderTierChart() {
  const tiers = {};
  report.offensive.forEach(p => {
    const pri = p.Priority;
    tiers[pri] = (tiers[pri] || 0) + 1;
  });

  const tierNames = {
    10: 'Tier 1 (1 elem)', 20: 'Tier 2 (2 elem)', 30: 'Tier 3 (3 elem)',
    50: 'Tier 4 (4 elem)', 60: 'Tier 5 (5 elem)', 70: 'Tier 6 (6 elem)',
  };
  const colors = ['#7c5cfc', '#45b7d1', '#4ecdc4', '#ffd93d', '#ff6b35', '#bd5cfc'];
  const maxCount = Math.max(...Object.values(tiers));

  const el = document.getElementById('tierChart');
  el.innerHTML = Object.keys(tiers).sort((a, b) => a - b).map((pri, i) => {
    const count = tiers[pri];
    const pct = (count / maxCount * 100).toFixed(0);
    const name = tierNames[pri] || `Pri ${pri}`;
    return `<div class="tier-bar-row">
      <span class="tier-label">${name}</span>
      <div class="tier-bar-wrap">
        <div class="tier-bar" style="width:${pct}%; background:${colors[i % colors.length]}">${count}</div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// Overview: Element Grid
// ============================================================
function renderElementGrid() {
  const thresholdFields = ['Heat', 'Pressure', 'Humidity', 'Density', 'Conductivity', 'Distortion'];
  document.getElementById('elementGrid').innerHTML = report.elements.map(e => {
    const stats = thresholdFields
      .filter(f => e[f] > 0)
      .map(f => `${f}: ${e[f]}`)
      .join(', ') || 'Nenhum threshold';
    return `<div class="element-card">
      <div class="elem-orb ${e.RowName}"></div>
      <div class="elem-info">
        <div class="elem-name">${e.RowName}</div>
        <div class="elem-cat">${e.DefaultCategory}</div>
        <div class="elem-stats">${stats}</div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// Combinations Table
// ============================================================
function pill(name) {
  return `<span class="elem-pill ${name}">${name}</span>`;
}

function getFilteredCombos() {
  const term = document.getElementById('searchCombo').value.trim().toLowerCase();
  const onlyConflicts = document.getElementById('onlyConflicts').checked;
  const filterSize = document.getElementById('filterSize').value;

  return report.combinations.filter(c => {
    if (onlyConflicts && c.conflicts.length === 0) return false;
    if (filterSize && c.combo.length !== parseInt(filterSize)) return false;
    if (term && !c.combo.join(', ').toLowerCase().includes(term)) return false;
    return true;
  });
}

function comboKey(combo) {
  return [...combo].sort().join('|');
}

function countSelectedVisibleCombos(rows) {
  return rows.filter(c => selectedComboKeys.has(comboKey(c.combo))).length;
}

function renderCombos() {
  const filtered = getFilteredCombos();
  document.getElementById('comboCount').textContent = filtered.length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  const tbody = document.querySelector('#comboTable tbody');
  tbody.innerHTML = pageRows.map(c => {
    const key = comboKey(c.combo);
    const checked = selectedComboKeys.has(key) ? 'checked' : '';
    const pills = c.combo.map(pill).join(' ');
    const off = c.offensive.length
      ? `<div class="spell-list">${c.offensive.map((s, i) => `<span class="spell-name${i === c.offensive.length - 1 ? ' spell-winner' : ''}">${s}</span>`).join('')}</div>`
      : '<span class="spell-name" style="color:var(--text-dim)">-</span>';
    const prot = c.protective.length
      ? `<div class="spell-list">${c.protective.map((s, i) => `<span class="spell-name${i === c.protective.length - 1 ? ' spell-winner' : ''}">${s}</span>`).join('')}</div>`
      : '<span class="spell-name" style="color:var(--text-dim)">-</span>';
    const util = c.utility.length
      ? `<div class="spell-list">${c.utility.map((s, i) => `<span class="spell-name${i === c.utility.length - 1 ? ' spell-winner' : ''}">${s}</span>`).join('')}</div>`
      : '<span class="spell-name" style="color:var(--text-dim)">-</span>';
    const status = c.conflicts.length
      ? `<span class="badge conflict">${c.conflicts.length} conflito${c.conflicts.length > 1 ? 's' : ''}</span>`
      : '<span class="badge ok">OK</span>';
    return `<tr>
      <td><input type="checkbox" class="select-combo" data-combo-key="${key}" ${checked} /></td>
      <td>${pills}</td><td>${off}</td><td>${prot}</td><td>${util}</td><td>${status}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.select-combo').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.comboKey;
      if (input.checked) {
        selectedComboKeys.add(key);
      } else {
        selectedComboKeys.delete(key);
      }
      refreshSelectionUI(filtered, pageRows);
    });
  });

  refreshSelectionUI(filtered, pageRows);

  renderPagination(totalPages);
}

function refreshSelectionUI(filteredRows, visibleRows) {
  const selectedCount = selectedComboKeys.size;
  document.getElementById('selectedCount').textContent = `${selectedCount} combinações selecionadas`;

  const selectAll = document.getElementById('selectAllVisibleCombos');
  const visibleSelected = countSelectedVisibleCombos(visibleRows);
  if (!visibleRows.length) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }
  selectAll.checked = visibleSelected === visibleRows.length;
  selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visibleRows.length;
}

function parseRequiredElements(value) {
  if (!value) return [];
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

function toNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildExportSpell(spell, category) {
  const requiredElements = parseRequiredElements(spell.RequiredElements);
  const requiredStats = {};
  REQ_FIELDS.forEach(field => {
    requiredStats[field] = toNumber(spell[`Req_${field}`], 0);
  });

  const rowName = spell.RowName || spell.Name || spell.PhenomenonID;
  return {
    Name: rowName,
    PhenomenonID: spell.PhenomenonID,
    DisplayName: spell.DisplayName,
    Priority: toNumber(spell.Priority, 0),
    Category: category,
    RequiredStats: {
      BaseStats: Object.fromEntries(STAT_FIELDS.map(f => [f, requiredStats[f] || 0])),
      Cost: 0,
      CritChanceMod: 0,
      CritMultiplierMod: 0,
      CastingTimeMod: 0,
      RangeMod: 0,
      CooldownMod: 0,
      DurationMod: 0,
    },
    RequiredElements: requiredElements,
    RequiredTier: spell.RequiredTier || 'Default',
    DeliveryShape: spell.DeliveryShape || 'None',
    CustomAbilityClass: 'None',
    StatModifiers: Object.fromEntries(STAT_FIELDS.map(f => [f, 0])),
    CritChanceModifier: 0,
    RangeModifier: 0,
    Icon: 'None',
    DeliveryVFX: spell['VFX Sugestão'] || 'None',
    ChargeVFX: 'None',
  };
}

function exportSelectedSpells() {
  const category = document.getElementById('exportCategory').value;
  const selectedCombos = report.combinations.filter(c => selectedComboKeys.has(comboKey(c.combo)));
  if (!selectedCombos.length) {
    alert('Selecione ao menos uma combinação para exportar.');
    return;
  }

  const categoryMap = {
    offensive: { key: 'offensive', reportCategory: 'Offensive' },
    protective: { key: 'protective', reportCategory: 'Protective' },
    utility: { key: 'utility', reportCategory: 'Utility' },
  };
  const cat = categoryMap[category];
  const names = new Set();
  selectedCombos.forEach(combo => combo[cat.key].forEach(name => names.add(name)));
  if (!names.size) {
    alert(`As combinações selecionadas não possuem spells ${cat.reportCategory}.`);
    return;
  }

  const dataset = report[cat.key] || [];
  const exported = dataset
    .filter(spell => names.has(spell.DisplayName))
    .map(spell => buildExportSpell(spell, cat.reportCategory));

  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spells_${category}_export.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function findSpellConflicts(newSpell, dataset) {
  const issues = [];
  const normalizedName = newSpell.RowName.trim().toLowerCase();
  const normalizedPid = newSpell.PhenomenonID.trim().toLowerCase();
  const normalizedDisplay = newSpell.DisplayName.trim().toLowerCase();

  dataset.forEach(existing => {
    const sameName = (existing.RowName || '').trim().toLowerCase() === normalizedName;
    const samePid = (existing.PhenomenonID || '').trim().toLowerCase() === normalizedPid;
    const sameDisplay = (existing.DisplayName || '').trim().toLowerCase() === normalizedDisplay;
    if (sameName) issues.push(`Conflito: RowName já existe (${existing.RowName}).`);
    if (samePid) issues.push(`Conflito: PhenomenonID já existe (${existing.PhenomenonID}).`);
    if (sameDisplay) issues.push(`Conflito: DisplayName já existe (${existing.DisplayName}).`);

    const simName = (existing.RowName || '').toLowerCase();
    if (!sameName && (simName.includes(normalizedName) || normalizedName.includes(simName)) && simName) {
      issues.push(`Semelhança: nome parecido com ${existing.RowName}.`);
    }
  });

  return [...new Set(issues)];
}

function createSpellFromForm(event) {
  event.preventDefault();
  const messagesEl = document.getElementById('createSpellMessages');
  messagesEl.innerHTML = '';

  const category = document.getElementById('newSpellCategory').value;
  const spell = {
    RowName: document.getElementById('newSpellName').value.trim(),
    PhenomenonID: document.getElementById('newSpellPhenomenonId').value.trim(),
    DisplayName: document.getElementById('newSpellDisplayName').value.trim(),
    Priority: toNumber(document.getElementById('newSpellPriority').value, 0),
    RequiredTier: 'Default',
    RequiredElements: document.getElementById('newSpellRequiredElements').value.trim(),
    Req_Heat: toNumber(document.getElementById('newSpellReqHeat').value, 0),
    Req_Pressure: toNumber(document.getElementById('newSpellReqPressure').value, 0),
    Req_Humidity: toNumber(document.getElementById('newSpellReqHumidity').value, 0),
    Req_Density: toNumber(document.getElementById('newSpellReqDensity').value, 0),
    Req_Conductivity: toNumber(document.getElementById('newSpellReqConductivity').value, 0),
    Req_Distortion: toNumber(document.getElementById('newSpellReqDistortion').value, 0),
  };

  const dataset = report[category];
  const issues = findSpellConflicts(spell, dataset);

  const hasHardConflict = issues.some(issue => issue.startsWith('Conflito:'));
  if (issues.length) {
    messagesEl.innerHTML = issues.map(i => `<div class="msg ${i.startsWith('Conflito:') ? 'error' : 'warn'}">${i}</div>`).join('');
  }

  if (hasHardConflict) {
    messagesEl.innerHTML += '<div class="msg error">Feitiço não adicionado por conflito.</div>';
    return;
  }

  dataset.push(spell);
  messagesEl.innerHTML += '<div class="msg ok">Feitiço adicionado na sessão com sucesso.</div>';
  renderDataset();
  event.target.reset();
}

function renderPagination(totalPages) {
  const el = document.getElementById('pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let buttons = [];
  const add = (label, page, active = false) => {
    buttons.push(`<button class="page-btn${active ? ' active' : ''}" data-page="${page}">${label}</button>`);
  };

  if (currentPage > 1) add('<', currentPage - 1);
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
      add(i, i, i === currentPage);
    } else if (buttons[buttons.length - 1] !== '...') {
      buttons.push('<span style="color:var(--text-dim);padding:0 4px">...</span>');
    }
  }
  if (currentPage < totalPages) add('>', currentPage + 1);

  el.innerHTML = buttons.join('');
  el.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      renderCombos();
    });
  });
}

// ============================================================
// Data Tab
// ============================================================
let activeTab = 'elements';

function renderDataset() {
  const rows = report[activeTab] || [];
  const el = document.getElementById('dataset');
  if (!rows.length) { el.innerHTML = '<p style="color:var(--text-dim);padding:16px">Nenhum dado.</p>'; return; }

  const cols = Object.keys(rows[0]);
  el.innerHTML = `<table>
    <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

// ============================================================
// Three.js 3D Spell Visualizer
// ============================================================
let threeInited = false;
let scene, camera, renderer, animationId;
let spellGroup, particleSystems = [], orbs = [];
let selectedElements = new Set();

function initThreeScene() {
  if (threeInited) { onResize(); return; }
  threeInited = true;

  const canvas = document.getElementById('spellCanvas');
  const wrap = canvas.parentElement;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, wrap.clientWidth / wrap.clientHeight, 0.1, 100);
  camera.position.set(0, 2, 6);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);

  // Lights
  const ambientLight = new THREE.AmbientLight(0x333355, 0.5);
  scene.add(ambientLight);
  const pointLight = new THREE.PointLight(0xffffff, 0.8, 20);
  pointLight.position.set(2, 4, 3);
  scene.add(pointLight);

  // Central spell group
  spellGroup = new THREE.Group();
  scene.add(spellGroup);

  // Ground circle
  const groundGeo = new THREE.RingGeometry(1.8, 2.0, 64);
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x7c5cfc, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  scene.add(ground);

  // Mouse interaction
  let isDragging = false, prevX = 0, prevY = 0;
  let rotX = 0.3, rotY = 0;

  canvas.addEventListener('pointerdown', e => { isDragging = true; prevX = e.clientX; prevY = e.clientY; });
  window.addEventListener('pointerup', () => { isDragging = false; });
  window.addEventListener('pointermove', e => {
    if (!isDragging) return;
    rotY += (e.clientX - prevX) * 0.005;
    rotX += (e.clientY - prevY) * 0.005;
    rotX = Math.max(-1, Math.min(1, rotX));
    prevX = e.clientX;
    prevY = e.clientY;
  });

  canvas.addEventListener('wheel', e => {
    camera.position.z = Math.max(3, Math.min(12, camera.position.z + e.deltaY * 0.01));
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('resize', onResize);

  // Element picker
  buildElementPicker();

  // Animation loop
  const clock = new THREE.Clock();
  function animate() {
    animationId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    if (!isDragging) rotY += 0.003;
    spellGroup.rotation.y = rotY;
    spellGroup.rotation.x = rotX;

    // Animate orbs
    orbs.forEach((orb, i) => {
      orb.position.y = Math.sin(t * 1.5 + i * 1.2) * 0.15;
      if (orb.children[0]) orb.children[0].rotation.y = t * 2;
    });

    // Animate particles
    particleSystems.forEach(ps => {
      const positions = ps.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += ps.userData.speeds[i / 3] * 0.02;
        if (positions[i + 1] > 3) positions[i + 1] = -0.5;
      }
      ps.geometry.attributes.position.needsUpdate = true;
      ps.rotation.y = t * 0.5;
    });

    renderer.render(scene, camera);
  }
  animate();
}

function onResize() {
  if (!renderer) return;
  const wrap = document.getElementById('spellCanvas').parentElement;
  camera.aspect = wrap.clientWidth / wrap.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
}

function buildElementPicker() {
  const picker = document.getElementById('elementPicker');
  picker.innerHTML = report.elements.map(e => {
    const color = ELEM[e.RowName]?.color || '#888';
    return `<button class="pick-btn" data-elem="${e.RowName}">
      <div class="pick-orb" style="background:radial-gradient(circle, ${color}aa, ${color}); color:${color}"></div>
      <span>${e.RowName}</span>
    </button>`;
  }).join('');

  picker.querySelectorAll('.pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.elem;
      if (selectedElements.has(name)) {
        selectedElements.delete(name);
        btn.classList.remove('selected');
      } else {
        selectedElements.add(name);
        btn.classList.add('selected');
      }
      updateSpellVisualization();
      updateSpellResult();
    });
  });
}

function updateSpellVisualization() {
  // Clear previous
  while (spellGroup.children.length) spellGroup.remove(spellGroup.children[0]);
  particleSystems.forEach(ps => scene.remove(ps));
  particleSystems = [];
  orbs = [];

  const overlay = document.getElementById('canvasOverlay');
  if (selectedElements.size === 0) {
    overlay.classList.remove('hidden');
    return;
  }
  overlay.classList.add('hidden');

  const elements = [...selectedElements];
  const count = elements.length;
  const radius = Math.min(1.2 + count * 0.15, 2.2);

  // Create element orbs in a circle
  elements.forEach((name, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const color = ELEM[name]?.hex || 0x888888;

    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Glowing sphere
    const geo = new THREE.SphereGeometry(0.22, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.9,
    });
    const sphere = new THREE.Mesh(geo, mat);
    group.add(sphere);

    // Outer glow ring
    const ringGeo = new THREE.TorusGeometry(0.32, 0.02, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.4 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    spellGroup.add(group);
    orbs.push(group);

    // Connection lines to center
    const points = [new THREE.Vector3(x, 0, z), new THREE.Vector3(0, 0, 0)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.25 });
    spellGroup.add(new THREE.Line(lineGeo, lineMat));
  });

  // Central combined orb
  if (count > 0) {
    const avgColor = new THREE.Color(0, 0, 0);
    elements.forEach(name => {
      avgColor.add(new THREE.Color(ELEM[name]?.hex || 0x888888));
    });
    avgColor.multiplyScalar(1 / count);

    const coreGeo = new THREE.SphereGeometry(0.15 + count * 0.04, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
      color: avgColor,
      emissive: avgColor,
      emissiveIntensity: 0.8 + count * 0.1,
      transparent: true,
      opacity: 0.95,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    spellGroup.add(core);

    // Inner glow
    const glowGeo = new THREE.SphereGeometry(0.25 + count * 0.06, 32, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: avgColor,
      transparent: true,
      opacity: 0.15,
    });
    spellGroup.add(new THREE.Mesh(glowGeo, glowMat));
  }

  // Particle systems per element
  elements.forEach(name => {
    const color = ELEM[name]?.hex || 0x888888;
    const particleCount = 40 + count * 10;
    const positions = new Float32Array(particleCount * 3);
    const speeds = [];

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * (radius + 0.5);
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = (Math.random() - 0.3) * 3;
      positions[i * 3 + 2] = Math.sin(angle) * r;
      speeds.push(0.3 + Math.random() * 0.7);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: color,
      size: 0.04 + count * 0.005,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ps = new THREE.Points(geo, mat);
    ps.userData.speeds = speeds;
    scene.add(ps);
    particleSystems.push(ps);
  });
}

function updateSpellResult() {
  const el = document.getElementById('spellResult');
  if (selectedElements.size === 0) {
    el.innerHTML = '<h4>Resultado</h4><p class="result-empty">Nenhum elemento selecionado</p>';
    return;
  }

  // Find matching combo in report
  const selected = [...selectedElements].sort();
  const combo = report.combinations.find(c =>
    c.combo.length === selected.length && selected.every(e => c.combo.includes(e))
  );

  if (!combo) {
    el.innerHTML = '<h4>Resultado</h4><p class="result-empty">Combinacao nao encontrada</p>';
    return;
  }

  const renderCategory = (title, items) => {
    if (!items.length) return `<div class="result-category"><h5>${title}</h5><p class="result-empty">Nenhum</p></div>`;
    return `<div class="result-category">
      <h5>${title}</h5>
      ${items.map((s, i) => `<div class="result-item${i === items.length - 1 ? ' winner' : ''}">${i === items.length - 1 ? '&#9733; ' : ''}${s}</div>`).join('')}
    </div>`;
  };

  el.innerHTML = `
    <h4>Resultado</h4>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px">
      ${selected.map(pill).join('')}
    </div>
    ${renderCategory('Ofensivo', combo.offensive)}
    ${renderCategory('Protetivo', combo.protective)}
    ${renderCategory('Utilitario', combo.utility)}
    ${combo.conflicts.length
      ? `<div class="result-category"><h5 style="color:var(--conflict)">Conflitos</h5>${combo.conflicts.map(c => `<div class="result-item" style="color:var(--conflict)">${c}</div>`).join('')}</div>`
      : '<div style="margin-top:8px"><span class="badge ok">Sem conflitos</span></div>'
    }
  `;
}

function pill(name) {
  return `<span class="elem-pill ${name}">${name}</span>`;
}

// ============================================================
// Init
// ============================================================
async function init() {
  const res = await fetch('data/report.json');
  report = await res.json();

  setupNav();
  renderSummary();
  renderUnreachable();
  renderTierChart();
  renderElementGrid();
  renderCombos();
  renderDataset();

  // Combo filters
  document.getElementById('onlyConflicts').addEventListener('change', () => { currentPage = 1; renderCombos(); });
  document.getElementById('searchCombo').addEventListener('input', () => { currentPage = 1; renderCombos(); });
  document.getElementById('filterSize').addEventListener('change', () => { currentPage = 1; renderCombos(); });
  document.getElementById('exportSelectedBtn').addEventListener('click', exportSelectedSpells);
  document.getElementById('createSpellForm').addEventListener('submit', createSpellFromForm);
  document.getElementById('selectAllVisibleCombos').addEventListener('change', event => {
    const filtered = getFilteredCombos();
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);
    pageRows.forEach(c => {
      const key = comboKey(c.combo);
      if (event.target.checked) {
        selectedComboKeys.add(key);
      } else {
        selectedComboKeys.delete(key);
      }
    });
    renderCombos();
  });

  // Data tabs
  document.querySelectorAll('#dataTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dataTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderDataset();
    });
  });
}

init();
