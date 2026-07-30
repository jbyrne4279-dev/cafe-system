# Café Daily Records

A simple, mobile-friendly website for a café to keep its daily food-safety and
cleaning records in one place:

- **Fridge & Freezer temperatures** – logs readings and flags anything out of range.
- **Hot Food temperatures** – cooking, reheating and hot-holding checks.
- **Cleaning tasks** – a daily checklist that staff tick off with their initials.
- **Daily Summary** – an at-a-glance overview of the day, with notes and manager sign-off.

## How it works

This is the **base version**: a static website (HTML/CSS/JavaScript) with no
server required. Each day's records are saved in the browser on the device
you use it on (via `localStorage`), so it works straight away with nothing to
install.

## Running it

Just open `index.html` in a browser, or serve the folder locally:

```bash
# Python
python3 -m http.server 8000
# then visit http://localhost:8000
```

You can also host it for free (e.g. GitHub Pages) so it opens like a normal
website on the café's tablet or phone.

## Project structure

```
index.html      Page layout and the four record sections
css/styles.css  Styling (mobile-first, print-friendly)
js/app.js       App logic and browser storage
```

## Temperature rules used

| Check         | Safe range        |
|---------------|-------------------|
| Fridge        | 0 °C to 5 °C      |
| Freezer       | −18 °C or below   |
| Cooking       | 75 °C or above    |
| Reheating     | 75 °C or above    |
| Hot holding   | 63 °C or above    |

These are sensible defaults and are easy to adjust in `js/app.js` (`RULES`).

## Planned next steps

- Tailor the layout to match the café's paper forms (from the photos provided).
- Optional cloud sync so records are shared across devices and backed up.
- Weekly / monthly views and PDF export of a full period.
- Café name, logo and custom default cleaning checklist.
