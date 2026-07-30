/* North Herts Museum Café group — Daily Records (day-at-a-time log book)
 *
 * - Multiple café locations, each with its own records.
 * - One day on screen at a time; owners can flip to any date and print it,
 *   or download a whole month's report.
 * - Records sync to the server (shared across devices) and also cache in the
 *   browser so the app keeps working offline, then syncs when back online.
 */

const STORE_KEY = 'nhmc-cafe-records-v5';   // { location: { date: day } }
const LOC_KEY = 'nhmc-cafe-location';
const PENDING_KEY = 'nhmc-cafe-pending';    // ["location|date", ...]

const LOCATIONS = [
  { id: 'museum', name: 'North Herts Museum Café' },
  { id: 'howard-park', name: 'Howard Park' },
  { id: 'bancroft', name: 'Bancroft' },
];

const UNITS = [
  { id: 'double-fridge', name: 'Double Fridge', type: 'fridge' },
  { id: 'double-freezer', name: 'Double Freezer', type: 'freezer' },
  { id: 'storage-freezer', name: 'Storage Freezer', type: 'freezer' },
  { id: 'display-cabinet', name: 'Display Cabinet', type: 'fridge' },
  { id: 'milk-fridge', name: 'Milk Fridge', type: 'fridge' },
  { id: 'drinks-fridge', name: 'Drinks Fridge', type: 'fridge' },
  { id: 'ice-cream-freezer', name: 'Ice cream Freezer', type: 'freezer' },
];

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

const HOT_RULES = { cooking: (t) => t >= 75, reheating: (t) => t >= 75, 'hot-holding': (t) => t >= 63 };
const STAGE_LABEL = { cooking: 'Cooking', reheating: 'Reheating', 'hot-holding': 'Hot holding' };

/* ---------- helpers ---------- */

function toISO(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function todayISO() { return toISO(new Date()); }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function longDate(iso) { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function weekday(iso) { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' }); }
function locName(id) { return (LOCATIONS.find((l) => l.id === id) || {}).name || id; }

/* ---------- storage ---------- */

let STORE = {};
function loadLocal() { try { STORE = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { STORE = {}; } }
function saveLocal() { localStorage.setItem(STORE_KEY, JSON.stringify(STORE)); }

function blankDay() {
  const temps = {}; UNITS.forEach((u) => { temps[u.id] = { am: '', pm: '' }; });
  const cleaning = {}; TASKS.forEach((t) => { cleaning[t.id] = { done: false }; });
  return { temps, tempsBy: '', cleaning, hotfood: [], diary: { notes: '', opening: false, closing: false, name: '' } };
}

function getDay(iso) {
  if (!STORE[currentLocation]) STORE[currentLocation] = {};
  const loc = STORE[currentLocation];
  if (!loc[iso]) loc[iso] = blankDay();
  const d = loc[iso];
  d.temps = d.temps || {}; UNITS.forEach((u) => { if (!d.temps[u.id]) d.temps[u.id] = { am: '', pm: '' }; });
  d.cleaning = d.cleaning || {}; TASKS.forEach((t) => { if (!d.cleaning[t.id]) d.cleaning[t.id] = { done: false }; });
  if (typeof d.tempsBy !== 'string') d.tempsBy = '';
  d.hotfood = d.hotfood || [];
  d.diary = d.diary || { notes: '', opening: false, closing: false, name: '' };
  return d;
}

/* ---------- state ---------- */

let currentLocation = localStorage.getItem(LOC_KEY) || LOCATIONS[0].id;
if (!LOCATIONS.some((l) => l.id === currentLocation)) currentLocation = LOCATIONS[0].id;
let currentDate = todayISO();

function day() { return getDay(currentDate); }
function commit(d) {
  STORE[currentLocation][currentDate] = d;
  saveLocal();
  updateTabDots();
  queuePush(currentLocation, currentDate);
}

/* ---------- server sync ---------- */

function setSync(state) {
  const el = document.getElementById('syncNote');
  if (!el) return;
  const msg = { syncing: 'Saving…', ok: 'Saved to cloud ✓', local: 'Saved on this device (will sync when online)' };
  el.textContent = msg[state] || '';
  el.className = 'sync-note sync-note--' + state;
}

function getPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch { return []; } }
function setPending(list) { localStorage.setItem(PENDING_KEY, JSON.stringify([...new Set(list)])); }
function addPending(key) { setPending([...getPending(), key]); }
function removePending(key) { setPending(getPending().filter((k) => k !== key)); }

const pushTimers = {};
function queuePush(loc, date) {
  const key = loc + '|' + date;
  clearTimeout(pushTimers[key]);
  pushTimers[key] = setTimeout(() => pushDay(loc, date), 600);
}
async function pushDay(loc, date) {
  const key = loc + '|' + date;
  setSync('syncing');
  try {
    const res = await fetch(`/api/day/${loc}/${date}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify((STORE[loc] || {})[date] || {}),
    });
    if (!res.ok) throw new Error('bad status');
    removePending(key);
    setSync('ok');
  } catch {
    addPending(key);
    setSync('local');
  }
}
function flushPending() { getPending().forEach((k) => { const [loc, date] = k.split('|'); pushDay(loc, date); }); }

async function syncLocationFromServer(loc) {
  setSync('syncing');
  try {
    const res = await fetch(`/api/data/${loc}`);
    if (!res.ok) throw new Error('bad status');
    const server = await res.json();
    STORE[loc] = { ...(STORE[loc] || {}), ...server }; // server wins for existing days
    saveLocal();
    if (loc === currentLocation) renderAll();
    setSync('ok');
  } catch {
    setSync('local');
  }
}

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

function renderLocations() {
  const sel = document.getElementById('locationSelect');
  sel.innerHTML = LOCATIONS.map((l) => `<option value="${l.id}" ${l.id === currentLocation ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  document.getElementById('locCurrent').textContent = locName(currentLocation);
}

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
    const done = d.cleaning[t.id].done;
    return `<div class="crow ${done ? 'done' : ''}" data-role="clean-row" data-task="${t.id}">
      <span class="crow__box">${done ? '✓' : ''}</span>
      <span class="crow__name">${esc(t.name)}</span>
    </div>`;
  }).join('');
}

function renderHotfood() {
  const d = day();
  document.getElementById('hotfoodEmpty').style.display = d.hotfood.length ? 'none' : 'block';
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

function sectionDone(d, key) {
  if (key === 'temps') return Object.values(d.temps).some((r) => r.am !== '' || r.pm !== '') || d.tempsBy !== '';
  if (key === 'cleaning') return Object.values(d.cleaning).some((c) => c.done);
  if (key === 'diary') return !!(d.diary.notes || d.diary.name || d.diary.opening || d.diary.closing);
  return true;
}
function updateTabDots() {
  const d = day();
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('has-todo', !sectionDone(d, tab.dataset.tab)));
}

/* ---------- monthly stats dashboard (bottom of Diary) ---------- */

function monthMetrics(loc, ym) {
  const [y, m] = ym.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  let openDays = 0, filled = 0, expected = 0, cleanDone = 0, cleanExp = 0;
  let diarySigned = 0, flaggedDays = 0, alertReadings = 0, hotChecks = 0;
  for (let i = 1; i <= dim; i++) {
    const iso = `${ym}-${String(i).padStart(2, '0')}`;
    const d = (STORE[loc] || {})[iso];
    if (!dayHasData(d)) continue;
    openDays++;
    let dayFlagged = false;
    UNITS.forEach((u) => {
      const r = d.temps[u.id] || { am: '', pm: '' };
      ['am', 'pm'].forEach((s) => {
        expected++;
        if (r[s] !== '' && !isNaN(Number(r[s]))) {
          filled++;
          if (evalTemp(u.type, r[s]) === 'alert') { alertReadings++; dayFlagged = true; }
        }
      });
    });
    if (dayFlagged) flaggedDays++;
    TASKS.forEach((t) => { cleanExp++; if (d.cleaning[t.id] && d.cleaning[t.id].done) cleanDone++; });
    if (d.diary && d.diary.name) diarySigned++;
    hotChecks += (d.hotfood || []).length;
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  return {
    openDays, filled, alertReadings, flaggedDays, hotChecks,
    tempPct: pct(filled, expected), cleanPct: pct(cleanDone, cleanExp), diaryPct: pct(diarySigned, openDays),
    flaggedPct: pct(flaggedDays, openDays),
  };
}

function donutCard(center, pct, color, label) {
  return `<figure class="donut-card">
    <div class="donut" style="--p:${pct};--c:${color}"><div class="donut__hole"><span class="donut__val">${esc(center)}</span></div></div>
    <figcaption>${esc(label)}</figcaption>
  </figure>`;
}
function tile(v, l, cls) {
  return `<div class="tile ${cls || ''}"><div class="tile__v">${esc(String(v))}</div><div class="tile__l">${esc(l)}</div></div>`;
}

function renderStats() {
  const el = document.getElementById('monthStats');
  if (!el) return;
  const ym = currentDate.slice(0, 7);
  const monthName = new Date(currentDate + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const s = monthMetrics(currentLocation, ym);

  const head = `<h3 class="stats__title">Monthly overview</h3>
    <p class="stats__sub">${esc(monthName)} · ${esc(locName(currentLocation))} · ${s.openDays} day${s.openDays === 1 ? '' : 's'} recorded</p>`;

  if (!s.openDays) { el.innerHTML = head + '<p class="empty">No records yet this month.</p>'; return; }

  el.innerHTML = head + `
    <div class="donut-row">
      ${donutCard(s.tempPct + '%', s.tempPct, 'var(--accent)', 'Temp checks done')}
      ${donutCard(s.cleanPct + '%', s.cleanPct, 'var(--accent)', 'Cleaning done')}
      ${donutCard(s.diaryPct + '%', s.diaryPct, 'var(--accent)', 'Diary signed')}
      ${donutCard(String(s.flaggedDays), s.flaggedPct, 'var(--bad)', 'Days flagged')}
    </div>
    <div class="tile-row">
      ${tile(s.openDays, 'Days recorded')}
      ${tile(s.filled, 'Temp readings')}
      ${tile(s.alertReadings, 'Out-of-range', s.alertReadings ? 'tile--alert' : '')}
      ${tile(s.hotChecks, 'Hot food checks')}
    </div>
    <p class="stats__legend">Purple rings show how consistently checks were completed this month. Red shows days with an out-of-range temperature.</p>`;
}

function renderAll() {
  renderDayLabel();
  renderTemps();
  renderCleaning();
  renderHotfood();
  renderDiary();
  renderStats();
  updateTabDots();
}

/* ---------- monthly report ---------- */

function dayHasData(d) {
  if (!d) return false;
  if (Object.values(d.temps || {}).some((r) => r.am !== '' || r.pm !== '')) return true;
  if (d.tempsBy) return true;
  if (Object.values(d.cleaning || {}).some((c) => c.done)) return true;
  if ((d.hotfood || []).length) return true;
  const di = d.diary || {};
  return !!(di.notes || di.name || di.opening || di.closing);
}

function reportDayBlock(iso, d) {
  const tempRows = UNITS.map((u) => {
    const r = d.temps[u.id] || { am: '', pm: '' };
    const flag = (v) => (evalTemp(u.type, v) === 'alert' ? ' ⚠' : '');
    return `<tr><td>${esc(u.name)}</td><td>${esc(r.am)}${r.am !== '' ? '°C' : ''}${flag(r.am)}</td><td>${esc(r.pm)}${r.pm !== '' ? '°C' : ''}${flag(r.pm)}</td></tr>`;
  }).join('');

  const cleanRows = TASKS.map((t) => `<li>${d.cleaning[t.id] && d.cleaning[t.id].done ? '☑' : '☐'} ${esc(t.name)}</li>`).join('');

  const hot = (d.hotfood || []).length
    ? '<ul>' + d.hotfood.map((r) => `<li>${esc(r.item)} — ${esc(STAGE_LABEL[r.stage] || r.stage)} ${esc(r.temp)}°C${r.by ? ' (' + esc(r.by) + ')' : ''}</li>`).join('') + '</ul>'
    : '<p class="muted">None recorded.</p>';

  const di = d.diary || {};
  const diary = `<p><strong>Notes:</strong> ${esc(di.notes) || '<span class="muted">—</span>'}</p>
    <p><strong>Opening checks:</strong> ${di.opening ? '✓' : '—'} &nbsp; <strong>Closing checks:</strong> ${di.closing ? '✓' : '—'} &nbsp; <strong>Signed:</strong> ${esc(di.name) || '—'}</p>`;

  return `<section class="rday">
    <h2>${esc(longDate(iso))}</h2>
    <h3>Fridge &amp; Freezer${d.tempsBy ? ' <span class="muted">— checked by ' + esc(d.tempsBy) + '</span>' : ''}</h3>
    <table><thead><tr><th>Unit</th><th>AM</th><th>PM</th></tr></thead><tbody>${tempRows}</tbody></table>
    <h3>Cleaning</h3><ul class="clist">${cleanRows}</ul>
    <h3>Hot Food</h3>${hot}
    <h3>Daily Diary</h3>${diary}
  </section>`;
}

function buildMonthlyReport(loc, ym) {
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  let blocks = '', open = 0;
  for (let i = 1; i <= daysInMonth; i++) {
    const iso = `${ym}-${String(i).padStart(2, '0')}`;
    const d = (STORE[loc] || {})[iso];
    if (!dayHasData(d)) continue;
    open++;
    blocks += reportDayBlock(iso, d);
  }
  if (!open) blocks = '<p class="muted">No records were found for this month.</p>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(locName(loc))} — ${esc(monthName)} report</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:24px;line-height:1.4}
  header{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:16px}
  header h1{margin:0;font-size:22px}
  header p{margin:2px 0 0;color:#555}
  .summary{color:#555;margin:0 0 18px}
  .rday{page-break-inside:avoid;border:1px solid #ccc;border-radius:8px;padding:12px 16px;margin-bottom:14px}
  .rday h2{font-size:16px;margin:0 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .rday h3{font-size:13px;margin:12px 0 4px;color:#333}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid #ddd;padding:4px 8px;text-align:left}
  th{background:#f4f4f4}
  ul{margin:4px 0;padding-left:18px;font-size:13px}
  .clist{list-style:none;padding-left:0;columns:2}
  .muted{color:#999}
  @media print{body{margin:10mm}.rday{border-color:#999}}
</style></head><body>
<header>
  <h1>${esc(locName(loc))}</h1>
  <p>Daily records — ${esc(monthName)}</p>
</header>
<p class="summary">${open} day${open === 1 ? '' : 's'} with records. Print this page (Ctrl/Cmd + P) to save as PDF for the log book.</p>
${blocks}
</body></html>`;
}

function downloadMonthlyReport() {
  const ym = document.getElementById('reportMonth').value;
  if (!ym) { alert('Please choose a month first.'); return; }
  const html = buildMonthlyReport(currentLocation, ym);
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${currentLocation}-report-${ym}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- events ---------- */

function initLocation() {
  const sel = document.getElementById('locationSelect');
  sel.addEventListener('change', () => {
    currentLocation = sel.value;
    localStorage.setItem(LOC_KEY, currentLocation);
    document.getElementById('locCurrent').textContent = locName(currentLocation);
    renderAll();
    syncLocationFromServer(currentLocation);
  });
}

function initTabs() {
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('is-active');
    if (btn.dataset.tab === 'diary') renderStats();
  });
}

function initDayNav() {
  const input = document.getElementById('recordDate');
  input.addEventListener('change', () => { currentDate = input.value || todayISO(); renderAll(); });
  document.getElementById('prevDay').addEventListener('click', () => { currentDate = addDays(currentDate, -1); renderAll(); });
  document.getElementById('nextDay').addEventListener('click', () => { currentDate = addDays(currentDate, 1); renderAll(); });
}

function initTemps() {
  document.getElementById('tempList').addEventListener('input', (e) => {
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
  // Tap a row to tick; tap again to untick.
  document.getElementById('cleaningList').addEventListener('click', (e) => {
    const row = e.target.closest('.crow');
    if (!row) return;
    const d = day();
    const c = d.cleaning[row.dataset.task];
    c.done = !c.done;
    commit(d);
    row.classList.toggle('done', c.done);
    row.querySelector('.crow__box').textContent = c.done ? '✓' : '';
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
  const write = (el) => { const d = day(); d.diary[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value; commit(d); };
  card.addEventListener('input', (e) => { if (e.target.dataset.role === 'diary') write(e.target); });
  card.addEventListener('change', (e) => { if (e.target.dataset.role === 'diary' && e.target.type === 'checkbox') write(e.target); });
}

function initFooter() {
  document.getElementById('printBtn').addEventListener('click', () => {
    document.getElementById('printHeader').innerHTML =
      `<h1>${esc(locName(currentLocation))} — Daily Record</h1><p>${esc(longDate(currentDate))}</p>`;
    window.print();
  });
  document.getElementById('reportMonth').value = todayISO().slice(0, 7);
  document.getElementById('downloadMonth').addEventListener('click', downloadMonthlyReport);
}

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  loadLocal();
  renderLocations();
  initLocation();
  initTabs();
  initDayNav();
  initTemps();
  initCleaning();
  initHotfood();
  initDiary();
  initFooter();
  renderAll();

  // Pull shared data from the server, then push anything saved while offline.
  syncLocationFromServer(currentLocation).then(flushPending);
  window.addEventListener('online', flushPending);
});
