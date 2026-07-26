# IMPORTANT
Stop whenever /compact should be used.
Keep ouputs as short,consise as possible
Dont write every step of the task while doing it, just complete it and report.

# CLAUDE.md — agent index (high level)

Attendance-taking PWA for a 3-events-per-morning roll call, with a Google Sheet
backend. Zero build step, no git repo, no package.json — static files served as-is.

## FILES

| File | Role |
|---|---|
| `index.html` | The app (dark theme). All UI, state, and upload logic live here. Registers `sw.js`. |
| `apps-script.gs` | Backend. Paste into Extensions>Apps Script of the target Google Sheet (container-bound). Receives POSTs, writes attendance codes into a grid, handles weekly sheet rotation. |
| `manifest.json` | PWA manifest, `start_url:"./index.html"`. |
| `sw.js` | Service worker. Network-first for the app shell (`index.html`) so edits reach devices immediately; cache-first for icons/manifest. Falls back to cache when offline. |
| `icon-192.png`, `icon-512.png` | PWA icons. |

## DATA MODEL

- `GROUPS: string[]` — group/team names.
- `PEOPLE: {name, group}[]` — master roster; order = display order.
- Exactly 3 events per day, fixed semantics (not data-driven):
  - **Event 1** — per-person override times, global default fallback.
  - **Event 2** — per-group times.
  - **Event 3** — single global time for everyone.
- Reporting-window defaults: E1 04:30/06:45, E2 06:45/07:30, E3 07:30/08:00 (start/end).
- Settings (times, script URL) and daily attendance entries both persist to
  `localStorage`. Entries are keyed per-day (`at_staged_YYYY-MM-DD`), and older
  days' keys are pruned on load, so the app survives being closed/killed
  mid-morning without losing or colliding staged entries.

## APPS SCRIPT BACKEND

- `doPost(e)` — HTTP entry point; body = JSON array of entry objects; writes into
  the `current` sheet grid; per-row errors go to an `Errors` sheet without
  aborting the batch.
- Grid column formula assumes **exactly 3 events/day**. Adding a 4th event
  requires changing that stride and the sheet layout.
- New people added to `PEOPLE` must also exist as a row in the `Template` sheet,
  matched by exact normalized name — otherwise their taps silently error.
- `rotateWeek()` archives the current week's sheet and duplicates `Template` as
  the new `current`; runs off a Sunday 22:00 trigger installed once manually via
  `setupWeeklyTrigger()`.

## GOTCHAS

- Apps Script sheet tab must literally exist as `"current"` (any case).
- Bhima group currently has zero members in `PEOPLE` (dead group, kept for future
  roster growth).
- No periodic re-check of absentee status — badges only update on user
  interaction/reload, not on a timer.
- `scriptUrl` and upload payload shape aren't validated beyond basics — a
  malformed URL just surfaces as a fetch failure toast.

## UPDATE-PROTOCOL

Keep this file high-level: architecture, data model, gotchas. Do not add a
line-by-line symbol/line-number index — re-derive exact locations from the code
when needed. Prune stale facts on every edit; no changelog/history section.
