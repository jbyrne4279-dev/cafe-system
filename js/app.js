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
  { id: 'museum', name: 'North Herts Museum Café', short: 'Café', icon: '☕' },
  { id: 'howard-park', name: 'Howard Park', short: 'Howard', icon: '🌳' },
  { id: 'bancroft', name: 'Bancroft', short: 'Bancroft', icon: '🌳', tint: 'orange' },
];

// Fridge/freezer units differ per café. Each location lists its own; anything
// without an entry falls back to DEFAULT_UNITS.
const UNITS_BY_LOCATION = {
  museum: [
    { id: 'double-fridge', name: 'Double Fridge', type: 'fridge' },
    { id: 'double-freezer', name: 'Double Freezer', type: 'freezer' },
    { id: 'storage-freezer', name: 'Storage Freezer', type: 'freezer' },
    { id: 'display-cabinet', name: 'Display Cabinet', type: 'fridge' },
    { id: 'milk-fridge', name: 'Milk Fridge', type: 'fridge' },
    { id: 'drinks-fridge', name: 'Drinks Fridge', type: 'fridge' },
    { id: 'ice-cream-freezer', name: 'Ice cream Freezer', type: 'freezer' },
  ],
  'howard-park': [
    { id: 'gelato-freezer', name: 'Gelato Freezer', type: 'freezer' },
    { id: 'mini-freezer', name: 'Mini Freezer', type: 'freezer' },
    { id: 'fridge', name: 'Fridge', type: 'fridge' },
    { id: 'drinks-fridge', name: 'Drinks Fridge', type: 'fridge' },
    { id: 'freezer', name: 'Freezer', type: 'freezer' },
  ],
  bancroft: [
    { id: 'gelato-freezer', name: 'Gelato Freezer', type: 'freezer' },
    { id: 'ice-cream-freezer-1', name: 'Ice Cream Freezer 1', type: 'freezer' },
    { id: 'ice-cream-freezer-2', name: 'Ice Cream Freezer 2', type: 'freezer' },
    { id: 'drinks-fridge', name: 'Drinks Fridge', type: 'fridge' },
    { id: 'fridge-1', name: 'Fridge 1', type: 'fridge' },
    { id: 'fridge-2', name: 'Fridge 2', type: 'fridge' },
  ],
};
const DEFAULT_UNITS = UNITS_BY_LOCATION.museum;
function unitsFor(loc) { return UNITS_BY_LOCATION[loc] || DEFAULT_UNITS; }
function units() { return unitsFor(currentLocation); }

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
  const temps = {}; units().forEach((u) => { temps[u.id] = { am: '', pm: '' }; });
  const cleaning = {}; TASKS.forEach((t) => { cleaning[t.id] = { done: false }; });
  return { temps, tempsBy: '', cleaning, hotfood: [], diary: { notes: '', opening: false, closing: false, name: '' }, activity: [] };
}

function getDay(iso) {
  if (!STORE[currentLocation]) STORE[currentLocation] = {};
  const loc = STORE[currentLocation];
  if (!loc[iso]) loc[iso] = blankDay();
  const d = loc[iso];
  d.temps = d.temps || {}; units().forEach((u) => { if (!d.temps[u.id]) d.temps[u.id] = { am: '', pm: '' }; });
  d.cleaning = d.cleaning || {}; TASKS.forEach((t) => { if (!d.cleaning[t.id]) d.cleaning[t.id] = { done: false }; });
  if (typeof d.tempsBy !== 'string') d.tempsBy = '';
  d.hotfood = d.hotfood || [];
  d.diary = d.diary || { notes: '', opening: false, closing: false, name: '' };
  d.activity = d.activity || [];
  return d;
}

/* Activity log — records the time each check/entry is made so the diary can
   show when fridges were checked morning and evening. `once` keeps a single
   (latest) timestamp per distinct action; hot-food adds log every time. */
function logActivity(d, kind, label, once = true) {
  d.activity = d.activity || [];
  const now = Date.now();
  if (once) {
    const existing = d.activity.find((a) => a.kind === kind && a.label === label);
    if (existing) { existing.ts = now; return; }
  }
  d.activity.push({ ts: now, kind, label });
}
function removeActivity(d, kind, label) {
  if (!d.activity) return;
  d.activity = d.activity.filter((a) => !(a.kind === kind && a.label === label));
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
  const seg = document.getElementById('locSeg');
  if (!seg) return;
  seg.innerHTML = LOCATIONS.map((l) => {
    const active = l.id === currentLocation;
    const tint = l.tint ? ' loc-seg__icon--' + l.tint : '';
    return `<button type="button" class="loc-seg__btn ${active ? 'is-active' : ''}" data-loc="${l.id}" role="tab" aria-selected="${active}">
      <span class="loc-seg__icon${tint}">${l.icon || '☕'}</span>
      <span class="loc-seg__label">${esc(l.short || l.name)}</span>
    </button>`;
  }).join('');
}

function renderDayLabel() {
  document.getElementById('recordDate').value = currentDate;
  const isToday = currentDate === todayISO();
  document.querySelector('.day-nav').classList.toggle('is-today', isToday);
  document.getElementById('dayLabel').innerHTML =
    `${esc(weekday(currentDate))}${isToday ? ' <span class="today-badge">TODAY</span>' : ''}`;
}

// Freezer readings are assumed negative (the iOS keypad has no minus key), so
// typing "18" stores "-18". The sign button shows the current sign and can be
// flipped to "+" for the rare above-zero fault reading; the sign is held in the
// button's state so multi-digit entry works the same for either sign.
function signOf(val) { return String(val).trim().startsWith('-') || val === '' ? '-' : '+'; }
function tempSlot(u, slot, val) {
  if (u.type === 'freezer') {
    const sign = signOf(val);
    return `<div class="tcard__slot">
      <span>${slot.toUpperCase()}</span>
      <input class="${evalTemp(u.type, val)}" data-role="temp" data-signed="1" data-unit="${u.id}" data-slot="${slot}" value="${esc(val)}" inputmode="decimal" placeholder="—" />
      <button type="button" class="sign-btn ${sign === '+' ? 'sign-btn--plus' : ''}" data-role="sign" data-sign="${sign}" aria-label="Switch between minus and plus">${sign === '-' ? '−' : '+'}</button>
    </div>`;
  }
  return `<div class="tcard__slot">
    <span>${slot.toUpperCase()}</span>
    <input class="${evalTemp(u.type, val)}" data-role="temp" data-unit="${u.id}" data-slot="${slot}" value="${esc(val)}" inputmode="decimal" placeholder="—" />
  </div>`;
}

function renderTemps() {
  const d = day();
  document.getElementById('tempList').innerHTML = units().map((u) => {
    const r = d.temps[u.id];
    return `<div class="tcard">
      <div class="tcard__head">
        <span class="tcard__name">${esc(u.name)}</span>
        <span class="unit-badge unit-badge--${u.type}">${typeLabel(u.type)} · ${typeTarget(u.type)}</span>
      </div>
      <div class="tcard__inputs">
        ${tempSlot(u, 'am', r.am)}
        ${tempSlot(u, 'pm', r.pm)}
      </div>
    </div>`;
  }).join('');
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

function fmtTime(ts) { return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }

function renderCheckTimes() {
  const host = document.getElementById('checkTimes');
  if (!host) return;
  const log = (day().activity || []).slice().sort((a, b) => a.ts - b.ts);
  if (!log.length) {
    host.innerHTML = `<div class="diary-card log-card">
      <h3>Check times</h3>
      <p class="empty">Times appear here as staff fill things in.</p>
    </div>`;
    return;
  }
  const rows = log.map((a) => `<div class="log-row">
      <span class="log-row__what">${esc(a.label)}</span>
      <span class="log-row__time">${esc(fmtTime(a.ts))}</span>
    </div>`).join('');
  host.innerHTML = `<div class="diary-card log-card">
    <h3>Check times</h3>
    ${rows}
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
    unitsFor(loc).forEach((u) => {
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

function dayHasAlert(d, loc) {
  if (!d) return false;
  return unitsFor(loc).some((u) => {
    const r = (d.temps || {})[u.id] || {};
    return ['am', 'pm'].some((s) => r[s] !== '' && !isNaN(Number(r[s])) && evalTemp(u.type, r[s]) === 'alert');
  });
}

// Per-day status across the viewed month, for the completion graph and the
// "needs attention" list. Days after today are 'future'; blank past days are
// 'missed'; days missing a whole section are 'partial'; otherwise 'complete'.
const SECTION_LABEL = { temps: 'Temps', cleaning: 'Cleaning', diary: 'Diary' };
function monthDaySeries(loc, ym) {
  const [y, m] = ym.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  const today = todayISO();
  const days = [];
  for (let i = 1; i <= dim; i++) {
    const iso = `${ym}-${String(i).padStart(2, '0')}`;
    const d = (STORE[loc] || {})[iso];
    let status, missing = [];
    if (iso > today) status = 'future';
    else if (!dayHasData(d)) { status = 'missed'; missing = ['temps', 'cleaning', 'diary']; }
    else {
      ['temps', 'cleaning', 'diary'].forEach((k) => { if (!sectionDone(d, k)) missing.push(k); });
      status = missing.length ? 'partial' : 'complete';
    }
    const who = (d && d.diary && d.diary.name || '').trim();
    days.push({ iso, day: i, dow: new Date(iso + 'T00:00:00').getDay(), status, missing, who, flagged: status !== 'future' && dayHasAlert(d, loc), isToday: iso === today });
  }
  return days;
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
  const series = monthDaySeries(currentLocation, ym);

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
    <p class="stats__legend">Purple rings show how consistently checks were completed this month. Red shows days with an out-of-range temperature.</p>
    ${staffHtml(series)}
    ${calendarHtml(series)}
    ${attentionHtml(series)}`;
}

// Short tag shown on a calendar day for who signed it (up to 4 chars).
function whoTag(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  const t = parts.length > 1 ? parts.map((p) => p[0]).join('') : name.slice(0, 4);
  return t.toUpperCase().slice(0, 4);
}

// "Who worked" — tally of who signed the diary each day this month.
function staffHtml(series) {
  const tally = {};
  series.forEach((s) => { if (s.who) tally[s.who] = (tally[s.who] || 0) + 1; });
  const staff = Object.entries(tally).map(([name, days]) => ({ name, days })).sort((a, b) => b.days - a.days);
  if (!staff.length) return '';
  const chips = staff.map((s) => `<span class="staff-chip"><b>${esc(s.name)}</b>${s.days} day${s.days === 1 ? '' : 's'}</span>`).join('');
  return `<h4 class="stats__h4">Who worked</h4>
    <div class="staff-wrap">${chips}</div>`;
}

// Month heat-calendar: one cell per day, coloured by completion. Tap to open.
function calendarHtml(series) {
  const dows = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const lead = series.length ? series[0].dow : 0;
  const heads = dows.map((d) => `<span class="cal__dow">${d}</span>`).join('');
  const pads = Array.from({ length: lead }, () => '<span class="cal__pad"></span>').join('');
  const cells = series.map((s) => {
    let title = s.status === 'future' ? 'Upcoming'
      : s.status === 'missed' ? 'No record — tap to fill in'
      : s.status === 'partial' ? 'Missing: ' + s.missing.map((k) => SECTION_LABEL[k]).join(', ')
      : 'All checks done';
    if (s.who) title += ' · ' + s.who;
    const flag = s.flagged ? ' cal__cell--flagged' : '';
    const today = s.isToday ? ' cal__cell--today' : '';
    const tap = s.status === 'future' ? '' : ` data-role="goto-day" data-date="${s.iso}" data-tab="${s.missing[0] || 'temps'}"`;
    const who = s.who ? `<span class="cal__who">${esc(whoTag(s.who))}</span>` : '';
    return `<button class="cal__cell cal__cell--${s.status}${flag}${today}"${tap} title="${esc(title)}"><span class="cal__num">${s.day}</span>${who}</button>`;
  }).join('');
  return `<h4 class="stats__h4">Daily completion</h4>
    <div class="cal">${heads}${pads}${cells}</div>
    <div class="cal-legend">
      <span><i class="dot dot--complete"></i>Complete</span>
      <span><i class="dot dot--partial"></i>Partial</span>
      <span><i class="dot dot--missed"></i>Missed</span>
      <span><i class="dot dot--flagged"></i>Temp alert</span>
    </div>`;
}

// Notifications: past days that are missed or missing a section, with a quick
// link that jumps straight to that day (and the first section needing input).
function attentionHtml(series) {
  const today = todayISO();
  const items = series.filter((s) => s.iso < today && (s.status === 'missed' || s.status === 'partial'));
  if (!items.length) {
    return `<h4 class="stats__h4">Needs attention</h4>
      <p class="allclear">✓ Nothing missed this month — every past day is complete.</p>`;
  }
  const rows = items.map((s) => {
    const what = s.status === 'missed' ? 'Nothing recorded' : 'Missing ' + s.missing.map((k) => SECTION_LABEL[k]).join(', ');
    const label = new Date(s.iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<div class="attn-row">
      <div class="attn-row__main">
        <div class="attn-row__day">${esc(label)}</div>
        <div class="attn-row__what">${esc(what)}</div>
      </div>
      <button class="btn btn--fix" data-role="goto-day" data-date="${s.iso}" data-tab="${s.missing[0] || 'temps'}">Fix</button>
    </div>`;
  }).join('');
  return `<h4 class="stats__h4">Needs attention <span class="attn-count">${items.length}</span></h4>
    <div class="attn-list">${rows}</div>`;
}

function goToDay(iso, tab) {
  currentDate = iso;
  const input = document.getElementById('recordDate');
  if (input) input.value = iso;
  renderAll();
  const t = tab || 'temps';
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x.dataset.tab === t));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.id === 'panel-' + t));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  renderDayLabel();
  renderTemps();
  renderCleaning();
  renderHotfood();
  renderDiary();
  renderCheckTimes();
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

function reportDayBlock(iso, d, unitList) {
  const tempRows = unitList.map((u) => {
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
    blocks += reportDayBlock(iso, d, unitsFor(loc));
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
  document.getElementById('locSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('.loc-seg__btn');
    if (!btn || btn.dataset.loc === currentLocation) return;
    currentLocation = btn.dataset.loc;
    localStorage.setItem(LOC_KEY, currentLocation);
    renderLocations();   // refresh the active segment
    renderAll();
    syncLocationFromServer(currentLocation);
  });
}

const TAB_ORDER = ['temps', 'cleaning', 'hotfood', 'diary'];
function activateTab(name, dir) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.id === 'panel-' + name));
  if (name === 'diary') { renderCheckTimes(); renderStats(); }
  if (dir) flashActivePanel(dir);
}
// Swipe the page content to move between tabs: left → tab on the left,
// right → tab on the right (no wrap at the ends).
function changeTab(dir) {
  const active = document.querySelector('.tab.is-active');
  const idx = TAB_ORDER.indexOf(active ? active.dataset.tab : 'temps');
  const next = idx + dir;
  if (next < 0 || next >= TAB_ORDER.length) return;
  activateTab(TAB_ORDER[next], dir);
}
function initTabs() {
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    activateTab(btn.dataset.tab);
  });
}

function flashActivePanel(dir) {
  const p = document.querySelector('.panel.is-active');
  if (!p) return;
  p.style.animation = 'none';
  const kf = dir < 0 ? 'slideR' : dir > 0 ? 'slideL' : 'fade';
  requestAnimationFrame(() => { p.style.animation = `${kf} .22s ease`; });
}

function changeDay(delta) {
  currentDate = addDays(currentDate, delta);
  renderAll();
  flashActivePanel(delta);
}

function initDayNav() {
  const input = document.getElementById('recordDate');
  input.addEventListener('change', () => { currentDate = input.value || todayISO(); renderAll(); });
  document.getElementById('prevDay').addEventListener('click', () => changeDay(-1));
  document.getElementById('nextDay').addEventListener('click', () => changeDay(1));

  // Make the date itself swipeable, with the label tracking the finger so it's
  // clear the day is moving. Swipe left → next day, swipe right → previous day.
  const nav = document.querySelector('.day-nav');
  const label = document.getElementById('dayLabel')?.closest('.day-nav__label') || nav;
  initSwipe(nav, { preview: label });
}

// Horizontal swipe handler. Calls onSwipe(dir) where dir is -1 for a left
// swipe and +1 for a right swipe. Defaults to changing the day (swipe left →
// next day). If a `preview` element is given, it slides with the finger and
// snaps back, giving live feedback while dragging.
function initSwipe(el, { preview, onSwipe } = {}) {
  const act = onSwipe || ((dir) => changeDay(dir < 0 ? 1 : -1));
  const THRESHOLD = 60;      // px of travel needed to commit
  const MAX_DRAG = 90;       // px the preview is allowed to travel
  let x0 = null, y0 = null, t0 = 0, horizontal = false;

  const setPreview = (dx, animate) => {
    if (!preview) return;
    preview.style.transition = animate ? 'transform .18s ease, opacity .18s ease' : 'none';
    const clamped = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dx));
    preview.style.transform = dx ? `translateX(${clamped}px)` : '';
    preview.style.opacity = dx ? String(1 - Math.min(0.5, Math.abs(clamped) / (MAX_DRAG * 2))) : '';
  };

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) { x0 = null; return; }
    const t = e.changedTouches[0];
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); horizontal = false;
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (x0 == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (!horizontal && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) horizontal = true;
    if (horizontal) setPreview(dx, false);
  }, { passive: true });

  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0, dt = Date.now() - t0;
    x0 = null;
    setPreview(0, true); // snap back
    if (dt < 700 && Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.8) {
      act(dx < 0 ? -1 : 1);
    }
  }, { passive: true });

  el.addEventListener('touchcancel', () => { x0 = null; setPreview(0, true); }, { passive: true });
}

function initTemps() {
  document.getElementById('tempList').addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.role !== 'temp') return;
    const u = units().find((x) => x.id === el.dataset.unit);
    const d = day();
    let val = el.value.trim();
    if (el.dataset.signed) {
      // Combine the typed magnitude with the sign held by the ± button.
      const signBtn = el.closest('.tcard__slot').querySelector('.sign-btn');
      const sign = signBtn ? signBtn.dataset.sign : '-';
      const mag = val.replace(/[^0-9.]/g, '');
      val = mag === '' ? '' : (sign === '-' ? '-' : '') + mag;
      if (el.value !== val) el.value = val;
    }
    d.temps[el.dataset.unit][el.dataset.slot] = val;
    const label = `${u ? u.name : el.dataset.unit} ${el.dataset.slot.toUpperCase()}`;
    if (val !== '') logActivity(d, 'temp', label); else removeActivity(d, 'temp', label);
    commit(d);
    el.className = evalTemp(u ? u.type : 'fridge', val);
  });
  // Sign button: flip between − (default) and + for a freezer reading.
  document.getElementById('tempList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="sign"]');
    if (!btn) return;
    const sign = btn.dataset.sign === '-' ? '+' : '-';
    btn.dataset.sign = sign;
    btn.textContent = sign === '-' ? '−' : '+';
    btn.classList.toggle('sign-btn--plus', sign === '+');
    // Re-run the input handler so the stored value picks up the new sign.
    const input = btn.closest('.tcard__slot').querySelector('input[data-role="temp"]');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
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
    const taskName = (TASKS.find((t) => t.id === row.dataset.task) || {}).name || row.dataset.task;
    if (c.done) logActivity(d, 'clean', taskName); else removeActivity(d, 'clean', taskName);
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
    const item = f.item.value.trim();
    d.hotfood.push({ id: uid(), item, stage: f.stage.value, temp: f.temp.value, by: f.by.value.trim().toUpperCase() });
    logActivity(d, 'hotfood', item, false);
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
    const field = el.dataset.field;
    d.diary[field] = el.type === 'checkbox' ? el.checked : el.value;
    if (field === 'opening') { d.diary[field] ? logActivity(d, 'diary', 'Opening checks') : removeActivity(d, 'diary', 'Opening checks'); }
    if (field === 'closing') { d.diary[field] ? logActivity(d, 'diary', 'Closing checks') : removeActivity(d, 'diary', 'Closing checks'); }
    if (field === 'name') { d.diary[field].trim() ? logActivity(d, 'diary', 'Signed') : removeActivity(d, 'diary', 'Signed'); }
    commit(d);
    renderCheckTimes();
    renderStats();
  };
  card.addEventListener('input', (e) => { if (e.target.dataset.role === 'diary') write(e.target); });
  card.addEventListener('change', (e) => { if (e.target.dataset.role === 'diary' && e.target.type === 'checkbox') write(e.target); });

  // Quick-links from the monthly dashboard (calendar cells + "Fix" buttons).
  const stats = document.getElementById('monthStats');
  if (stats) stats.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="goto-day"]');
    if (!btn) return;
    goToDay(btn.dataset.date, btn.dataset.tab);
  });
}

function initFooter() {
  document.getElementById('saveBtn').addEventListener('click', () => {
    const d = day();                       // make sure the current day is in the store
    commit(d);                             // persist locally + tab dots + queue sync
    pushDay(currentLocation, currentDate); // push to the cloud right away
    flushPending();                        // and anything saved earlier while offline
    const btn = document.getElementById('saveBtn');
    btn.classList.add('is-saved');
    btn.textContent = '✓ Saved';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.classList.remove('is-saved'); btn.textContent = '✓ Save'; }, 1600);
  });
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
  // Swiping the date (header) changes the day; swiping the page content moves
  // between tabs — left to the tab on the left, right to the tab on the right.
  initSwipe(document.querySelector('.app-main'), { onSwipe: changeTab });
  renderAll();

  // Pull shared data from the server, then push anything saved while offline.
  syncLocationFromServer(currentLocation).then(flushPending);
  window.addEventListener('online', flushPending);
});
