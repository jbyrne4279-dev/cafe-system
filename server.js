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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOC_RE = /^[a-z0-9-]{1,40}$/;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

/* ---- record store (in memory, flushed to disk, writes serialised) ---- */
let store = {};
try { store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { store = {}; }

let writeChain = Promise.resolve();
function persist() {
  writeChain = writeChain
    .then(() => fs.promises.mkdir(DATA_DIR, { recursive: true }))
    .then(() => fs.promises.writeFile(DATA_FILE, JSON.stringify(store)))
    .catch((e) => console.error('persist error:', e.message));
  return writeChain;
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
    if (added) persist();
    console.log(`Demo seed v${SEED_VERSION}: added ${added} day-records.`);
  } catch (e) { console.error('seed error:', e.message); }
}
seedOnce();

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function handleApi(req, res, url) {
  // GET /api/data/:location
  const g = url.match(/^\/api\/data\/([^/]+)$/);
  if (req.method === 'GET' && g) {
    const loc = decodeURIComponent(g[1]);
    if (!LOC_RE.test(loc)) return sendJSON(res, 400, { error: 'bad location' });
    return sendJSON(res, 200, store[loc] || {});
  }
  // PUT /api/day/:location/:date
  const p = url.match(/^\/api\/day\/([^/]+)\/([^/]+)$/);
  if (req.method === 'PUT' && p) {
    const loc = decodeURIComponent(p[1]);
    const date = decodeURIComponent(p[2]);
    if (!LOC_RE.test(loc) || !DATE_RE.test(date)) return sendJSON(res, 400, { error: 'bad location/date' });
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (!store[loc]) store[loc] = {};
        store[loc][date] = parsed;
        persist();
        sendJSON(res, 200, { ok: true });
      } catch { sendJSON(res, 400, { error: 'bad json' }); }
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
