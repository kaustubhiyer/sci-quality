# SCI Quality — Shri Cauvery Industries

A zero-cost, offline-capable inspection app for the factory floor. Runs entirely
in the browser on an Android tablet — no backend, no hosting cost, and **all
report data stays on the device** (IndexedDB). Only the app files themselves are
served from GitHub Pages.

## What it does

- **Inspection Report** form matching the SCI quality template: part details,
  a measurements table (parameter / specification / tolerance / instrument /
  up to 10 readings), condition checks, remarks, result, and a finger-drawn
  signature.
- Out-of-tolerance readings highlight red automatically (in the app and in the PDF).
- Generates a branded **A4 landscape PDF** — save to Files or print.
- **Share / Email** opens the Android share sheet with the PDF attached and a
  pre-written email body — pick Gmail and send.
- Saved reports list with search, and **duplicate** (same part & parameters,
  fresh readings) for repeat inspections.
- Installable to the home screen (PWA) and works fully offline after first load.

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
