/* North Herts Museum Café — static site + tiny JSON storage API.
 *
 * Zero dependencies. Records are stored server-side in a single JSON file so
 * every device shares the same data. On Railway, point DATA_DIR at a mounted
 * Volume (e.g. /data) so the data survives redeploys.
 *
 * Records are scoped per café location:
 *   GET  /api/data/:location            -> { "YYYY-MM-DD": {..day..}, ... }
 *   PUT  /api/day/:location/:date        -> upsert one day's record (JSON body)
 *   GET  /healthz                        -> health check
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'records.json');
const TMP_FILE = DATA_FILE + '.tmp';
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_KEEP = 14;                 // rolling daily snapshots to retain
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOC_RE = /^[a-z0-9-]{1,40}$/;

// If DATA_DIR wasn't set, data lives in the container's ephemeral filesystem and
// is wiped on every redeploy. Warn loudly so a missing Volume mount is obvious.
if (!process.env.DATA_DIR) {
  console.warn('WARNING: DATA_DIR is not set — records are stored in the ephemeral\n' +
    '         container filesystem and WILL be lost on redeploy. Point DATA_DIR at\n' +
    '         a mounted Railway Volume (e.g. /data) for durable storage.');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

/* ---- record store (in memory, flushed to disk, writes serialised) ----
 * Load once at boot. If the file exists but won't parse (e.g. a redeploy killed
 * the process mid-write in a pre-atomic version), we must NOT silently start
 * empty — the next write would overwrite the salvageable file with {}. Instead
 * we preserve the bad file as records.json.corrupt and refuse to persist until
 * it's dealt with, so a human can recover it. */
let store = {};
let persistLocked = false;
(function loadStore() {
  let raw;
  try { raw = fs.readFileSync(DATA_FILE, 'utf8'); } catch { return; }  // no file yet — fresh start is fine
  try {
    store = JSON.parse(raw);
  } catch (e) {
    const bad = DATA_FILE + '.corrupt.' + Date.now();
    try { fs.renameSync(DATA_FILE, bad); console.error(`records.json is corrupt; preserved as ${bad}`); }
    catch (e2) { persistLocked = true; console.error('records.json is corrupt and could not be moved; refusing to overwrite it:', e2.message); }
    store = {};
  }
})();

/* Writes are serialised and atomic: JSON is written to a temp file, fsync'd,
 * then renamed over the real file. A crash mid-write leaves the previous good
 * file intact rather than a truncated one. */
let writeChain = Promise.resolve();
async function writeAtomic() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  const data = JSON.stringify(store);
  const fh = await fs.promises.open(TMP_FILE, 'w');
  try {
    await fh.writeFile(data);
    await fh.sync();               // flush to disk before the rename
  } finally {
    await fh.close();
  }
  await fs.promises.rename(TMP_FILE, DATA_FILE);
}
function persist() {
  // Chain writes so they never interleave; each caller gets a promise that
  // resolves only once ITS state has actually reached disk (or rejects).
  const run = writeChain.then(() => {
    if (persistLocked) throw new Error('persist locked: unresolved corrupt data file');
    return writeAtomic();
  });
  // Keep the chain alive even if this write rejects, but don't swallow the
  // error for the caller — they need to know so the client stays "unsaved".
  writeChain = run.catch(() => {});
  return run;
}

/* ---- rolling daily backup ----
 * Once per day, snapshot the current file into backups/records-YYYY-MM-DD.json
 * and prune to the most recent BACKUP_KEEP snapshots. This gives a point-in-time
 * copy to fall back on if the live file is ever lost or wrongly overwritten. */
async function backupDaily() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const dest = path.join(BACKUP_DIR, `records-${stamp}.json`);
    if (!fs.existsSync(dest)) await fs.promises.copyFile(DATA_FILE, dest);
    const files = (await fs.promises.readdir(BACKUP_DIR))
      .filter((f) => /^records-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) {
      await fs.promises.unlink(path.join(BACKUP_DIR, f)).catch(() => {});
    }
  } catch (e) { console.error('backup error:', e.message); }
}

/* ---- demo seed ----
 * Fills in day-records from seed-data.json that aren't already present, so the
 * app shows a realistic history. It ONLY adds days that don't exist — it never
 * overwrites a real entry. A version marker in the data volume means a bumped
 * seed re-imports its new days once, without touching anything already stored. */
const SEED_VERSION = '2';
function seedOnce() {
  const marker = path.join(DATA_DIR, '.seeded');
  const seedFile = path.join(ROOT, 'seed-data.json');
  try {
    if (!fs.existsSync(seedFile)) return;
    let prev = '';
    try { prev = fs.readFileSync(marker, 'utf8'); } catch { /* not seeded yet */ }
    if (prev.startsWith('v' + SEED_VERSION + ' ')) return;   // already at this version
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    let added = 0;
    for (const loc of Object.keys(seed)) {
      if (!store[loc]) store[loc] = {};
      for (const date of Object.keys(seed[loc])) {
        if (!store[loc][date]) { store[loc][date] = seed[loc][date]; added++; }
      }
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(marker, 'v' + SEED_VERSION + ' ' + new Date().toISOString());
    if (added) persist().catch((e) => console.error('seed persist error:', e.message));
    console.log(`Demo seed v${SEED_VERSION}: added ${added} day-records.`);
  } catch (e) { console.error('seed error:', e.message); }
}
seedOnce();

// Snapshot at boot (after any seed write has landed), then once a day.
writeChain.then(backupDaily);
setInterval(backupDaily, 24 * 60 * 60 * 1000).unref();

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/* Apply one merge operation to a day object. Mirrors applyDayOp in js/app.js —
 * keep the two in sync. Each phone sends only the fields it changed, so merging
 * op-by-op lets several devices edit the same day without clobbering each other. */
function applyDayOp(day, op) {
  if (!op || typeof op !== 'object') return day;
  switch (op.t) {
    case 'set': {
      if (!Array.isArray(op.path) || !op.path.length || op.path.length > 4) break;
      let o = day;
      for (let i = 0; i < op.path.length - 1; i++) {
        const k = op.path[i];
        if (typeof o[k] !== 'object' || o[k] == null) o[k] = {};
        o = o[k];
      }
      o[op.path[op.path.length - 1]] = op.v;
      break;
    }
    case 'hf-add':
      if (op.rec && op.rec.id != null) {
        if (!Array.isArray(day.hotfood)) day.hotfood = [];
        if (!day.hotfood.some((x) => x.id === op.rec.id)) day.hotfood.push(op.rec);
      }
      break;
    case 'hf-del':
      day.hotfood = (day.hotfood || []).filter((x) => x.id !== op.id);
      break;
    case 'act':
      if (!Array.isArray(day.activity)) day.activity = [];
      if (op.once) { const e = day.activity.find((a) => a.kind === op.kind && a.label === op.label); if (e) { e.ts = op.ts; break; } }
      day.activity.push({ ts: op.ts, kind: op.kind, label: op.label });
      break;
    case 'act-del':
      day.activity = (day.activity || []).filter((a) => !(a.kind === op.kind && a.label === op.label));
      break;
  }
  return day;
}
function applyDayOps(day, ops) { if (Array.isArray(ops)) ops.forEach((op) => applyDayOp(day, op)); return day; }

function readBody(req, cb) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => cb(body));
}

function handleApi(req, res, url) {
  // GET /api/data/:location
  const g = url.match(/^\/api\/data\/([^/]+)$/);
  if (req.method === 'GET' && g) {
    const loc = decodeURIComponent(g[1]);
    if (!LOC_RE.test(loc)) return sendJSON(res, 400, { error: 'bad location' });
    return sendJSON(res, 200, store[loc] || {});
  }
  // PATCH /api/day/:location/:date  -> merge a list of field operations
  const q = url.match(/^\/api\/day\/([^/]+)\/([^/]+)$/);
  if (req.method === 'PATCH' && q) {
    const loc = decodeURIComponent(q[1]);
    const date = decodeURIComponent(q[2]);
    if (!LOC_RE.test(loc) || !DATE_RE.test(date)) return sendJSON(res, 400, { error: 'bad location/date' });
    readBody(req, async (body) => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch { return sendJSON(res, 400, { error: 'bad json' }); }
      const ops = parsed && parsed.ops;
      if (!Array.isArray(ops)) return sendJSON(res, 400, { error: 'bad ops' });
      if (!store[loc]) store[loc] = {};
      if (!store[loc][date]) store[loc][date] = {};
      applyDayOps(store[loc][date], ops);
      // Only report success once the merged change is on disk; on failure return
      // 500 so the client keeps the ops queued and retries.
      try {
        await persist();
        sendJSON(res, 200, { ok: true, day: store[loc][date] });
      } catch (e) {
        console.error('persist error:', e.message);
        sendJSON(res, 500, { error: 'not saved' });
      }
    });
    return;
  }
  // PUT /api/day/:location/:date  -> whole-day upsert (kept for older clients)
  const p = url.match(/^\/api\/day\/([^/]+)\/([^/]+)$/);
  if (req.method === 'PUT' && p) {
    const loc = decodeURIComponent(p[1]);
    const date = decodeURIComponent(p[2]);
    if (!LOC_RE.test(loc) || !DATE_RE.test(date)) return sendJSON(res, 400, { error: 'bad location/date' });
    readBody(req, async (body) => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch { return sendJSON(res, 400, { error: 'bad json' }); }
      if (!store[loc]) store[loc] = {};
      store[loc][date] = parsed;
      // Only report success once the change is actually on disk. If the write
      // fails, return 500 so the client keeps the day queued and retries rather
      // than clearing it as saved.
      try {
        await persist();
        sendJSON(res, 200, { ok: true });
      } catch (e) {
        console.error('persist error:', e.message);
        sendJSON(res, 500, { error: 'not saved' });
      }
    });
    return;
  }
  sendJSON(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (url.startsWith('/api/')) return handleApi(req, res, url);

  // static files
  let urlPath = decodeURIComponent(url);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return fs.readFile(path.join(ROOT, 'index.html'), (e2, home) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
        res.end(home);
      });
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    // The HTML, CSS and JS change on every deploy, so make browsers (and the
    // iOS home-screen web app) revalidate them instead of serving a stale copy.
    // Icons/images are effectively immutable, so let them cache for a day.
    const cache = ['.html', '.css', '.js', '.webmanifest'].includes(ext)
      ? 'no-cache'
      : 'public, max-age=86400';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Café records site running on port ${PORT} (data: ${DATA_FILE})`);
});
