# North Herts Museum Café — Daily Records

A simple, mobile-friendly website that replaces the café's paper record sheets.
It is organised **by week** (like the paper forms) and mirrors them closely:

1. **Fridge & Freezer Temperature Reading Chart** – a weekly grid of the café's
   units with **AM / PM** readings each day and an **Officer Initials** row.
   Cells colour automatically: green (in range), amber (check), red (out of range).
2. **Daily Cleaning Tasks** – a weekly grid of the café's cleaning tasks; tap a
   cell to tick it or add initials.
3. **Daily Diary** – the Food Standards Agency *Safer Food, Better Business*
   layout: "any problems or changes", opening/closing checks, name and signature
   for each day.
4. **Hot Food Temperatures** – an extra log for cooking, reheating and hot holding.
5. **Weekly Summary** – readings, alerts, cleaning completion and diary sign-off
   at a glance.

The unit list, cleaning tasks and temperature ranges come straight from the
café's current forms and can be edited in the app or in `js/app.js`.

## How it works

A day-at-a-time record book for several café locations (North Herts Museum Café,
Howard Park, Bancroft — pick one from the dropdown at the top). Each location
keeps its own records.

Records are stored **in the cloud** via a tiny built-in API (`server.js`) so
every phone/tablet shares the same data. The app also caches each day in the
browser, so it keeps working with no signal and syncs automatically when back
online (see the "Saved to cloud ✓" line at the bottom). Owners can **print any
day** or **download a whole month's report** (a printable HTML file) for the
legal log book.

### Data storage & backup (Railway Volume)

Records live in a JSON file at `DATA_DIR/records.json`. On Railway, attach a
**Volume** so the data survives redeploys:

1. Railway → your **cafe-system** service → **Variables** → add `DATA_DIR` = `/data`
2. Railway → the service → **Volumes** → **New Volume**, mount path `/data`
3. Redeploy.

Locally it defaults to `./data/` (git-ignored).

## Running it

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

It can also be hosted for free (e.g. GitHub Pages) so it opens like a normal
website on the café's tablet or phone.

## Project structure

```
index.html      Layout: header, week navigation, and the five sections
css/styles.css  Styling (mobile-first, print-friendly)
js/app.js       App logic, weekly data model and browser storage
server.js       Tiny zero-dependency static server (used for hosting)
railway.json    Railway deployment config
package.json    Start script (npm start → node server.js)
```

## Deploying to Railway

The repo is Railway-ready. In the Railway dashboard:

1. **New Project → Deploy from GitHub repo** and pick `jbyrne4279-dev/cafe-system`
   (branch `main`).
2. Railway auto-detects Node, runs `npm install`, then `npm start`
   (`node server.js`). No extra settings needed — the server binds to the
   `PORT` Railway provides.
3. Under the service's **Settings → Networking**, click **Generate Domain** to
   get a public URL.

After the first connection, every push to `main` redeploys automatically.
Health checks hit `/healthz`.

## Temperature rules

| Check       | In range (green) | Check (amber) | Out of range (red) |
|-------------|------------------|---------------|--------------------|
| Fridge      | ≤ 5 °C           | 5–8 °C        | > 8 °C             |
| Freezer     | ≤ −18 °C         | −18 to −12 °C | > −12 °C           |
| Hot holding | ≥ 63 °C          | —             | < 63 °C            |
| Cooking/reheating | ≥ 75 °C    | —             | < 75 °C            |

These defaults are easy to adjust in `js/app.js` (`evalTemp` / `HOT_RULES`).

## Planned next steps

- Café logo and a proper icon.
- Optional cloud sync so records are shared across devices and backed up
  (the current version is per-device).
- Monthly view and a single PDF export of a full week/month for the file.
- Simple sign-in so only staff can edit.
