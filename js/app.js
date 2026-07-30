/* North Herts Museum Café — Daily Records (base app)
 *
 * Built to mirror the café's paper forms:
 *   1. Fridge & Freezer Temperature Reading Chart (weekly grid, AM/PM readings)
 *   2. Daily Cleaning Tasks (weekly grid)
 *   3. Daily Diary — FSA "Safer Food, Better Business"
 *   4. Hot Food temperatures (extra log)
 *
 * Everything is stored per WEEK (keyed by the Monday it commences) in the
 * browser via localStorage, so it works with no server. Swap the storage
 * layer later for cloud sync without changing the rest of the app.
 */

const STORE_KEY = 'nhmc-cafe-records-v2';

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

// Default units, taken from the café's temperature chart.
const DEFAULT_UNITS = [
  { name: 'Double Fridge', type: 'fridge' },
  { name: 'Double Freezer', type: 'freezer' },
  { name: 'Storage Freezer', type: 'freezer' },
  { name: 'Display Cabinet', type: 'fridge' },
  { name: 'Milk Fridge', type: 'fridge' },
  { name: 'Drinks Fridge', type: 'fridge' },
  { name: 'Ice cream Freezer', type: 'freezer' },
];

// Default cleaning tasks, taken from the café's cleaning sheet.
const DEFAULT_TASKS = [
  'Walls, Doors and Canopy',
  'Equipment and Surfaces',
  "Floors, Drains and Gully's",
  'Coffee Machine Exterior (use blank head)',
  'Sinks and Shelving',
  'Waste Bins',
  'Microwave',
  'Fridges and Contact Points',
  'Dishwasher',
  'Chopping Boards',
  'Labels check café and kitchen',
];

// Hot food core-temperature rules.
const HOT_RULES = {
  cooking: (t) => t >= 75,
  reheating: (t) => t >= 75,
  'hot-holding': (t) => t >= 63,
};

/* ---------- date helpers ---------- */

function toISO(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Monday of the week containing the given ISO date.
function mondayOf(iso) {
  const d = new Date(iso + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // 0 = Monday
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
  const units = DEFAULT_UNITS.map((u) => ({ id: uid(), name: u.name, type: u.type }));
  const tasks = DEFAULT_TASKS.map((t) => ({ id: uid(), name: t }));
  const temps = {};
  units.forEach((u) => { temps[u.id] = emptyDayMap(() => ({ am: '', pm: '' })); });
  const cleaning = {};
  tasks.forEach((t) => { cleaning[t.id] = emptyDayMap(''); });
  const diary = {};
  DAYS.forEach((d) => { diary[d.key] = { notes: '', opening: false, closing: false, name: '', signed: '' }; });
  return { units, tasks, temps, officer: emptyDayMap(''), cleaning, diary, hotfood: [] };
}

function getWeek(monday) {
  const all = loadAll();
  if (!all[monday]) { all[monday] = blankWeek(); saveAll(all); }
  const w = all[monday];
  // Forward-compatible guards in case older saved weeks are missing a field.
  w.units = w.units || [];
  w.tasks = w.tasks || [];
  w.temps = w.temps || {};
  w.officer = w.officer || emptyDayMap('');
  w.cleaning = w.cleaning || {};
  w.diary = w.diary || {};
  w.hotfood = w.hotfood || [];
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
  // fridge
  if (t <= 5) return 'ok';
  if (t <= 8) return 'watch';
  return 'alert';
}

/* ---------- renderers ---------- */

function dayHeaders() {
  return DAYS.map((d) => `<th>${d.label}<br><span style="font-weight:400;color:var(--muted)">${fmtDay(addDays(currentMonday, DAYS.indexOf(d)))}</span></th>`).join('');
}

function renderTemps() {
  const w = week();
  let rows = '';
  w.units.forEach((u) => {
    let cells = '';
    DAYS.forEach((d) => {
      const rec = w.temps[u.id]?.[d.key] || { am: '', pm: '' };
      const amCls = evalTemp(u.type, rec.am);
      const pmCls = evalTemp(u.type, rec.pm);
      cells += `<td class="temp-cell">
        <div class="temp-slot"><label>AM</label><input class="${amCls}" data-role="temp" data-unit="${u.id}" data-day="${d.key}" data-slot="am" value="${esc(rec.am)}" inputmode="decimal" /></div>
        <div class="temp-slot"><label>PM</label><input class="${pmCls}" data-role="temp" data-unit="${u.id}" data-day="${d.key}" data-slot="pm" value="${esc(rec.pm)}" inputmode="decimal" /></div>
      </td>`;
    });
    rows += `<tr>
      <td class="rowhead"><div class="unit-cell">
        <input class="uname" data-role="unit-name" data-unit="${u.id}" value="${esc(u.name)}" />
        <select class="utype" data-role="unit-type" data-unit="${u.id}">
          <option value="fridge" ${u.type === 'fridge' ? 'selected' : ''}>Fridge</option>
          <option value="freezer" ${u.type === 'freezer' ? 'selected' : ''}>Freezer</option>
        </select>
        <button class="row-remove" data-role="remove-unit" data-unit="${u.id}" title="Remove unit">&times;</button>
      </div></td>${cells}</tr>`;
  });

  // Officer initials row
  let officerCells = '';
  DAYS.forEach((d) => {
    officerCells += `<td><input class="day-input" data-role="officer" data-day="${d.key}" value="${esc(w.officer[d.key] || '')}" maxlength="4" placeholder="—" /></td>`;
  });
  rows += `<tr class="officer-row"><td class="rowhead">Officer Initials</td>${officerCells}</tr>`;

  document.getElementById('tempGrid').innerHTML =
    `<table class="week-table temp-table"><thead><tr><th class="rowhead">Unit</th>${dayHeaders()}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCleaning() {
  const w = week();
  let rows = '';
  w.tasks.forEach((t) => {
    let cells = '';
    DAYS.forEach((d) => {
      const val = w.cleaning[t.id]?.[d.key] || '';
      cells += `<td class="clean-cell ${val ? 'done' : ''}" data-role="clean-cell" data-task="${t.id}" data-day="${d.key}">
        <input data-role="clean" data-task="${t.id}" data-day="${d.key}" value="${esc(val)}" maxlength="4" placeholder="" />
      </td>`;
    });
    rows += `<tr>
      <td class="rowhead"><div class="unit-cell">
        <input class="uname" data-role="task-name" data-task="${t.id}" value="${esc(t.name)}" />
        <button class="row-remove" data-role="remove-task" data-task="${t.id}" title="Remove task">&times;</button>
      </div></td>${cells}</tr>`;
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
  // keep the day dropdown in sync
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

  w.units.forEach((u) => {
    DAYS.forEach((d) => {
      const rec = w.temps[u.id]?.[d.key] || {};
      ['am', 'pm'].forEach((slot) => {
        if (rec[slot] !== '' && rec[slot] != null && !isNaN(Number(rec[slot]))) {
          readings++; perDay[d.key].readings++;
          if (evalTemp(u.type, rec[slot]) === 'alert') { alerts++; perDay[d.key].alerts++; }
        }
      });
    });
  });

  w.tasks.forEach((t) => {
    DAYS.forEach((d) => {
      cleanTotal++;
      if (w.cleaning[t.id]?.[d.key]) { cleanDone++; perDay[d.key].clean++; }
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
      <td>${p.clean}/${w.tasks.length}</td>
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
  input.addEventListener('change', () => {
    currentMonday = mondayOf(input.value || todayISO());
    renderAll();
  });
  document.getElementById('prevWeek').addEventListener('click', () => { currentMonday = addDays(currentMonday, -7); renderAll(); });
  document.getElementById('nextWeek').addEventListener('click', () => { currentMonday = addDays(currentMonday, 7); renderAll(); });
}

// Delegated handler for the temperature grid.
function initTempGrid() {
  const grid = document.getElementById('tempGrid');
  grid.addEventListener('input', (e) => {
    const el = e.target;
    const role = el.dataset.role;
    const w = week();
    if (role === 'temp') {
      const u = w.units.find((x) => x.id === el.dataset.unit);
      w.temps[el.dataset.unit] = w.temps[el.dataset.unit] || emptyDayMap(() => ({ am: '', pm: '' }));
      w.temps[el.dataset.unit][el.dataset.day][el.dataset.slot] = el.value.trim();
      commit(w);
      el.className = evalTemp(u ? u.type : 'fridge', el.value.trim());
    } else if (role === 'unit-name') {
      const u = w.units.find((x) => x.id === el.dataset.unit);
      if (u) { u.name = el.value; commit(w); }
    } else if (role === 'officer') {
      w.officer[el.dataset.day] = el.value.toUpperCase();
      el.value = w.officer[el.dataset.day];
      commit(w);
    }
  });
  grid.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.role !== 'unit-type') return;
    const w = week();
    const u = w.units.find((x) => x.id === el.dataset.unit);
    if (u) { u.type = el.value; commit(w); renderTemps(); }
  });
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="remove-unit"]');
    if (!btn) return;
    const w = week();
    if (!confirm('Remove this unit and its readings for this week?')) return;
    w.units = w.units.filter((x) => x.id !== btn.dataset.unit);
    delete w.temps[btn.dataset.unit];
    commit(w);
    renderTemps();
  });
}

function initCleaningGrid() {
  const grid = document.getElementById('cleaningGrid');
  grid.addEventListener('input', (e) => {
    const el = e.target;
    const w = week();
    if (el.dataset.role === 'clean') {
      w.cleaning[el.dataset.task] = w.cleaning[el.dataset.task] || emptyDayMap('');
      w.cleaning[el.dataset.task][el.dataset.day] = el.value.toUpperCase();
      el.value = w.cleaning[el.dataset.task][el.dataset.day];
      el.closest('.clean-cell').classList.toggle('done', !!el.value);
      commit(w);
    } else if (el.dataset.role === 'task-name') {
      const t = w.tasks.find((x) => x.id === el.dataset.task);
      if (t) { t.name = el.value; commit(w); }
    }
  });
  // Tap an empty cell (not the input) to quick-tick it.
  grid.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-role="remove-task"]');
    if (removeBtn) {
      const w = week();
      if (!confirm('Remove this cleaning task for this week?')) return;
      w.tasks = w.tasks.filter((x) => x.id !== removeBtn.dataset.task);
      delete w.cleaning[removeBtn.dataset.task];
      commit(w);
      renderCleaning();
      return;
    }
    const cell = e.target.closest('.clean-cell');
    if (cell && e.target === cell) {
      const input = cell.querySelector('input');
      if (!input.value) { input.value = '✓'; input.dispatchEvent(new Event('input', { bubbles: true })); }
      input.focus();
    }
  });
}

function initDiary() {
  document.getElementById('diaryCards').addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.role !== 'diary') return;
    const w = week();
    const field = el.dataset.field;
    w.diary[el.dataset.day][field] = el.type === 'checkbox' ? el.checked : el.value;
    commit(w);
  });
  document.getElementById('diaryCards').addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.role !== 'diary' || el.type !== 'checkbox') return;
    const w = week();
    w.diary[el.dataset.day][el.dataset.field] = el.checked;
    commit(w);
  });
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

function initAddForms() {
  document.getElementById('addUnitForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const w = week();
    const id = uid();
    w.units.push({ id, name: f.name.value.trim(), type: f.type.value });
    w.temps[id] = emptyDayMap(() => ({ am: '', pm: '' }));
    commit(w);
    f.reset();
    renderTemps();
  });
  document.getElementById('addTaskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const w = week();
    const id = uid();
    w.tasks.push({ id, name: f.name.value.trim() });
    w.cleaning[id] = emptyDayMap('');
    commit(w);
    f.reset();
    renderCleaning();
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
  initAddForms();
  initToolbar();
  renderAll();
});
