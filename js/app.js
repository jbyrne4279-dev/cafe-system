/* North Herts Museum Café — Daily Records (base app)
 *
 * Mirrors the café's paper forms:
 *   1. Fridge & Freezer Temperature Reading Chart (weekly grid, AM/PM readings)
 *   2. Daily Cleaning Tasks (weekly grid)
 *   3. Daily Diary — FSA "Safer Food, Better Business"
 *   4. Hot Food temperatures (extra log)
 *
 * The unit list and cleaning tasks are FIXED (taken straight from the café's
 * sheets) so staff never have to choose a fridge/freezer or manage the list —
 * they just enter the temperature or tick a task. To change the fixed lists,
 * edit UNITS / TASKS below.
 *
 * Everything is stored per WEEK (keyed by the Monday it commences) in the
 * browser via localStorage, so it works with no server.
 */

const STORE_KEY = 'nhmc-cafe-records-v3';

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

// Fixed units from the café's temperature chart (stable ids so readings carry
// across weeks). Type drives the colour thresholds only.
const UNITS = [
  { id: 'double-fridge', name: 'Double Fridge', type: 'fridge' },
  { id: 'double-freezer', name: 'Double Freezer', type: 'freezer' },
  { id: 'storage-freezer', name: 'Storage Freezer', type: 'freezer' },
  { id: 'display-cabinet', name: 'Display Cabinet', type: 'fridge' },
  { id: 'milk-fridge', name: 'Milk Fridge', type: 'fridge' },
  { id: 'drinks-fridge', name: 'Drinks Fridge', type: 'fridge' },
  { id: 'ice-cream-freezer', name: 'Ice cream Freezer', type: 'freezer' },
];

// Fixed cleaning tasks from the café's cleaning sheet.
const TASKS = [
  { id: 'walls-doors-canopy', name: 'Walls, Doors and Canopy' },
  { id: 'equipment-surfaces', name: 'Equipment and Surfaces' },
  { id: 'floors-drains-gullys', name: "Floors, Drains and Gully's" },
  { id: 'coffee-machine-exterior', name: 'Coffee Machine Exterior (use blank head)' },
  { id: 'sinks-shelving', name: 'Sinks and Shelving' },
  { id: 'waste-bins', name: 'Waste Bins' },
  { id: 'microwave', name: 'Microwave' },
  { id: 'fridges-contact-points', name: 'Fridges and Contact Points' },
  { id: 'dishwasher', name: 'Dishwasher' },
  { id: 'chopping-boards', name: 'Chopping Boards' },
  { id: 'labels-check', name: 'Labels check café and kitchen' },
];

const HOT_RULES = {
  cooking: (t) => t >= 75,
  reheating: (t) => t >= 75,
  'hot-holding': (t) => t >= 63,
};

/* ---------- date helpers ---------- */

function toISO(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function mondayOf(iso) {
  const d = new Date(iso + 'T00:00:00');
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toISO(d);
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
}
function fmtDay(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function todayISO() { return toISO(new Date()); }
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------- storage ---------- */

function loadAll() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}
function saveAll(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }

function emptyDayMap(fill) {
  const m = {};
  DAYS.forEach((d) => { m[d.key] = typeof fill === 'function' ? fill() : fill; });
  return m;
}

function blankWeek() {
  const temps = {};
  UNITS.forEach((u) => { temps[u.id] = emptyDayMap(() => ({ am: '', pm: '' })); });
  const cleaning = {};
  TASKS.forEach((t) => { cleaning[t.id] = emptyDayMap(''); });
  const diary = {};
  DAYS.forEach((d) => { diary[d.key] = { notes: '', opening: false, closing: false, name: '', signed: '' }; });
  return { temps, officer: emptyDayMap(''), cleaning, diary, hotfood: [] };
}

function getWeek(monday) {
  const all = loadAll();
  if (!all[monday]) { all[monday] = blankWeek(); saveAll(all); }
  const w = all[monday];
  // Guards so a partially-saved week (or a newly added unit/task) always has slots.
  w.temps = w.temps || {};
  w.cleaning = w.cleaning || {};
  w.officer = w.officer || emptyDayMap('');
  w.diary = w.diary || {};
  w.hotfood = w.hotfood || [];
  UNITS.forEach((u) => { if (!w.temps[u.id]) w.temps[u.id] = emptyDayMap(() => ({ am: '', pm: '' })); });
  TASKS.forEach((t) => { if (!w.cleaning[t.id]) w.cleaning[t.id] = emptyDayMap(''); });
  DAYS.forEach((d) => { if (!w.diary[d.key]) w.diary[d.key] = { notes: '', opening: false, closing: false, name: '', signed: '' }; });
  return w;
}

function saveWeek(monday, week) {
  const all = loadAll();
  all[monday] = week;
  saveAll(all);
}

/* ---------- state ---------- */

let currentMonday = mondayOf(todayISO());
function week() { return getWeek(currentMonday); }
function commit(w) { saveWeek(currentMonday, w); }

/* ---------- temperature evaluation ---------- */

function evalTemp(type, value) {
  if (value === '' || value === null || isNaN(Number(value))) return '';
  const t = Number(value);
  if (type === 'freezer') {
    if (t <= -18) return 'ok';
    if (t <= -12) return 'watch';
    return 'alert';
  }
  if (t <= 5) return 'ok';
  if (t <= 8) return 'watch';
  return 'alert';
}
function typeLabel(type) { return type === 'freezer' ? 'Freezer' : 'Fridge'; }
function typeTarget(type) { return type === 'freezer' ? '≤ -18°C' : '0–5°C'; }

/* ---------- renderers ---------- */

function dayHeaders() {
  return DAYS.map((d, i) => `<th>${d.label}<br><span style="font-weight:400;color:var(--muted)">${fmtDay(addDays(currentMonday, i))}</span></th>`).join('');
}

function renderTemps() {
  const w = week();
  let rows = '';
  UNITS.forEach((u) => {
    let cells = '';
    DAYS.forEach((d) => {
      const rec = w.temps[u.id][d.key];
      const amCls = evalTemp(u.type, rec.am);
      const pmCls = evalTemp(u.type, rec.pm);
      cells += `<td class="temp-cell">
        <div class="temp-slot"><label>AM</label><input class="${amCls}" data-role="temp" data-unit="${u.id}" data-day="${d.key}" data-slot="am" value="${esc(rec.am)}" inputmode="decimal" placeholder="—" /></div>
        <div class="temp-slot"><label>PM</label><input class="${pmCls}" data-role="temp" data-unit="${u.id}" data-day="${d.key}" data-slot="pm" value="${esc(rec.pm)}" inputmode="decimal" placeholder="—" /></div>
      </td>`;
    });
    rows += `<tr>
      <td class="rowhead"><div class="unit-label">
        <span class="unit-label__name">${esc(u.name)}</span>
        <span class="unit-badge unit-badge--${u.type}">${typeLabel(u.type)} · ${typeTarget(u.type)}</span>
      </div></td>${cells}</tr>`;
  });

  let officerCells = '';
  DAYS.forEach((d) => {
    officerCells += `<td><input class="day-input" data-role="officer" data-day="${d.key}" value="${esc(w.officer[d.key] || '')}" maxlength="4" placeholder="—" /></td>`;
  });
  rows += `<tr class="officer-row"><td class="rowhead"><span class="unit-label__name">Officer Initials</span></td>${officerCells}</tr>`;

  document.getElementById('tempGrid').innerHTML =
    `<table class="week-table temp-table"><thead><tr><th class="rowhead">Unit</th>${dayHeaders()}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCleaning() {
  const w = week();
  let rows = '';
  TASKS.forEach((t) => {
    let cells = '';
    DAYS.forEach((d) => {
      const val = w.cleaning[t.id][d.key] || '';
      cells += `<td class="clean-cell ${val ? 'done' : ''}" data-role="clean-cell" data-task="${t.id}" data-day="${d.key}">
        <input data-role="clean" data-task="${t.id}" data-day="${d.key}" value="${esc(val)}" maxlength="4" placeholder="" />
      </td>`;
    });
    rows += `<tr>
      <td class="rowhead"><div class="unit-label"><span class="unit-label__name">${esc(t.name)}</span></div></td>${cells}</tr>`;
  });
  document.getElementById('cleaningGrid').innerHTML =
    `<table class="week-table"><thead><tr><th class="rowhead">Task</th>${dayHeaders()}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderDiary() {
  const w = week();
  const cards = DAYS.map((d, i) => {
    const e = w.diary[d.key];
    return `<div class="diary-card">
      <h3>${d.label} <span style="font-weight:400;color:var(--muted);font-size:13px">${fmtDay(addDays(currentMonday, i))}</span></h3>
      <p class="diary-q">Any problems or changes — what did you do?</p>
      <textarea data-role="diary" data-day="${d.key}" data-field="notes" placeholder="e.g. Closed / No issues">${esc(e.notes)}</textarea>
      <div class="diary-checks">
        <label><input type="checkbox" data-role="diary" data-day="${d.key}" data-field="opening" ${e.opening ? 'checked' : ''}/> Opening checks</label>
        <label><input type="checkbox" data-role="diary" data-day="${d.key}" data-field="closing" ${e.closing ? 'checked' : ''}/> Closing checks</label>
      </div>
      <div class="diary-sign">
        <input data-role="diary" data-day="${d.key}" data-field="name" placeholder="Name" value="${esc(e.name)}" />
        <input data-role="diary" data-day="${d.key}" data-field="signed" placeholder="Signed" value="${esc(e.signed)}" />
      </div>
      <p class="diary-foot">Our safe methods were followed and effectively supervised today.</p>
    </div>`;
  }).join('');
  document.getElementById('diaryCards').innerHTML = cards;
}

function renderHotfood() {
  const w = week();
  const daySel = document.getElementById('hotfoodDay');
  if (daySel && !daySel.options.length) {
    daySel.innerHTML = DAYS.map((d) => `<option value="${d.key}">${d.label}</option>`).join('');
  }
  const tbody = document.querySelector('#hotfoodTable tbody');
  const empty = document.getElementById('hotfoodEmpty');
  tbody.innerHTML = '';
  empty.style.display = w.hotfood.length ? 'none' : 'block';
  w.hotfood.forEach((r) => {
    const ok = HOT_RULES[r.stage] ? HOT_RULES[r.stage](Number(r.temp)) : true;
    const label = (DAYS.find((d) => d.key === r.day) || {}).label || r.day;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(label)}</td>
      <td>${esc(r.item)}</td>
      <td>${esc(r.stage)}</td>
      <td style="font-weight:700">${esc(r.temp)}&deg;C</td>
      <td>${esc(r.time || '—')}</td>
      <td>${esc(r.by || '—')}</td>
      <td><span class="badge ${ok ? 'badge--ok' : 'badge--bad'}">${ok ? 'OK' : 'Too low'}</span></td>
      <td><button class="row-del" data-role="remove-hotfood" data-id="${r.id}" title="Delete">&times;</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderSummary() {
  const w = week();
  let readings = 0, alerts = 0, cleanDone = 0, cleanTotal = 0, diarySigned = 0;
  const perDay = {};
  DAYS.forEach((d) => { perDay[d.key] = { readings: 0, alerts: 0, clean: 0, signed: false }; });

  UNITS.forEach((u) => {
    DAYS.forEach((d) => {
      const rec = w.temps[u.id][d.key];
      ['am', 'pm'].forEach((slot) => {
        if (rec[slot] !== '' && rec[slot] != null && !isNaN(Number(rec[slot]))) {
          readings++; perDay[d.key].readings++;
          if (evalTemp(u.type, rec[slot]) === 'alert') { alerts++; perDay[d.key].alerts++; }
        }
      });
    });
  });

  TASKS.forEach((t) => {
    DAYS.forEach((d) => {
      cleanTotal++;
      if (w.cleaning[t.id][d.key]) { cleanDone++; perDay[d.key].clean++; }
    });
  });

  DAYS.forEach((d) => {
    const e = w.diary[d.key];
    if (e.name && e.signed) { diarySigned++; perDay[d.key].signed = true; }
  });

  document.getElementById('summaryStats').innerHTML = `
    <div class="stat"><p class="stat__label">Temperature readings</p><p class="stat__value">${readings}</p></div>
    <div class="stat ${alerts ? 'stat--alert' : 'stat--good'}"><p class="stat__label">Out-of-range alerts</p><p class="stat__value">${alerts}</p></div>
    <div class="stat"><p class="stat__label">Cleaning tasks done</p><p class="stat__value">${cleanDone}/${cleanTotal}</p></div>
    <div class="stat ${diarySigned === 7 ? 'stat--good' : ''}"><p class="stat__label">Diary days signed</p><p class="stat__value">${diarySigned}/7</p></div>`;

  const tbody = document.querySelector('#summaryTable tbody');
  tbody.innerHTML = DAYS.map((d, i) => {
    const p = perDay[d.key];
    return `<tr>
      <td>${d.label} <span style="color:var(--muted)">${fmtDay(addDays(currentMonday, i))}</span></td>
      <td>${p.readings}</td>
      <td>${p.alerts ? `<span class="badge badge--bad">${p.alerts}</span>` : '0'}</td>
      <td>${p.clean}/${TASKS.length}</td>
      <td>${p.signed ? '<span class="badge badge--ok">Signed</span>' : '<span class="badge badge--bad">—</span>'}</td>
    </tr>`;
  }).join('');
}

function renderWeekLabel() {
  document.getElementById('weekDate').value = currentMonday;
  document.getElementById('weekRange').textContent =
    `${fmtDay(currentMonday)} – ${fmtDay(addDays(currentMonday, 6))} ${new Date(currentMonday + 'T00:00:00').getFullYear()}`;
}

function renderAll() {
  renderWeekLabel();
  renderTemps();
  renderCleaning();
  renderDiary();
  renderHotfood();
  renderSummary();
}

/* ---------- events ---------- */

function initTabs() {
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('is-active');
    if (btn.dataset.tab === 'summary') renderSummary();
  });
}

function initWeekNav() {
  const input = document.getElementById('weekDate');
  input.addEventListener('change', () => { currentMonday = mondayOf(input.value || todayISO()); renderAll(); });
  document.getElementById('prevWeek').addEventListener('click', () => { currentMonday = addDays(currentMonday, -7); renderAll(); });
  document.getElementById('nextWeek').addEventListener('click', () => { currentMonday = addDays(currentMonday, 7); renderAll(); });
}

// Temperature grid: only temp readings and officer initials are editable.
function initTempGrid() {
  document.getElementById('tempGrid').addEventListener('input', (e) => {
    const el = e.target;
    const w = week();
    if (el.dataset.role === 'temp') {
      const u = UNITS.find((x) => x.id === el.dataset.unit);
      w.temps[el.dataset.unit][el.dataset.day][el.dataset.slot] = el.value.trim();
      commit(w);
      el.className = evalTemp(u ? u.type : 'fridge', el.value.trim());
    } else if (el.dataset.role === 'officer') {
      w.officer[el.dataset.day] = el.value.toUpperCase();
      el.value = w.officer[el.dataset.day];
      commit(w);
    }
  });
}

function initCleaningGrid() {
  const grid = document.getElementById('cleaningGrid');
  grid.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.role !== 'clean') return;
    const w = week();
    w.cleaning[el.dataset.task][el.dataset.day] = el.value.toUpperCase();
    el.value = w.cleaning[el.dataset.task][el.dataset.day];
    el.closest('.clean-cell').classList.toggle('done', !!el.value);
    commit(w);
  });
  // Tap an empty cell (not the input) to quick-tick it.
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('.clean-cell');
    if (cell && e.target === cell) {
      const input = cell.querySelector('input');
      if (!input.value) { input.value = '✓'; input.dispatchEvent(new Event('input', { bubbles: true })); }
      input.focus();
    }
  });
}

function initDiary() {
  const cards = document.getElementById('diaryCards');
  const write = (el) => {
    const w = week();
    w.diary[el.dataset.day][el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
    commit(w);
  };
  cards.addEventListener('input', (e) => { if (e.target.dataset.role === 'diary') write(e.target); });
  cards.addEventListener('change', (e) => { if (e.target.dataset.role === 'diary' && e.target.type === 'checkbox') write(e.target); });
}

function initHotfood() {
  document.getElementById('hotfoodForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const w = week();
    w.hotfood.push({
      id: uid(),
      day: f.day.value,
      item: f.item.value.trim(),
      stage: f.stage.value,
      temp: f.temp.value,
      time: f.time.value,
      by: f.by.value.trim().toUpperCase(),
    });
    commit(w);
    f.reset();
    renderHotfood();
  });
  document.querySelector('#hotfoodTable').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="remove-hotfood"]');
    if (!btn) return;
    const w = week();
    w.hotfood = w.hotfood.filter((x) => x.id !== btn.dataset.id);
    commit(w);
    renderHotfood();
  });
}

function initToolbar() {
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ weekCommencing: currentMonday, ...week() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nhmc-cafe-${currentMonday}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById('printBtn').addEventListener('click', () => window.print());
}

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  const timeField = document.querySelector('#hotfoodForm input[type="time"]');
  if (timeField) timeField.value = nowTime();
  initWeekNav();
  initTabs();
  initTempGrid();
  initCleaningGrid();
  initDiary();
  initHotfood();
  initToolbar();
  renderAll();
});
