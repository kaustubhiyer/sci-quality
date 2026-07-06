/*
 * Form registry — to add a new form in the future:
 *   1. Create js/forms/<your-form>.js that calls SCI.registerForm({...schema})
 *   2. Add a <script> tag for it in index.html (and to the PRECACHE list in sw.js)
 * The app renders forms, saves them, and generates PDFs entirely from the schema.
 *
 * Schema shape:
 * {
 *   id: 'unique-id',
 *   title: 'Form Title',
 *   icon: '📋',                      // emoji shown on the home card
 *   description: 'Card subtitle',
 *   sections: [
 *     { type: 'fields', title, fields: [{ key, label, input: 'text'|'number'|'date'|'select', options?, wide?, default? }] },
 *     { type: 'measurements', key, title, defaultRows, maxReadings, defaultReadings },
 *     { type: 'checks', key, title, items: [{ key, label }], options: ['OK','Not OK','N/A'] },
 *     { type: 'textarea', key, title, label, placeholder? },
 *     { type: 'signature', key, title },
 *   ],
 *   summary(data)  -> { title, subtitle, status: 'ok'|'bad'|'draft' }   // home list entry
 *   fileName(data) -> 'name-without-extension'
 *   emailText(data)-> body text used when sharing
 * }
 */
window.SCI = window.SCI || {};
SCI.forms = {};
SCI.registerForm = schema => { SCI.forms[schema.id] = schema; };
