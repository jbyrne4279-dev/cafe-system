/* Café Daily Records - base app
 * All records are stored in the browser (localStorage), keyed by date.
 * Data model per day:
 * {
 *   fridge:   [{ id, unit, type, temp, time, by }],
 *   hotfood:  [{ id, item, stage, temp, time, by }],
 *   cleaning: [{ id, task, done, by }],
 *   summary:  { notes, by, savedAt }
 * }
 */

const STORE_KEY = 'cafe-daily-records';

// Temperature rules used to flag readings as OK / out of range.
const RULES = {
  fridge:  (t) => t >= 0 && t <= 5,      // fridges: 0–5°C
  freezer: (t) => t <= -18,              // freezers: -18°C or below
  cooking:     (t) => t >= 75,           // core cook temp
  reheating:   (t) => t >= 75,           // core reheat temp
  'hot-holding': (t) => t >= 63,         // hot holding
};

// Default cleaning tasks seeded onto a fresh day.
const DEFAULT_TASKS = [
  'Wipe down all counters & surfaces',
  'Clean & sanitise coffee machine',
  'Empty & clean bins',
  'Sweep & mop floors',
  'Clean toilets & check supplies',
  'Wash & sanitise food prep areas',
];

/* ---------- storage helpers ---------- */

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAll(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function blankDay() {
  return {
    fridge: [],
    hotfood: [],
    cleaning: DEFAULT_TASKS.map((task) => ({ id: uid(), task, done: false, by: '' })),
    summary: { notes: '', by: '', savedAt: '' },
  };
}

function getDay(date) {
  const all = loadAll();
  if (!all[date]) {
    all[date] = blankDay();
    saveAll(all);
  }
  return all[date];
}

function setDay(date, day) {
  const all = loadAll();
  all[date] = day;
  saveAll(all);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------- state ---------- */

let currentDate = todayISO();

/* ---------- rendering ---------- */

function renderFridge() {
  const day = getDay(currentDate);
  const tbody = document.querySelector('#fridgeTable tbody');
  const empty = document.getElementById('fridgeEmpty');
  tbody.innerHTML = '';
  empty.style.display = day.fridge.length ? 'none' : 'block';

  day.fridge.forEach((r) => {
    const ok = RULES[r.type] ? RULES[r.type](Number(r.temp)) : true;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.unit)}</td>
      <td>${esc(r.type)}</td>
      <td class="temp-cell">${esc(r.temp)}&deg;C</td>
      <td>${esc(r.time)}</td>
      <td>${esc(r.by || '—')}</td>
      <td><span class="badge ${ok ? 'badge--ok' : 'badge--bad'}">${ok ? 'OK' : 'Out of range'}</span></td>
      <td><button class="row-del" data-cat="fridge" data-id="${r.id}" title="Delete">&times;</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderHotfood() {
  const day = getDay(currentDate);
  const tbody = document.querySelector('#hotfoodTable tbody');
  const empty = document.getElementById('hotfoodEmpty');
  tbody.innerHTML = '';
  empty.style.display = day.hotfood.length ? 'none' : 'block';

  day.hotfood.forEach((r) => {
    const ok = RULES[r.stage] ? RULES[r.stage](Number(r.temp)) : true;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.item)}</td>
      <td>${esc(r.stage)}</td>
      <td class="temp-cell">${esc(r.temp)}&deg;C</td>
      <td>${esc(r.time)}</td>
      <td>${esc(r.by || '—')}</td>
      <td><span class="badge ${ok ? 'badge--ok' : 'badge--bad'}">${ok ? 'OK' : 'Too low'}</span></td>
      <td><button class="row-del" data-cat="hotfood" data-id="${r.id}" title="Delete">&times;</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderCleaning() {
  const day = getDay(currentDate);
  const list = document.getElementById('cleaningList');
  const empty = document.getElementById('cleaningEmpty');
  list.innerHTML = '';
  empty.style.display = day.cleaning.length ? 'none' : 'block';

  day.cleaning.forEach((t) => {
    const li = document.createElement('li');
    if (t.done) li.classList.add('done');
    li.innerHTML = `
      <input type="checkbox" data-id="${t.id}" ${t.done ? 'checked' : ''} />
      <span class="task-name">${esc(t.task)}</span>
      <input class="task-initials" data-id="${t.id}" value="${esc(t.by || '')}" placeholder="Initials" maxlength="4" />
      <button class="row-del" data-cat="cleaning" data-id="${t.id}" title="Remove">&times;</button>`;
    list.appendChild(li);
  });
}

function renderSummary() {
  const day = getDay(currentDate);
  const grid = document.getElementById('summaryStats');

  const fridgeBad = day.fridge.filter((r) => RULES[r.type] && !RULES[r.type](Number(r.temp))).length;
  const hotBad = day.hotfood.filter((r) => RULES[r.stage] && !RULES[r.stage](Number(r.temp))).length;
  const tasksDone = day.cleaning.filter((t) => t.done).length;
  const totalAlerts = fridgeBad + hotBad;

  grid.innerHTML = `
    <div class="stat"><p class="stat__label">Temperature readings</p><p class="stat__value">${day.fridge.length + day.hotfood.length}</p></div>
    <div class="stat"><p class="stat__label">Cleaning tasks done</p><p class="stat__value">${tasksDone}/${day.cleaning.length}</p></div>
    <div class="stat ${totalAlerts ? 'stat--alert' : 'stat--good'}"><p class="stat__label">Out-of-range alerts</p><p class="stat__value">${totalAlerts}</p></div>`;

  document.getElementById('summaryNotes').value = day.summary.notes || '';
  document.getElementById('summaryBy').value = day.summary.by || '';
  document.getElementById('summarySaved').textContent = day.summary.savedAt
    ? `Last saved ${new Date(day.summary.savedAt).toLocaleString()}`
    : '';
}

function renderAll() {
  renderFridge();
  renderHotfood();
  renderCleaning();
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

function initForms() {
  document.getElementById('fridgeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const day = getDay(currentDate);
    day.fridge.push({
      id: uid(),
      unit: f.unit.value.trim(),
      type: f.type.value,
      temp: f.temp.value,
      time: f.time.value,
      by: f.by.value.trim().toUpperCase(),
    });
    setDay(currentDate, day);
    f.reset();
    renderFridge();
  });

  document.getElementById('hotfoodForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const day = getDay(currentDate);
    day.hotfood.push({
      id: uid(),
      item: f.item.value.trim(),
      stage: f.stage.value,
      temp: f.temp.value,
      time: f.time.value,
      by: f.by.value.trim().toUpperCase(),
    });
    setDay(currentDate, day);
    f.reset();
    renderHotfood();
  });

  document.getElementById('cleaningForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const day = getDay(currentDate);
    day.cleaning.push({ id: uid(), task: f.task.value.trim(), done: false, by: '' });
    setDay(currentDate, day);
    f.reset();
    renderCleaning();
  });

  document.getElementById('saveSummary').addEventListener('click', () => {
    const day = getDay(currentDate);
    day.summary = {
      notes: document.getElementById('summaryNotes').value,
      by: document.getElementById('summaryBy').value.trim(),
      savedAt: new Date().toISOString(),
    };
    setDay(currentDate, day);
    renderSummary();
  });
}

function initListInteractions() {
  // Delete buttons (event-delegated across the app)
  document.querySelector('.app-main').addEventListener('click', (e) => {
    const del = e.target.closest('.row-del');
    if (!del) return;
    const { cat, id } = del.dataset;
    const day = getDay(currentDate);
    day[cat] = day[cat].filter((x) => x.id !== id);
    setDay(currentDate, day);
    renderAll();
  });

  // Cleaning checkboxes + initials
  const list = document.getElementById('cleaningList');
  list.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const day = getDay(currentDate);
    const task = day.cleaning.find((t) => t.id === e.target.dataset.id);
    if (task) task.done = e.target.checked;
    setDay(currentDate, day);
    renderCleaning();
  });
  list.addEventListener('input', (e) => {
    if (!e.target.classList.contains('task-initials')) return;
    const day = getDay(currentDate);
    const task = day.cleaning.find((t) => t.id === e.target.dataset.id);
    if (task) task.by = e.target.value.trim().toUpperCase();
    setDay(currentDate, day);
  });
}

function initDate() {
  const input = document.getElementById('recordDate');
  input.value = currentDate;
  input.addEventListener('change', () => {
    currentDate = input.value || todayISO();
    renderAll();
  });
}

function initToolbar() {
  document.getElementById('exportBtn').addEventListener('click', () => {
    const day = getDay(currentDate);
    const blob = new Blob([JSON.stringify({ date: currentDate, ...day }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cafe-records-${currentDate}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('printBtn').addEventListener('click', () => window.print());
}

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  // Prefill time fields with the current time for convenience.
  document.querySelectorAll('input[type="time"]').forEach((el) => { el.value = nowTime(); });

  initDate();
  initTabs();
  initForms();
  initListInteractions();
  initToolbar();
  renderAll();
});
