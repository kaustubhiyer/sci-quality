# SCI Quality — Shri Cauvery Industries

A zero-cost, offline-capable inspection app for the factory floor. Runs entirely
in the browser on an Android tablet — no backend, no hosting cost, and **all
report data stays on the device** (IndexedDB). Only the app files themselves are
served from GitHub Pages.

## What it does

- **Inspection Report** form matching the SCI quality template: part details,
  a measurements table (parameter / specification / tolerance / instrument /
  up to 10 readings, tapped-hole rows), condition checks, remarks, result, and
  a finger-drawn signature. Out-of-tolerance readings highlight red (app + PDF).
- **Per-piece tracking**: every physical piece is WO No. + Part No. + Serial.
  Reading column *i* corresponds to piece *start + i − 1*; each piece gets its
  own OK / Deviation / Challan / Rework / Rejected verdict.
- **Full lifecycle** (Parts tab): internal OK → Awaiting TPI → TPI approval
  (email OTP or PIN) → Ready → Dispatch → Dispatched. Not-OK pieces go to
  Deviation (photos + email request), Delivery Challan (client approve →
  skips TPI / reject → rework), Rework (re-inspect, same serial), or
  Rejected (scrapped, record kept). Every move is history-logged.
- **Dispatch groups**: create one per delivery day, add approved parts, and
  generate a single email with ALL inspection report PDFs attached.
- **Stats dashboard**: totals, accepted/rejected pie, deviation & challan &
  scrapped lists, internal and TPI acceptance rates.
- **Settings** (admin-PIN protected): manage TPIs and their emails, email-OTP
  endpoint, backup/restore.
- Branded **A4 landscape PDFs**, Android share-sheet emailing, installable
  PWA, fully offline after first load. All data stays on the device.

## TPI email OTP setup (one time, ~5 min)

TPI approval codes are emailed from **your own Gmail** via a Google Apps
Script — see [docs/otp-apps-script.gs](docs/otp-apps-script.gs) for the code
and step-by-step instructions, then paste the deployed URL + secret into
Settings. Until then, TPIs can use a fallback PIN set in Settings.

## Backups

Everything lives in the tablet's browser storage. Use **Settings → Back up
now** weekly (share the file to Google Drive or email) — the app reminds you
when a backup is overdue. Restore replaces all data from a backup file.

## Install on the tablet (one time)

1. Open the GitHub Pages URL in Chrome on the tablet.
2. Chrome menu (⋮) → **Add to Home screen** → **Install**.
3. Launch from the home-screen icon — it opens full-screen like a native app.

## Adding a new form type

The app is schema-driven. To add a form:

1. Copy `js/forms/inspection-report.js` to `js/forms/<new-form>.js` and edit the
   schema (see the section-type reference in `js/forms/registry.js`).
2. Add a `<script>` tag for it in `index.html`.
3. Add its path to the `PRECACHE` list in `sw.js`.
4. **Bump `VERSION` in `sw.js`** (required for installed tablets to pick up any
   change) and push.

The new form automatically appears on the home screen, saves to history, and
gets PDF + share support from the same schema.

## Development

Any static file server works, e.g.:

```
python -m http.server 8734
```

No build step. Vendored libraries (jsPDF + autotable) live in `vendor/`.
