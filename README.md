# Oral Health Screening

An offline-capable oral health screening form covering **DMFT/dmft** (caries),
**PUFA/pufa** (consequences of untreated caries), **CPITN** (periodontal
status) and a structured **oral cancer screening** checklist - built to run
on a phone or tablet at school/community screening camps with unreliable or
no internet access.

See [`docs/CLINICAL-REFERENCE.md`](docs/CLINICAL-REFERENCE.md) for the exact
WHO-aligned criteria and codes used, with citations.

## How it works

```
Phone/tablet (works fully offline)
  GitHub Pages — static PWA (no build step)
  +- Service worker  -> caches the app so it loads with zero signal
  +- IndexedDB        -> every completed screening is queued locally
  +- Sync engine       -> when back online, POSTs queued records
         |  (JSON, over HTTPS)
         v
  Google Apps Script Web App (doPost)
  +- validates an access code, de-duplicates by record ID,
     appends one row per screening to a Google Sheet
```

Nothing is lost if the device goes offline mid-screening: a finished
screening is written to the browser's IndexedDB immediately, and only
marked "synced" once the Apps Script backend confirms the row was written.
A pending-count badge and "Sync now" button are always visible.

**Note on data sensitivity:** Google Sheets is not a HIPAA/encrypted
clinical-records system. Prefer an anonymised patient ID over full
name/contact details unless you're comfortable with identifiable data living
in a Sheet.

## One-time setup

### 1. Create the Google Sheet + Apps Script backend

1. Go to [sheets.google.com](https://sheets.google.com) and create a new,
   blank spreadsheet. Name it something like "Oral Screening Data".
2. In the Sheet, go to **Extensions > Apps Script**.
3. Delete the default placeholder code in `Code.gs`, then paste in the
   contents of [`apps-script/Code.gs`](apps-script/Code.gs) from this repo.
4. Save the project (File > Save, or Ctrl/Cmd+S). Name it "Oral Screening API".
5. Set your access code: **Project Settings** (gear icon, left sidebar) >
   scroll to **Script Properties** > **Add script property**.
   - Property: `ACCESS_CODE`
   - Value: any password-like string you'll share with your examiners
     (e.g. `camp2026-greenfield`)
6. Back in the editor, click **Deploy > New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone**.
   - Click **Deploy**, then **Authorize access** and approve the permissions
     (this is your own script, acting on your own Sheet).
7. Copy the **Web app URL** it gives you (ends in `/exec`) - you'll paste
   this into the app's Settings screen in step 3 below.

A tab named "Screenings" is created automatically in your Sheet the first
time a screening is submitted, with a header row.

**Re-deploying after editing Code.gs:** Apps Script Web App URLs don't
change on their own, but if you edit `Code.gs` later you must create a
**new deployment version** for the change to go live (Deploy > Manage
deployments > edit (pencil) > Version: New version > Deploy).

### 2. Publish the frontend on GitHub Pages

1. In this repository's GitHub settings: **Settings > Pages**.
2. Source: **Deploy from a branch**. Branch: your default branch, folder `/ (root)`.
3. Save. GitHub will give you a URL like
   `https://<your-username>.github.io/<repo-name>/`.

### 3. Configure the app (once per device)

1. Open the GitHub Pages URL on the phone/tablet you'll screen with.
2. Tap the gear icon (Settings).
3. Paste in the **Apps Script Web App URL** from step 1.6, and the
   **access code** you set in step 1.5.
4. Optionally set a default examiner name and camp/location to save typing.
5. Tap **Test connection** to confirm it can reach your Apps Script backend,
   then **Save**.
6. (Recommended) Add the app to the home screen (browser menu > "Add to
   Home Screen" / "Install app") so it opens full-screen and is easy to
   find without a browser address bar.

The access code and URL are stored only in that browser's local storage -
they are never committed to this repository.

## Using it in the field

1. Tap **+ New Screening**.
2. Fill in patient info, pick Primary (child) or Permanent (adult)
   dentition, and your camp/location.
3. Step through the DMFT/dmft tooth chart, PUFA/pufa (auto-filtered to
   decayed teeth), CPITN sextants, and the oral cancer screening checklist.
4. Review the auto-calculated scores and submit. It's saved locally right
   away.
5. Whenever the device has a connection, pending screenings sync
   automatically in the background; you can also force it with **Sync now**
   on the home screen.

Everything works with the phone in airplane mode except the actual sync to
the Sheet - which simply waits until you're back online.

## Repository layout

```
index.html, manifest.json, service-worker.js   PWA shell
css/styles.css                                  styling
js/scoring.js                                   DMFT/PUFA/CPITN/cancer scoring logic
js/db.js                                        IndexedDB wrapper (local queue)
js/sync.js                                      sync engine (queue -> Apps Script)
js/app.js                                        UI / form flow
assets/icons/                                   PWA icons
apps-script/Code.gs                             Google Apps Script backend (paste into Apps Script editor)
docs/CLINICAL-REFERENCE.md                      WHO criteria/codes used, with citations
```

## Troubleshooting

**"My Sheet has no columns / no 'Screenings' tab":** the tab and header row
are created automatically the first time the backend is hit, not when you
deploy. Two ways to create it right now, no device needed:
- In the Apps Script editor, pick **testSetup** from the function dropdown
  (next to the Run button) and click **Run**. Check the execution log, then
  check your Sheet - a "Screenings" tab with headers should now exist.
- Or just tap **Test connection** in the app's Settings screen - this also
  creates it now.

If either of those fails with an error mentioning `getActiveSpreadsheet`,
the script isn't bound to your Sheet - it was likely created from
[script.google.com](https://script.google.com) directly instead of via
**Extensions > Apps Script** from inside the Sheet itself. Delete that
script project and redo step 1 from inside the Sheet.

If you already had a deployment running before this fix (`doGet` used to be
a no-op), you don't need to redo anything to use `testSetup` - just paste
the latest `Code.gs` into your existing project and run it from the editor.
To also make future **Test connection** calls create the tab, redeploy:
**Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy**.

## Local development

No build step - it's plain HTML/CSS/JS. Serve the folder with any static
server and open it in a browser, e.g.:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

To test offline behaviour, open DevTools > Application > Service Workers
and check "Offline", or use DevTools > Network > "Offline".
