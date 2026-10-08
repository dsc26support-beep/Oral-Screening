# Live Handoff

## Goal
Dentist wants offline-capable oral health screening form: DMFT/dmft, PUFA/pufa,
CPITN, oral cancer screening. GitHub Pages frontend (static PWA), Google
Apps Script + Sheets backend. Must work with zero connectivity in field camps.

## State
- Repo was empty at session start. Built full PWA, pushed to
  `claude/nice-goldberg-d7pv4c` (this IS the repo's default branch now, since
  repo had no prior branches — no `main` exists, so no PR made/possible).
- Files: index.html, css/styles.css, js/{scoring,db,sync,app}.js,
  service-worker.js, manifest.json, assets/icons/*, apps-script/Code.gs,
  README.md, docs/CLINICAL-REFERENCE.md.
- Verified end-to-end with real headless Chromium (Playwright): full form
  flow, offline reload, sync vs mock Apps Script server, bad-access-code
  rejection. All passing, no console errors.
- Latest commit (9c8b8e2): renamed patient "Gender" field -> "Sex", cut to
  Male/Female only (no blank/Other), across index.html, js/app.js,
  apps-script/Code.gs. Also tested live, works.
- User has NOT yet done Google Sheet / Apps Script deploy or GitHub Pages
  setup — that's on them, steps are in README.md.

## Key decisions (why)
- Both child (dmft/pufa) + adult (DMFT/PUFA) via toggle; mixed dentition
  (ages 6-12) -> examiner picks one set, no true mixed chart (scope cut).
- Full interactive 32/20-tooth chart + full 6-sextant CPITN (user's explicit
  choice over quick-count/simplified alternatives).
- Access code + Apps Script URL live in browser localStorage via in-app
  Settings screen, never committed to repo (it's public).
- Sync POST uses `Content-Type: text/plain` (not json) specifically to
  dodge CORS preflight — Apps Script can't handle OPTIONS. Verified working.
- Anonymized patient ID recommended, not enforced — Sheets isn't HIPAA-grade.

## Gotchas
- Fixed real bug: `.modal-overlay[hidden]` wasn't hiding — author
  `display:flex` beat UA `[hidden]` default. Added explicit
  `.modal-overlay[hidden]{display:none}`.
- ACCESS_CODE must be set via Apps Script Script Properties, not hardcoded
  (Code.gs is a public template in repo).
- If user deployed Sheet before Sex rename, old column was "patientGender";
  new writes use "patientSex" — may need manual header reconciliation.

## Open questions / next steps
- Waiting on user to: create Sheet, paste Code.gs, set ACCESS_CODE, deploy
  Web App, enable Pages (branch claude/nice-goldberg-d7pv4c, root), set
  Settings screen on-device.
- Offered to help verify live sync once they've done Google-side setup.
