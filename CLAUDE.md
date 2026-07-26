 # IMPORTANT
Stop whenever /compact should be used.
Keep ouputs as short,consise as possible
Dont write every step of the task while doing it, just complete it and report.

# CLAUDE.md — agent index (high level)

Attendance-taking PWA for a 3-events-per-morning roll call, with a Google Sheet
backend. Zero build step for the frontend (static files served as-is); the
backend is a clasp-managed Apps Script project (`package.json` only pulls in
`@google/clasp` as a devDependency).

## FILES

| File | Role |
|---|---|
| `index.html` | The app (dark theme) — all UI, state, and upload logic in one file. Registers `sw.js`. |
| `apps-script.gs` | Backend, container-bound to the Sheet — see APPS SCRIPT BACKEND below. |
| `.claspignore` | Restricts `clasp push` to `apps-script.gs` + `appsscript.json` — everything else (index.html, manifest.json, icons) must stay excluded or it gets swept into the Apps Script project as bogus source. |
| `sw.js` | Service worker: network-first for `index.html` (edits reach devices immediately), cache-first for icons/manifest; falls back to cache offline. |

(`appsscript.json`, `.clasp.json`, `manifest.json`, icons are standard scaffolding/assets — no project-specific behavior worth indexing.)

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
- Deploy flow: `npx clasp push` updates the script project's HEAD code only.
  The live `/exec` URL (pasted into the app's Settings) is pinned to a specific
  *versioned* deployment, so a push alone does not go live — follow it with
  `npx clasp deploy -i <deploymentId>` (see `npx clasp deployments` for the id)
  to publish a new version to that same deployment and keep the URL stable.
  Live deployment id: `AKfycbyGpusHprC25Bm5QJ6Gk0QwM8_an8eECw1jKFer68qf6pfGLbHlX-foItU9zy9v2mX82w`.

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
