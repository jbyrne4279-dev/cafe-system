/* North Herts Museum Café — Daily Records (day-at-a-time log book)
 *
 * One day on screen at a time, kept simple for staff. Owners can flip to any
 * date and print that day's full record for the legal log book.
 *
 * Sections: Fridge & Freezer temps, Cleaning, Hot Food, Daily Diary.
 * The unit list and cleaning tasks are FIXED (from the café's sheets).
 * Records are stored per DAY in the browser (localStorage).
 */

const STORE_KEY = 'nhmc-cafe-records-v4';

// Fixed units from the café's temperature chart. Type drives colour only.
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
const STAGE_LABEL = { cooking: 'Cooking', reheating: 'Reheating', 'hot-holding': 'Hot holding' };

/* ---------- helpers ---------- */

function toISO(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function todayISO() { return toISO(new Date()); }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d); }
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function longDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function weekday(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
}

/* ---------- storage ---------- */

function loadAll() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
function saveAll(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }

function blankDay() {
  const temps = {}; UNITS.forEach((u) => { temps[u.id] = { am: '', pm: '' }; });
  const cleaning = {}; TASKS.forEach((t) => { cleaning[t.id] = { done: false, by: '' }; });
  return { temps, tempsBy: '', cleaning, hotfood: [], diary: { notes: '', opening: false, closing: false, name: '' } };
}

function getDay(iso) {
  const all = loadAll();
  if (!all[iso]) { all[iso] = blankDay(); saveAll(all); }
  const d = all[iso];
  d.temps = d.temps || {}; UNITS.forEach((u) => { if (!d.temps[u.id]) d.temps[u.id] = { am: '', pm: '' }; });
  d.cleaning = d.cleaning || {}; TASKS.forEach((t) => { if (!d.cleaning[t.id]) d.cleaning[t.id] = { done: false, by: '' }; });
  if (typeof d.tempsBy !== 'string') d.tempsBy = '';
  d.hotfood = d.hotfood || [];
  d.diary = d.diary || { notes: '', opening: false, closing: false, name: '' };
  return d;
}
function setDay(iso, day) { const all = loadAll(); all[iso] = day; saveAll(all); }

/* ---------- state ---------- */

let currentDate = todayISO();
function day() { return getDay(currentDate); }
function commit(d) { setDay(currentDate, d); updateTabDots(); }

/* ---------- temperature evaluation ---------- */

function evalTemp(type, value) {
  if (value === '' || value == null || isNaN(Number(value))) return '';
  const t = Number(value);
  if (type === 'freezer') { if (t <= -18) return 'ok'; if (t <= -12) return 'watch'; return 'alert'; }
  if (t <= 5) return 'ok'; if (t <= 8) return 'watch'; return 'alert';
}
function typeLabel(type) { return type === 'freezer' ? 'Freezer' : 'Fridge'; }
function typeTarget(type) { return type === 'freezer' ? '≤ -18°C' : '0–5°C'; }

/* ---------- renderers ---------- */

function renderDayLabel() {
  document.getElementById('recordDate').value = currentDate;
  const isToday = currentDate === todayISO();
  document.querySelector('.day-nav').classList.toggle('is-today', isToday);
  document.getElementById('dayLabel').innerHTML =
    `${esc(weekday(currentDate))}${isToday ? ' <span class="today-badge">TODAY</span>' : ''}`;
}

function renderTemps() {
  const d = day();
  document.getElementById('tempList').innerHTML = UNITS.map((u) => {
    const r = d.temps[u.id];
    return `<div class="tcard">
      <div class="tcard__head">
        <span class="tcard__name">${esc(u.name)}</span>
        <span class="unit-badge unit-badge--${u.type}">${typeLabel(u.type)} · ${typeTarget(u.type)}</span>
      </div>
      <div class="tcard__inputs">
        <label class="tcard__slot"><span>AM</span><input class="${evalTemp(u.type, r.am)}" data-role="temp" data-unit="${u.id}" data-slot="am" value="${esc(r.am)}" inputmode="decimal" placeholder="—" /></label>
        <label class="tcard__slot"><span>PM</span><input class="${evalTemp(u.type, r.pm)}" data-role="temp" data-unit="${u.id}" data-slot="pm" value="${esc(r.pm)}" inputmode="decimal" placeholder="—" /></label>
      </div>
    </div>`;
  }).join('');
  document.getElementById('tempsBy').value = d.tempsBy || '';
}

function renderCleaning() {
  const d = day();
  document.getElementById('cleaningList').innerHTML = TASKS.map((t) => {
    const c = d.cleaning[t.id];
    return `<div class="crow ${c.done ? 'done' : ''}" data-role="clean-row" data-task="${t.id}">
      <span class="crow__box">${c.done ? '✓' : ''}</span>
      <span class="crow__name">${esc(t.name)}</span>
      <input class="crow__init" data-role="clean-init" data-task="${t.id}" value="${esc(c.by)}" maxlength="4" placeholder="Init." />
    </div>`;
  }).join('');
}

function renderHotfood() {
  const d = day();
  const empty = document.getElementById('hotfoodEmpty');
  empty.style.display = d.hotfood.length ? 'none' : 'block';
  document.getElementById('hotfoodList').innerHTML = d.hotfood.map((r) => {
    const ok = HOT_RULES[r.stage] ? HOT_RULES[r.stage](Number(r.temp)) : true;
    return `<div class="hf-item">
      <div class="hf-item__main">
        <div class="hf-item__name">${esc(r.item)}</div>
        <div class="hf-item__sub">${esc(STAGE_LABEL[r.stage] || r.stage)}${r.by ? ' · ' + esc(r.by) : ''}</div>
      </div>
      <span class="hf-item__temp">${esc(r.temp)}°C</span>
      <span class="badge ${ok ? 'badge--ok' : 'badge--bad'}">${ok ? 'OK' : 'Low'}</span>
      <button class="row-del" data-role="remove-hotfood" data-id="${r.id}" title="Delete">&times;</button>
    </div>`;
  }).join('');
}

function renderDiary() {
  const e = day().diary;
  document.getElementById('diaryCard').innerHTML = `<div class="diary-card">
    <h3>${esc(weekday(currentDate))}</h3>
    <p class="diary-q">Any problems or changes — what did you do?</p>
    <textarea data-role="diary" data-field="notes" placeholder="e.g. Closed / No issues">${esc(e.notes)}</textarea>
    <div class="diary-checks">
      <label><input type="checkbox" data-role="diary" data-field="opening" ${e.opening ? 'checked' : ''}/> Opening checks</label>
      <label><input type="checkbox" data-role="diary" data-field="closing" ${e.closing ? 'checked' : ''}/> Closing checks</label>
    </div>
    <div class="diary-sign"><input data-role="diary" data-field="name" placeholder="Name" value="${esc(e.name)}" /></div>
    <p class="diary-foot">Our safe methods were followed and effectively supervised today.</p>
  </div>`;
}

// Green dots on tabs that still have nothing filled in for the day.
function sectionDone(d, key) {
  if (key === 'temps') return Object.values(d.temps).some((r) => r.am !== '' || r.pm !== '') || d.tempsBy !== '';
  if (key === 'cleaning') return Object.values(d.cleaning).some((c) => c.done);
  if (key === 'diary') return !!(d.diary.notes || d.diary.name || d.diary.opening || d.diary.closing);
  return true; // hot food is optional — never nags
}
function updateTabDots() {
  const d = day();
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('has-todo', !sectionDone(d, tab.dataset.tab));
  });
}

function renderAll() {
  renderDayLabel();
  renderTemps();
  renderCleaning();
  renderHotfood();
  renderDiary();
  updateTabDots();
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
  });
}

function initDayNav() {
  const input = document.getElementById('recordDate');
  input.addEventListener('change', () => { currentDate = input.value || todayISO(); renderAll(); });
  document.getElementById('prevDay').addEventListener('click', () => { currentDate = addDays(currentDate, -1); renderAll(); });
  document.getElementById('nextDay').addEventListener('click', () => { currentDate = addDays(currentDate, 1); renderAll(); });
}

function initTemps() {
  const list = document.getElementById('tempList');
  list.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.role !== 'temp') return;
    const u = UNITS.find((x) => x.id === el.dataset.unit);
    const d = day();
    d.temps[el.dataset.unit][el.dataset.slot] = el.value.trim();
    commit(d);
    el.className = evalTemp(u ? u.type : 'fridge', el.value.trim());
  });
  document.getElementById('tempsBy').addEventListener('input', (e) => {
    const d = day();
    d.tempsBy = e.target.value.toUpperCase();
    e.target.value = d.tempsBy;
    commit(d);
  });
}

function initCleaning() {
  const list = document.getElementById('cleaningList');
  // Tap a row to tick; tap again to untick. (Typing initials doesn't toggle.)
  list.addEventListener('click', (e) => {
    if (e.target.closest('.crow__init')) return;
    const row = e.target.closest('.crow');
    if (!row) return;
    const d = day();
    const c = d.cleaning[row.dataset.task];
    c.done = !c.done;
    commit(d);
    row.classList.toggle('done', c.done);
    row.querySelector('.crow__box').textContent = c.done ? '✓' : '';
  });
  list.addEventListener('input', (e) => {
    if (e.target.dataset.role !== 'clean-init') return;
    const d = day();
    d.cleaning[e.target.dataset.task].by = e.target.value.toUpperCase();
    e.target.value = d.cleaning[e.target.dataset.task].by;
    commit(d);
  });
}

function initHotfood() {
  document.getElementById('hotfoodForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const d = day();
    d.hotfood.push({ id: uid(), item: f.item.value.trim(), stage: f.stage.value, temp: f.temp.value, by: f.by.value.trim().toUpperCase() });
    commit(d);
    f.reset();
    renderHotfood();
  });
  document.getElementById('hotfoodList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="remove-hotfood"]');
    if (!btn) return;
    const d = day();
    d.hotfood = d.hotfood.filter((x) => x.id !== btn.dataset.id);
    commit(d);
    renderHotfood();
  });
}

function initDiary() {
  const card = document.getElementById('diaryCard');
  const write = (el) => {
    const d = day();
    d.diary[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
    commit(d);
  };
  card.addEventListener('input', (e) => { if (e.target.dataset.role === 'diary') write(e.target); });
  card.addEventListener('change', (e) => { if (e.target.dataset.role === 'diary' && e.target.type === 'checkbox') write(e.target); });
}

function initPrint() {
  document.getElementById('printBtn').addEventListener('click', () => {
    document.getElementById('printHeader').innerHTML =
      `<h1>North Herts Museum Café — Daily Record</h1><p>${esc(longDate(currentDate))}</p>`;
    window.print();
  });
}

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  initDayNav();
  initTabs();
  initTemps();
  initCleaning();
  initHotfood();
  initDiary();
  initPrint();
  renderAll();
});
