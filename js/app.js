/* App shell: tab navigation, schema-driven form renderer, piece sync. */
(() => {
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  window.SCI = window.SCI || {};
  SCI.ui = { el };

  /* ---------- toast ---------- */
  let toastTimer = null;
  SCI.toast = (msg, ms = 2600) => {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  };

  /* ---------- modal ---------- */
  SCI.ui.modal = ({ title, body, actions }) => {
    const root = $('#modal-root');
    const overlay = el('div', 'modal-overlay');
    const box = el('div', 'modal-box');
    const head = el('div', 'modal-head');
    head.append(el('h3', null, title));
    const closeBtn = el('button', 'icon-btn');
    closeBtn.append(SCI.icon('x'));
    closeBtn.title = 'Close';
    head.append(closeBtn);
    box.append(head);
    const bodyWrap = el('div', 'modal-body');
    bodyWrap.append(body);
    box.append(bodyWrap);
    const foot = el('div', 'modal-foot');
    (actions || []).forEach(a => {
      const b = el('button', 'btn ' + (a.cls || 'btn-ghost'), a.label);
      b.addEventListener('click', async () => {
        await a.onClick();
        if (!a.keepOpen) close();
      });
      foot.append(b);
    });
    if (actions && actions.length) box.append(foot);
    overlay.append(box);
    root.append(overlay);
    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    return { close };
  };

  /* ---------- tab navigation ---------- */
  const TABS = ['inspect', 'parts', 'dispatch', 'stats', 'settings'];
  let currentTab = 'inspect';

  async function showTab(tab) {
    currentTab = tab;
    $('#view-form').hidden = true;
    TABS.forEach(t => {
      $('#tab-' + t).hidden = t !== tab;
      $('#nav-' + t).classList.toggle('on', t === tab);
    });
    $('#tab-bar').hidden = false;
    if (tab === 'inspect') { renderFormCards(); renderReportList(); }
    if (tab === 'parts') SCI.views.renderParts($('#tab-parts'));
    if (tab === 'dispatch') SCI.views.renderDispatch($('#tab-dispatch'));
    if (tab === 'stats') SCI.views.renderStats($('#tab-stats'));
    if (tab === 'settings') SCI.views.renderSettings($('#tab-settings'));
  }

  TABS.forEach(t => $('#nav-' + t).addEventListener('click', () => showTab(t)));

  /* ---------- inspect tab (home) ---------- */
  let current = null;
  let saveTimer = null;
  let sigPad = null;

  function renderFormCards() {
    const wrap = $('#form-cards');
    wrap.innerHTML = '';
    Object.values(SCI.forms).forEach(schema => {
      const card = el('button', 'form-card');
      const icon = el('div', 'card-icon');
      icon.append(schema.iconName ? SCI.icon(schema.iconName) : document.createTextNode(schema.icon || '📄'));
      const body = el('div');
      body.append(el('div', 'card-name', schema.title), el('div', 'card-desc', schema.description || ''));
      card.append(icon, body);
      card.addEventListener('click', () => openForm(newReport(schema)));
      wrap.append(card);
    });
  }

  function newReport(schema, data) {
    return {
      id: SCI.db.newId('r'),
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

  const blankRow = sec => ({ parameter: '', spec: '', tol: '', instrument: '', tapped: false, tapResult: '', r: Array(sec.maxReadings || 10).fill('') });

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
      const btnDup = el('button', 'icon-btn');
      btnDup.append(SCI.icon('copy'));
      btnDup.title = 'Duplicate (same part, fresh readings)';
      btnDup.addEventListener('click', async () => {
        const copy = newReport(schema, duplicateData(schema, report.data));
        await SCI.db.save(copy);
        openForm(copy);
        SCI.toast('Duplicated — readings cleared');
      });
      const btnDel = el('button', 'icon-btn danger');
      btnDel.append(SCI.icon('trash'));
      btnDel.title = 'Delete report';
      btnDel.addEventListener('click', async () => {
        if (!confirm('Delete this report? Piece records created from it are kept.')) return;
        await SCI.db.remove(report.id);
        renderReportList();
      });
      actions.append(btnDup, btnDel);
      item.append(body, chip, actions);
      listEl.append(item);
    });

    $('#report-empty').hidden = shown > 0;
  }

  function duplicateData(schema, data) {
    const copy = JSON.parse(JSON.stringify(data));
    schema.sections.forEach(sec => {
      if (sec.type === 'measurements' && copy[sec.key]) {
        copy[sec.key].rows.forEach(row => {
          row.r = row.r.map(() => '');
          row.tapResult = '';
        });
      }
      if (sec.type === 'signature') delete copy[sec.key];
      if (sec.type === 'checks') copy[sec.key] = {};
    });
    delete copy.result;
    delete copy.pieceResults; // new batch gets fresh serials
    copy.date = new Date().toISOString().slice(0, 10);
    return copy;
  }

  /* ---------- form rendering ---------- */
  async function openForm(report) {
    const schema = SCI.forms[report.formId];
    const existing = await SCI.db.getReport(report.id);
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
      else if (sec.type === 'pieceResults') renderPieceResults(card, sec);
      else if (sec.type === 'checks') renderChecks(card, sec);
      else if (sec.type === 'textarea') renderTextarea(card, sec);
      else if (sec.type === 'signature') renderSignature(card, sec);
      main.append(card);
    });

    TABS.forEach(t => $('#tab-' + t).hidden = true);
    $('#tab-bar').hidden = true;
    $('#view-form').hidden = false;
    window.scrollTo(0, 0);
  }

  SCI.app = {
    openForm,
    async openReportById(id) {
      const rep = await SCI.db.getReport(id);
      if (rep) openForm(rep);
      else SCI.toast('Report no longer exists');
    },
    /* Re-inspection of a single reworked piece: prefilled report, qty 1,
     * serial pinned to the piece. */
    async reinspectPiece(piece) {
      const lastId = piece.reportIds[piece.reportIds.length - 1];
      const last = lastId ? await SCI.db.getReport(lastId) : null;
      const schema = SCI.forms[last ? last.formId : 'inspection-report'];
      const data = last ? duplicateData(schema, last.data) : defaultData(schema);
      data.woNo = piece.woNo;
      data.partNo = piece.partNo;
      data.partDescription = piece.partDescription;
      data.customer = piece.customer;
      data.qty = '1';
      data.pieceResults = { start: piece.serial, results: [null] };
      const rep = newReport(schema, data);
      await SCI.db.save(rep);
      openForm(rep);
      SCI.toast('Re-inspection for S/N ' + piece.serial + ' — record the piece result below');
    },
  };

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
    const n = await SCI.parts.syncFromReport(current.report);
    $('#save-status').textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (showToast) SCI.toast(n ? `Saved — ${n} piece record(s) updated` : 'Report saved on this device');
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

    card.append(el('h3', null, sec.title || 'Measurements'));
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

    tools.append(btnAdd, el('span', 'tol-hint', 'One column per piece (follows Qty) — each cell is that parameter measured on that serial number. Out-of-tolerance turns red.'));
    card.append(tools);

    /* column count follows Qty (1–10); serial headers follow Piece Results start */
    const colCount = () => {
      const q = parseInt(current.report.data.qty, 10);
      if (q >= 1) return Math.min(q, sec.maxReadings || 10);
      return Math.min(m.readings || sec.defaultReadings || 5, sec.maxReadings || 10);
    };
    const serialStart = () => {
      const pr = current.report.data.pieceResults;
      return pr && pr.start ? pr.start : 1;
    };
    let builtCols = null, builtStart = null;

    function buildTable() {
      m.readings = colCount();
      builtCols = m.readings;
      builtStart = serialStart();
      table.innerHTML = '';
      const thead = el('thead');
      const hr = el('tr');
      ['#', 'Parameter', 'Specification', 'Tolerance ±', 'Instrument', 'Tapped hole'].forEach(h => hr.append(el('th', null, h)));
      for (let i = 0; i < m.readings; i++) hr.append(el('th', null, 'S/N ' + (builtStart + i)));
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
            if (key === 'spec' || key === 'tol') refreshRowTol(tr, row);
          });
          td.append(inp);
          return td;
        };
        tr.append(mkCell('parameter'), mkCell('spec', null, '92px'), mkCell('tol', null, '84px'), mkCell('instrument', null, '104px'));

        const tdTap = el('td', 'tap-cell');
        const tap = el('input');
        tap.type = 'checkbox';
        tap.className = 'tap-check';
        tap.title = 'Tapped hole — adds a single OK / Not OK for the tapping';
        tap.checked = !!row.tapped;
        tap.addEventListener('change', () => {
          row.tapped = tap.checked;
          if (!tap.checked) row.tapResult = '';
          markDirty();
          buildTable();
        });
        tdTap.append(tap);
        if (row.tapped) {
          const sel = el('select', 'tap-result');
          ['', 'OK', 'Not OK', 'N/A'].forEach(o => {
            const opt = el('option', null, o || 'Tapping…');
            opt.value = o;
            sel.append(opt);
          });
          sel.value = row.tapResult || '';
          const paint = () => sel.classList.toggle('bad', sel.value === 'Not OK');
          sel.addEventListener('change', () => {
            row.tapResult = sel.value;
            markDirty();
            paint();
          });
          paint();
          tdTap.append(sel);
        }
        tr.append(tdTap);

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
        refreshRowTol(tr, row);
      });
      table.append(tbody);
    }

    function refreshRowTol(tr, row) {
      tr.querySelectorAll('input.reading').forEach(inp => applyTolClass(inp, row));
    }

    buildTable();
    /* rebuild only when Qty or serial start actually changed */
    current._mSync = () => {
      if (colCount() !== builtCols || serialStart() !== builtStart) buildTable();
    };
  }

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

  /* --- piece results: one verdict per physical piece --- */
  function renderPieceResults(card, sec) {
    const d = current.report.data;
    card.append(el('h3', null, sec.title || 'Piece Results'));
    const wrap = el('div');
    card.append(wrap);

    const build = async () => {
      wrap.innerHTML = '';
      const qty = Math.min(parseInt(d.qty, 10) || 0, 10);
      if (!d.woNo || !d.partNo || !qty) {
        wrap.append(el('p', 'tol-hint', 'Fill WO No., Part No. and Qty (max 10 per report) above to record per-piece results.'));
        return;
      }
      if (!d.pieceResults) {
        const start = (await SCI.parts.maxSerial(d.woNo, d.partNo)) + 1;
        d.pieceResults = { start, results: Array(qty).fill(null) };
        if (current._mSync) current._mSync(); // headers can now show real serials
      }
      const pr = d.pieceResults;
      while (pr.results.length < qty) pr.results.push(null);
      pr.results.length = qty;

      const startRow = el('div', 'readings-ctl');
      startRow.append(el('span', null, 'Serial numbers start at:'));
      const startIn = el('input', 'serial-start');
      startIn.inputMode = 'numeric';
      startIn.value = pr.start;
      startIn.addEventListener('input', () => {
        pr.start = parseInt(startIn.value, 10) || 1;
        markDirty();
        drawRows();
        if (current._mSync) current._mSync(); // refresh S/N column headers
      });
      startRow.append(startIn);
      const suggest = el('button', 'btn-add', 'Suggest from readings');
      suggest.title = 'Marks piece i OK unless any reading in column i is out of tolerance';
      suggest.addEventListener('click', () => {
        const m = d.measurements;
        for (let i = 0; i < qty; i++) {
          let bad = false;
          (m ? m.rows : []).forEach(row => {
            if (SCI.isOutOfTol(row.spec, row.tol, row.r[i])) bad = true;
            if (row.tapped && row.tapResult === 'Not OK') bad = true;
          });
          if (!pr.results[i]) pr.results[i] = bad ? null : 'ok';
        }
        markDirty();
        drawRows();
        SCI.toast('Pieces without out-of-tol readings marked OK — pick a bucket for the rest');
      });
      startRow.append(suggest);
      wrap.append(startRow);

      const rows = el('div', 'piece-rows');
      wrap.append(rows);

      function drawRows() {
        rows.innerHTML = '';
        for (let i = 0; i < qty; i++) {
          const row = el('div', 'piece-row');
          row.append(el('span', 'piece-sn', 'S/N ' + (pr.start + i)));
          const seg = el('div', 'seg');
          SCI.parts.INTERNAL_RESULTS.forEach(opt => {
            const b = el('button', null, opt.label);
            b.type = 'button';
            const cls = opt.key === 'ok' ? 'sel-ok' : opt.key === 'rejected' ? 'sel-bad' : 'sel-na';
            const sync = () => b.className = pr.results[i] === opt.key ? cls : '';
            b.addEventListener('click', () => {
              pr.results[i] = pr.results[i] === opt.key ? null : opt.key;
              seg.querySelectorAll('button').forEach(x => x.className = '');
              sync();
              markDirty();
            });
            sync();
            seg.append(b);
          });
          row.append(seg);
          rows.append(row);
        }
      }
      drawRows();
      wrap.append(el('p', 'tol-hint', 'OK pieces go to “Awaiting TPI”. Others go to the chosen bucket. Manage them in the Parts tab.'));
    };

    build();
    current._prBuild = build; // rebuilt when WO/Part/Qty change (delegated below)
  }

  /* single delegated listener: refresh piece results + table columns when detail fields change */
  $('#form-sections').addEventListener('input', e => {
    if (!current || !e.target.closest('.fields-grid')) return;
    if (current._prBuild) current._prBuild();
    if (current._mSync) current._mSync();
  });

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
    showTab(currentTab === 'inspect' ? 'inspect' : currentTab);
  });

  $('#btn-save').addEventListener('click', () => saveCurrent(true));

  /* Copy part details + parameter table from another report into this one.
   * Readings, piece results, signature and order fields (WO/P.O./GRN/date)
   * are NOT copied. */
  $('#btn-copy-from').addEventListener('click', async () => {
    if (!current) return;
    const reports = (await SCI.db.list()).filter(r => r.id !== current.report.id);
    if (!reports.length) { SCI.toast('No other reports to copy from'); return; }

    const body = el('div');
    const search = el('input', 'modal-input');
    search.type = 'search';
    search.placeholder = 'Search reports…';
    const list = el('div', 'pd-list');
    body.append(search, list);
    let close;

    const draw = () => {
      list.innerHTML = '';
      const q = search.value.toLowerCase();
      reports.forEach(rep => {
        const schema = SCI.forms[rep.formId];
        if (!schema) return;
        const s = schema.summary(rep.data);
        if (q && !(s.title + ' ' + s.subtitle).toLowerCase().includes(q)) return;
        const row = el('button', 'pd-piece-row copy-row');
        row.append(el('span', null, s.title + (s.subtitle ? ' — ' + s.subtitle : '')));
        row.addEventListener('click', () => {
          const d = current.report.data, src = rep.data;
          ['customer', 'partDescription', 'partNo', 'qty'].forEach(k => {
            if (src[k] !== undefined && src[k] !== '') d[k] = src[k];
          });
          if (src.measurements) {
            d.measurements = JSON.parse(JSON.stringify(src.measurements));
            d.measurements.rows.forEach(r => {
              r.r = r.r.map(() => '');
              r.tapResult = '';
            });
          }
          if (src.remarks) d.remarks = src.remarks;
          delete d.pieceResults; // serials re-derived for the (possibly new) part
          current.touched = true;
          close();
          openForm(current.report);
          SCI.toast('Fields copied — readings cleared. WO / P.O. / GRN not touched.', 4000);
        });
        list.append(row);
      });
      if (!list.children.length) list.append(el('p', 'modal-hint', 'No reports match.'));
    };
    search.addEventListener('input', draw);
    draw();
    ({ close } = SCI.ui.modal({ title: 'Copy fields from…', body, actions: [] }));
  });

  $('#btn-pdf').addEventListener('click', async () => {
    if (!current) return;
    await saveCurrent();
    try {
      SCI.pdf.download(current.schema, current.report.data);
      SCI.toast('PDF saved to your Downloads / Files');
    } catch (e) {
      console.error(e);
      SCI.toast('Could not generate PDF: ' + e.message);
    }
  });

  $('#btn-share').addEventListener('click', async () => {
    if (!current) return;
    await saveCurrent();
    SCI.share(current.schema, current.report.data);
  });

  $('#report-search').addEventListener('input', renderReportList);

  /* ---------- boot ---------- */
  SCI.hydrateIcons();
  showTab('inspect');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  SCI.backup.nagIfStale();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
