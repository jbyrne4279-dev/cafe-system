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

This is the **base version**: a static website (HTML/CSS/JavaScript) with no
server. Each week's records are saved in the browser on the device you use it on
(via `localStorage`), so it works straight away with nothing to install. You can
export any week as JSON or print it (Print / PDF) for the paper file.

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
```

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
