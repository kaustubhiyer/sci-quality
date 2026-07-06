/* App shell: home screen, schema-driven form renderer, autosave. */
(() => {
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const viewHome = $('#view-home');
  const viewForm = $('#view-form');

  let current = null;        // { report, schema, dirty }
  let saveTimer = null;
  let sigPad = null;

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }
  SCI.toast = toast;

  /* ---------- home ---------- */
  function renderFormCards() {
    const wrap = $('#form-cards');
    wrap.innerHTML = '';
    Object.values(SCI.forms).forEach(schema => {
      const card = el('button', 'form-card');
      const icon = el('div', 'card-icon', schema.icon || '📄');
      const body = el('div');
      body.append(el('div', 'card-name', schema.title), el('div', 'card-desc', schema.description || ''));
      card.append(icon, body);
      card.addEventListener('click', () => openForm(newReport(schema)));
      wrap.append(card);
    });
  }

  function newReport(schema, data) {
    return {
      id: SCI.db.newId(),
      formId: schema.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: data || defaultData(schema),
    };
  }

  function defaultData(schema) {
    const data = {};
    schema.sections.forEach(sec => {
      if (sec.type === 'fields') {
        sec.fields.forEach(f => {
          if (f.default === 'today') data[f.key] = new Date().toISOString().slice(0, 10);
          else if (f.default !== undefined) data[f.key] = f.default;
        });
      } else if (sec.type === 'measurements') {
        data[sec.key] = {
          readings: sec.defaultReadings || 5,
          rows: Array.from({ length: sec.defaultRows || 5 }, () => blankRow(sec)),
        };
      } else if (sec.type === 'checks') {
        data[sec.key] = {};
      }
    });
    return data;
  }

  const blankRow = sec => ({ parameter: '', spec: '', tol: '', instrument: '', r: Array(sec.maxReadings || 10).fill('') });

  async function renderReportList() {
    const listEl = $('#report-list');
    const q = ($('#report-search').value || '').toLowerCase();
    const reports = await SCI.db.list();
    listEl.innerHTML = '';
    let shown = 0;

    reports.forEach(report => {
      const schema = SCI.forms[report.formId];
      if (!schema) return;
      const s = schema.summary(report.data);
      const hay = (s.title + ' ' + s.subtitle).toLowerCase();
      if (q && !hay.includes(q)) return;
      shown++;

      const item = el('div', 'report-item');
      const body = el('div', 'ri-body');
      body.append(el('div', 'ri-title', s.title), el('div', 'ri-sub', [schema.title, s.subtitle].filter(Boolean).join(' — ')));
      body.addEventListener('click', () => openForm(report));

      const chip = el('span', 'chip ' + (s.status || 'draft'), s.statusLabel || 'Draft');

      const actions = el('div', 'ri-actions');
      const btnDup = el('button', 'icon-btn', '⧉');
      btnDup.title = 'Duplicate (same part, fresh readings)';
      btnDup.addEventListener('click', async () => {
        const copy = newReport(schema, duplicateData(schema, report.data));
        await SCI.db.save(copy);
        openForm(copy);
        toast('Duplicated — readings cleared');
      });
      const btnDel = el('button', 'icon-btn', '🗑');
      btnDel.title = 'Delete';
      btnDel.addEventListener('click', async () => {
        if (!confirm('Delete this report? This cannot be undone.')) return;
        await SCI.db.remove(report.id);
        renderReportList();
      });
      actions.append(btnDup, btnDel);
      item.append(body, chip, actions);
      listEl.append(item);
    });

    $('#report-empty').hidden = shown > 0;
  }

  /* Duplicate keeps part details & parameters but clears readings, result, signature. */
  function duplicateData(schema, data) {
    const copy = JSON.parse(JSON.stringify(data));
    schema.sections.forEach(sec => {
      if (sec.type === 'measurements' && copy[sec.key]) {
        copy[sec.key].rows.forEach(row => { row.r = row.r.map(() => ''); });
      }
      if (sec.type === 'signature') delete copy[sec.key];
      if (sec.type === 'checks') copy[sec.key] = {};
    });
    delete copy.result;
    copy.date = new Date().toISOString().slice(0, 10);
    return copy;
  }

  /* ---------- form rendering ---------- */
  async function openForm(report) {
    const schema = SCI.forms[report.formId];
    const existing = await SCI.db.get(report.id);
    current = { report, schema, touched: !!existing };
    $('#form-title').textContent = schema.title;
    $('#save-status').textContent = '';
    const main = $('#form-sections');
    main.innerHTML = '';
    sigPad = null;

    schema.sections.forEach(sec => {
      const card = el('section', 'card');
      if (sec.type === 'fields') renderFields(card, sec);
      else if (sec.type === 'measurements') renderMeasurements(card, sec);
      else if (sec.type === 'checks') renderChecks(card, sec);
      else if (sec.type === 'textarea') renderTextarea(card, sec);
      else if (sec.type === 'signature') renderSignature(card, sec);
      main.append(card);
    });

    viewHome.hidden = true;
    viewForm.hidden = false;
    window.scrollTo(0, 0);
  }

  function markDirty() {
    if (current) current.touched = true;
    $('#save-status').textContent = 'Unsaved changes…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCurrent, 1200);
  }

  async function saveCurrent(showToast) {
    if (!current || (!current.touched && !showToast)) return;
    clearTimeout(saveTimer);
    current.touched = true;
    await SCI.db.save(current.report);
    $('#save-status').textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (showToast) toast('Report saved on this device');
  }

  function renderFields(card, sec) {
    if (sec.title) card.append(el('h3', null, sec.title));
    const grid = el('div', 'fields-grid');
    sec.fields.forEach(f => {
      const wrap = el('div', 'field' + (f.wide ? ' wide' : ''));
      const label = el('label', null, f.label);
      let input;
      if (f.input === 'select') {
        input = el('select');
        input.append(el('option', null, ''));
        (f.options || []).forEach(o => {
          const opt = el('option', null, o);
          opt.value = o;
          input.append(opt);
        });
      } else {
        input = el('input');
        input.type = f.input || 'text';
        if (f.input === 'number') input.inputMode = 'decimal';
      }
      input.value = current.report.data[f.key] || '';
      input.addEventListener('input', () => {
        current.report.data[f.key] = input.value;
        markDirty();
      });
      wrap.append(label, input);
      grid.append(wrap);
    });
    card.append(grid);
  }

  /* --- measurements table --- */
  function renderMeasurements(card, sec) {
    const m = current.report.data[sec.key];

    const head = el('h3', null, sec.title || 'Measurements');
    card.append(head);

    const scroll = el('div', 'table-scroll');
    const table = el('table', 'm-table');
    scroll.append(table);
    card.append(scroll);

    const tools = el('div', 'table-tools');
    const btnAdd = el('button', 'btn-add', '+ Add row');
    btnAdd.addEventListener('click', () => {
      m.rows.push(blankRow(sec));
      markDirty();
      buildTable();
    });

    const ctl = el('div', 'readings-ctl');
    ctl.append(el('span', null, 'Readings per parameter:'));
    const selN = el('select');
    for (let i = 1; i <= (sec.maxReadings || 10); i++) {
      const o = el('option', null, String(i));
      o.value = i;
      selN.append(o);
    }
    selN.value = m.readings;
    selN.addEventListener('change', () => {
      m.readings = parseInt(selN.value, 10);
      markDirty();
      buildTable();
    });
    ctl.append(selN);

    tools.append(btnAdd, ctl, el('span', 'tol-hint', 'Out-of-tolerance readings turn red automatically'));
    card.append(tools);

    function buildTable() {
      table.innerHTML = '';
      const thead = el('thead');
      const hr = el('tr');
      ['#', 'Parameter', 'Specification', 'Tolerance ±', 'Instrument'].forEach(h => hr.append(el('th', null, h)));
      for (let i = 1; i <= m.readings; i++) hr.append(el('th', null, String(i)));
      hr.append(el('th', null, ''));
      thead.append(hr);
      table.append(thead);

      const tbody = el('tbody');
      m.rows.forEach((row, ri) => {
        const tr = el('tr');
        tr.append(el('td', 'sl', String(ri + 1)));

        const mkCell = (key, cls, width) => {
          const td = el('td');
          const inp = el('input', cls);
          if (width) inp.style.width = width;
          inp.value = row[key];
          if (key === 'spec' || key === 'tol') inp.inputMode = 'decimal';
          inp.addEventListener('input', () => {
            row[key] = inp.value;
            markDirty();
            if (key === 'spec' || key === 'tol') refreshRowTol(tr, row, m.readings);
          });
          td.append(inp);
          return td;
        };
        tr.append(mkCell('parameter'), mkCell('spec', null, '92px'), mkCell('tol', null, '84px'), mkCell('instrument', null, '104px'));

        for (let i = 0; i < m.readings; i++) {
          const td = el('td');
          const inp = el('input', 'reading');
          inp.inputMode = 'decimal';
          inp.value = row.r[i] || '';
          inp.addEventListener('input', () => {
            row.r[i] = inp.value;
            markDirty();
            applyTolClass(inp, row);
          });
          td.append(inp);
          tr.append(td);
        }

        const tdDel = el('td');
        const del = el('button', 'row-del', '✕');
        del.title = 'Remove row';
        del.addEventListener('click', () => {
          m.rows.splice(ri, 1);
          if (!m.rows.length) m.rows.push(blankRow(sec));
          markDirty();
          buildTable();
        });
        tdDel.append(del);
        tr.append(tdDel);

        tbody.append(tr);
        refreshRowTol(tr, row, m.readings);
      });
      table.append(tbody);
    }

    function refreshRowTol(tr, row, n) {
      const inputs = tr.querySelectorAll('input.reading');
      inputs.forEach(inp => applyTolClass(inp, row));
    }

    buildTable();
  }

  /* "±0.5", "0.5", "+0.5" → 0.5; anything unparseable → null (no highlighting) */
  SCI.parseTol = t => {
    if (t === undefined || t === null) return null;
    const v = parseFloat(String(t).replace(/[±+\s]/g, ''));
    return isNaN(v) ? null : Math.abs(v);
  };
  SCI.isOutOfTol = (spec, tol, reading) => {
    const s = parseFloat(spec), t = SCI.parseTol(tol), r = parseFloat(reading);
    if (isNaN(s) || t === null || isNaN(r) || String(reading).trim() === '') return false;
    return Math.abs(r - s) > t + 1e-9;
  };

  function applyTolClass(inp, row) {
    inp.classList.toggle('out-tol', SCI.isOutOfTol(row.spec, row.tol, inp.value));
  }

  /* --- checks --- */
  function renderChecks(card, sec) {
    card.append(el('h3', null, sec.title || 'Checks'));
    const state = current.report.data[sec.key];
    sec.items.forEach(item => {
      const row = el('div', 'check-row');
      row.append(el('div', 'ck-label', item.label));
      const seg = el('div', 'seg');
      (sec.options || ['OK', 'Not OK', 'N/A']).forEach(opt => {
        const b = el('button', null, opt);
        b.type = 'button';
        const selClass = opt === 'OK' ? 'sel-ok' : opt === 'Not OK' ? 'sel-bad' : 'sel-na';
        const sync = () => b.className = state[item.key] === opt ? selClass : '';
        b.addEventListener('click', () => {
          state[item.key] = state[item.key] === opt ? '' : opt;
          seg.querySelectorAll('button').forEach(x => x.className = '');
          sync();
          markDirty();
        });
        sync();
        seg.append(b);
      });
      row.append(seg);
      card.append(row);
    });
  }

  function renderTextarea(card, sec) {
    card.append(el('h3', null, sec.title || sec.label));
    const wrap = el('div', 'field wide');
    const ta = el('textarea');
    ta.placeholder = sec.placeholder || '';
    ta.value = current.report.data[sec.key] || '';
    ta.addEventListener('input', () => {
      current.report.data[sec.key] = ta.value;
      markDirty();
    });
    wrap.append(ta);
    card.append(wrap);
  }

  function renderSignature(card, sec) {
    card.append(el('h3', null, sec.title || 'Signature'));
    const wrap = el('div', 'sig-wrap');
    const canvas = el('canvas', 'sig-canvas');
    const clear = el('button', 'sig-clear', 'Clear');
    wrap.append(canvas, clear);
    card.append(wrap, el('div', 'sig-hint', 'Sign above with finger or stylus'));

    requestAnimationFrame(() => {
      sigPad = new SCI.SignaturePad(canvas, dataURL => {
        current.report.data[sec.key] = dataURL;
        markDirty();
      });
      if (current.report.data[sec.key]) sigPad.load(current.report.data[sec.key]);
    });
    clear.addEventListener('click', () => sigPad && sigPad.clear());
  }

  /* ---------- top-level wiring ---------- */
  $('#btn-back').addEventListener('click', async () => {
    await saveCurrent();
    current = null;
    viewForm.hidden = true;
    viewHome.hidden = false;
    renderReportList();
  });

  $('#btn-save').addEventListener('click', () => saveCurrent(true));

  $('#btn-pdf').addEventListener('click', async () => {
    if (!current) return;
    await saveCurrent();
    try {
      SCI.pdf.download(current.schema, current.report.data);
      toast('PDF saved to your Downloads / Files');
    } catch (e) {
      console.error(e);
      toast('Could not generate PDF: ' + e.message);
    }
  });

  $('#btn-share').addEventListener('click', async () => {
    if (!current) return;
    await saveCurrent();
    SCI.share(current.schema, current.report.data);
  });

  $('#report-search').addEventListener('input', renderReportList);

  /* ---------- boot ---------- */
  renderFormCards();
  renderReportList();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
