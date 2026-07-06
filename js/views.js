/* Tab views: Parts (lifecycle + TPI), Dispatch, Stats, Settings.
 * Rendering helpers (SCI.ui.*) are provided by app.js. */
window.SCI = window.SCI || {};

SCI.views = (() => {
  const P = () => SCI.parts;
  const el = (...a) => SCI.ui.el(...a);

  const fmtDT = ts => new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  /* ================= PARTS TAB ================= */
  let partsFilter = 'all';

  async function renderParts(root) {
    root.innerHTML = '';
    const pieces = (await P().all()).sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);

    const counts = { all: pieces.length };
    pieces.forEach(p => counts[p.status] = (counts[p.status] || 0) + 1);

    const filters = el('div', 'filter-row');
    const mkFilter = (key, lbl) => {
      const b = el('button', 'filter-chip' + (partsFilter === key ? ' on' : ''), lbl + (counts[key] ? ` (${counts[key]})` : ''));
      b.addEventListener('click', () => { partsFilter = key; renderParts(root); });
      filters.append(b);
    };
    mkFilter('all', 'All');
    Object.values(P().ST).forEach(s => mkFilter(s, P().LABELS[s]));
    root.append(filters);

    const search = el('input', 'search-input');
    search.type = 'search';
    search.placeholder = 'Search WO, part no., description…';
    root.append(search);

    if (partsFilter === P().ST.AWAITING_TPI && (counts[P().ST.AWAITING_TPI] || 0) > 0) {
      const bulk = el('button', 'btn btn-secondary bulk-btn', 'TPI: approve all shown…');
      bulk.addEventListener('click', () => ensureTpi(async tpi => {
        const shown = pieces.filter(p => p.status === P().ST.AWAITING_TPI && matches(p, search.value));
        if (!confirm(`Approve ${shown.length} piece(s) as ${tpi.name}?`)) return;
        for (const p of shown) {
          await P().transition(p.id, P().ST.READY, 'tpi', 'TPI approved', pc => {
            pc.approval = { type: 'tpi', name: tpi.name, at: Date.now() };
          });
        }
        SCI.toast(`${shown.length} piece(s) TPI-approved`);
        renderParts(root);
      }));
      root.append(bulk);
    }

    const list = el('div', 'report-list');
    root.append(list);

    const matches = (p, q) => !q || (p.woNo + ' ' + p.partNo + ' ' + p.partDescription + ' ' + p.customer)
      .toLowerCase().includes(q.toLowerCase());

    const draw = () => {
      list.innerHTML = '';
      const shown = pieces.filter(p => (partsFilter === 'all' || p.status === partsFilter) && matches(p, search.value));
      if (!shown.length) {
        list.append(el('p', 'empty-note', pieces.length ? 'No parts match.' : 'No parts yet — record piece results on an inspection report.'));
        return;
      }
      shown.forEach(p => {
        const item = el('div', 'report-item');
        const body = el('div', 'ri-body');
        body.append(
          el('div', 'ri-title', `${p.partNo} · S/N ${p.serial}`),
          el('div', 'ri-sub', `WO ${p.woNo}${p.partDescription ? ' — ' + p.partDescription : ''}`),
        );
        body.addEventListener('click', () => pieceModal(p.id, () => renderParts(root)));
        item.append(body, el('span', 'chip ' + P().CHIP[p.status], P().LABELS[p.status]));
        list.append(item);
      });
    };
    search.addEventListener('input', draw);
    draw();
  }

  async function pieceModal(id, refresh) {
    const p = await P().get(id);
    if (!p) return;
    const ST = P().ST;
    const body = el('div');

    const info = el('div', 'pd-info');
    info.append(el('span', 'chip ' + P().CHIP[p.status], P().LABELS[p.status]));
    const lines = [
      ['WO No.', p.woNo], ['Part No.', p.partNo], ['Serial', p.serial],
      ['Description', p.partDescription], ['Customer', p.customer],
    ];
    if (p.approval) lines.push(['Approved by', `${p.approval.name} (${p.approval.type.toUpperCase()}) — ${fmtDT(p.approval.at)}`]);
    lines.forEach(([k, v]) => { if (v) info.append(el('div', 'pd-line', k + ': ' + v)); });
    body.append(info);

    if (p.reportIds.length) {
      const rline = el('div', 'pd-line');
      rline.append('Reports: ');
      p.reportIds.forEach((rid, i) => {
        const a = el('button', 'link-btn', 'inspection ' + (i + 1));
        a.addEventListener('click', () => { close(); SCI.app.openReportById(rid); });
        rline.append(a, ' ');
      });
      body.append(rline);
    }

    if (p.photos && p.photos.length) {
      const strip = el('div', 'photo-strip');
      p.photos.forEach(src => {
        const img = el('img', 'photo-thumb');
        img.src = src;
        strip.append(img);
      });
      body.append(strip);
    }

    const hist = el('div', 'pd-hist');
    hist.append(el('h4', null, 'History'));
    [...p.history].reverse().forEach(h => {
      hist.append(el('div', 'pd-line', `${fmtDT(h.at)} — ${P().LABELS[h.to] || h.to} (${h.by}${h.note ? ': ' + h.note : ''})`));
    });
    body.append(hist);

    const actions = [];
    const done = async (msg) => { close(); SCI.toast(msg); refresh && refresh(); };

    if (p.status === ST.AWAITING_TPI) {
      actions.push({ label: 'TPI: Approve', cls: 'btn-primary', onClick: () => ensureTpi(async tpi => {
        await P().transition(p.id, ST.READY, 'tpi', 'TPI approved', pc => {
          pc.approval = { type: 'tpi', name: tpi.name, at: Date.now() };
        });
        done('Approved by ' + tpi.name);
      }) });
      actions.push({ label: 'TPI: Not OK…', cls: 'btn-ghost', onClick: () => ensureTpi(tpi =>
        bucketModal(async bucket => {
          await P().transition(p.id, bucket, 'tpi', 'TPI rejected (' + tpi.name + ')');
          done('Moved to ' + P().LABELS[bucket]);
        })) });
    }
    if (p.status === ST.DEVIATION) {
      actions.push({ label: 'Photos & email…', cls: 'btn-secondary', onClick: () => { close(); deviationModal(p.id, refresh); } });
    }
    if (p.status === ST.DEVIATION || p.status === ST.CHALLAN) {
      actions.push({ label: 'Client approved', cls: 'btn-primary', onClick: async () => {
        await P().transition(p.id, ST.READY, 'client', 'Client approved despite deviation', pc => {
          pc.approval = { type: 'client', name: p.customer || 'Client', at: Date.now() };
        });
        done('Client approved — ready to dispatch (TPI skipped)');
      } });
      actions.push({ label: 'Client rejected → Rework', cls: 'btn-ghost', onClick: async () => {
        await P().transition(p.id, ST.REWORK, 'client', 'Client rejected');
        done('Moved to rework');
      } });
    }
    if (p.status === ST.REWORK) {
      actions.push({ label: 'Re-inspect', cls: 'btn-primary', onClick: async () => {
        close();
        await SCI.app.reinspectPiece(p);
      } });
      actions.push({ label: 'Scrap (reject)', cls: 'btn-ghost', onClick: async () => {
        if (!confirm('Mark this piece as rejected/scrapped?')) return;
        await P().transition(p.id, ST.REJECTED, 'internal', 'Scrapped from rework');
        done('Rejected');
      } });
    }

    const { close } = SCI.ui.modal({ title: `${p.partNo} — S/N ${p.serial}`, body, actions });
  }

  function bucketModal(onPick) {
    const body = el('div', 'bucket-grid');
    const ST = P().ST;
    let close;
    [[ST.DEVIATION, 'Deviation'], [ST.CHALLAN, 'Delivery challan'], [ST.REWORK, 'Rework'], [ST.REJECTED, 'Rejected (scrap)']]
      .forEach(([st, lbl]) => {
        const b = el('button', 'btn btn-ghost bucket-btn', lbl);
        b.addEventListener('click', () => { close(); onPick(st); });
        body.append(b);
      });
    ({ close } = SCI.ui.modal({ title: 'Send piece to…', body, actions: [] }));
  }

  /* ---- TPI verification ---- */
  async function ensureTpi(cb) {
    const existing = SCI.tpi.active();
    if (existing) return cb(existing);

    const settings = (await SCI.db.kvGet('settings')) || {};
    const tpis = settings.tpis || [];
    if (!tpis.length) {
      SCI.toast('No TPIs configured — add one in Settings first', 4000);
      return;
    }

    const body = el('div');
    body.append(el('p', 'modal-hint', 'Third-party inspector verification'));
    const sel = el('select', 'modal-input');
    tpis.forEach((t, i) => {
      const o = el('option', null, t.name + ' <' + t.email + '>');
      o.value = i;
      sel.append(o);
    });
    body.append(sel);

    const status = el('p', 'modal-hint');
    const codeIn = el('input', 'modal-input');
    codeIn.placeholder = 'Enter code';
    codeIn.inputMode = 'numeric';
    codeIn.style.display = 'none';
    body.append(status, codeIn);

    let challenge = null, mode = null, close;

    const sendBtn = { label: 'Email code', cls: 'btn-secondary', keepOpen: true, onClick: async () => {
      const tpi = tpis[sel.value];
      status.textContent = 'Sending code to ' + tpi.email + '…';
      const r = await SCI.tpi.sendOtp(tpi);
      if (r.ok) {
        challenge = r; mode = 'otp';
        status.textContent = 'Code emailed to ' + tpi.email + ' — enter it below.';
        codeIn.style.display = '';
        codeIn.focus();
      } else if (r.error === 'no-endpoint') {
        status.textContent = 'Email codes not set up (Settings → OTP endpoint). Use PIN if this TPI has one.';
      } else {
        status.textContent = 'Could not send code (' + r.error + '). Check internet, or use PIN.';
      }
    } };
    const pinBtn = { label: 'Use PIN', cls: 'btn-ghost', keepOpen: true, onClick: () => {
      const tpi = tpis[sel.value];
      if (!tpi.pinHash) { status.textContent = 'No PIN set for this TPI.'; return; }
      mode = 'pin';
      status.textContent = 'Enter ' + tpi.name + "'s PIN below.";
      codeIn.style.display = '';
      codeIn.focus();
    } };
    const okBtn = { label: 'Verify', cls: 'btn-primary', keepOpen: true, onClick: async () => {
      const tpi = tpis[sel.value];
      let ok = false;
      if (mode === 'otp' && challenge) ok = await SCI.tpi.verifyOtp(challenge, codeIn.value);
      else if (mode === 'pin') ok = await SCI.tpi.verifyPin(tpi, codeIn.value);
      else { status.textContent = 'Request a code or choose PIN first.'; return; }
      if (!ok) { status.textContent = 'Wrong or expired code — try again.'; codeIn.value = ''; return; }
      SCI.tpi.start(tpi);
      close();
      SCI.toast('Verified: ' + tpi.name + ' (10 min session)');
      cb(SCI.tpi.active());
    } };

    ({ close } = SCI.ui.modal({ title: 'TPI verification', body, actions: [sendBtn, pinBtn, okBtn] }));
  }

  /* ---- deviation photos + email ---- */
  async function deviationModal(id, refresh) {
    const p = await P().get(id);
    const body = el('div');
    body.append(el('p', 'modal-hint', 'Attach photos of the offending area (camera or gallery — include a drawing screenshot if you have one). Then send the deviation request.'));

    const strip = el('div', 'photo-strip');
    const drawStrip = () => {
      strip.innerHTML = '';
      (p.photos || []).forEach((src, i) => {
        const wrap = el('div', 'photo-wrap');
        const img = el('img', 'photo-thumb');
        img.src = src;
        const x = el('button', 'photo-del', '✕');
        x.addEventListener('click', async () => {
          p.photos.splice(i, 1);
          await SCI.db.put('pieces', p);
          drawStrip();
        });
        wrap.append(img, x);
        strip.append(wrap);
      });
    };
    drawStrip();
    body.append(strip);

    const fileIn = el('input');
    fileIn.type = 'file';
    fileIn.accept = 'image/*';
    fileIn.multiple = true;
    fileIn.className = 'modal-input';
    fileIn.addEventListener('change', async () => {
      for (const f of fileIn.files) {
        const url = await downscale(f, 1280, 0.72);
        p.photos = p.photos || [];
        p.photos.push(url);
      }
      await SCI.db.put('pieces', p);
      fileIn.value = '';
      drawStrip();
    });
    body.append(fileIn);

    const note = el('textarea', 'modal-input');
    note.placeholder = 'Describe the deviation (goes into the email)…';
    note.value = p.deviationNote || '';
    note.addEventListener('input', () => { p.deviationNote = note.value; });
    body.append(note);

    const actions = [
      { label: 'Send email…', cls: 'btn-primary', onClick: async () => {
        await SCI.db.put('pieces', p);
        const files = [];
        const rid = p.reportIds[p.reportIds.length - 1];
        if (rid) {
          const rep = await SCI.db.getReport(rid);
          if (rep) {
            const schema = SCI.forms[rep.formId];
            files.push(new File([SCI.pdf.getBlob(schema, rep.data)],
              (schema.fileName(rep.data) || 'report') + '.pdf', { type: 'application/pdf' }));
          }
        }
        (p.photos || []).forEach((src, i) => {
          files.push(dataUrlToFile(src, `deviation-${p.partNo}-SN${p.serial}-${i + 1}.jpg`));
        });
        const text = [
          'Dear Sir/Madam,', '',
          'We request deviation approval for the following part:', '',
          `Part: ${p.partNo}${p.partDescription ? ' — ' + p.partDescription : ''}`,
          `S/N: ${p.serial}   WO No.: ${p.woNo}`,
          p.customer ? `Customer: ${p.customer}` : '',
          '', 'Deviation details: ' + (p.deviationNote || '(please describe)'),
          '', 'The inspection report and photos of the part are attached.',
          '', 'Regards,', 'Shri Cauvery Industries',
        ].filter(l => l !== null).join('\n');
        await SCI.shareFiles(files, 'Deviation approval request — ' + p.partNo + ' S/N ' + p.serial, text);
      } },
    ];
    SCI.ui.modal({ title: 'Deviation — ' + p.partNo + ' S/N ' + p.serial, body, actions });
    refresh && refresh();
  }

  function downscale(file, maxW, q) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function dataUrlToFile(dataUrl, name) {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta.match(/data:([^;]+)/)[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name, { type: mime });
  }

  /* ================= DISPATCH TAB ================= */
  async function renderDispatch(root) {
    root.innerHTML = '';
    const dispatches = (await SCI.db.all('dispatches')).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.createdAt - a.createdAt);

    const add = el('button', 'btn btn-primary bulk-btn', '+ New dispatch');
    add.addEventListener('click', () => newDispatchModal(() => renderDispatch(root)));
    root.append(add);

    const list = el('div', 'report-list');
    root.append(list);
    if (!dispatches.length) list.append(el('p', 'empty-note', 'No dispatches yet. Create one for your next delivery day.'));

    dispatches.forEach(d => {
      const item = el('div', 'report-item');
      const body = el('div', 'ri-body');
      body.append(
        el('div', 'ri-title', d.name),
        el('div', 'ri-sub', `${d.customer || ''}${d.date ? ' · ' + d.date : ''} · ${d.pieceIds.length} part(s)`),
      );
      body.addEventListener('click', () => dispatchModal(d.id, () => renderDispatch(root)));
      item.append(body, el('span', 'chip ' + (d.status === 'open' ? 'st-info' : 'st-done'), d.status === 'open' ? 'Open' : 'Dispatched'));
      list.append(item);
    });
  }

  function newDispatchModal(refresh) {
    const body = el('div');
    const name = el('input', 'modal-input'); name.placeholder = 'Name (e.g. Syntegon — Wed 15 Jul)';
    const cust = el('input', 'modal-input'); cust.placeholder = 'Customer';
    const date = el('input', 'modal-input'); date.type = 'date';
    date.value = new Date().toISOString().slice(0, 10);
    body.append(name, cust, date);
    SCI.ui.modal({ title: 'New dispatch', body, actions: [
      { label: 'Create', cls: 'btn-primary', onClick: async () => {
        await SCI.db.put('dispatches', {
          id: SCI.db.newId('d'), name: name.value || 'Dispatch ' + date.value,
          customer: cust.value, date: date.value, pieceIds: [], status: 'open', createdAt: Date.now(),
        });
        refresh();
      } },
    ] });
  }

  async function dispatchModal(id, refresh) {
    const d = await SCI.db.get('dispatches', id);
    const ST = P().ST;
    const body = el('div');
    body.append(el('div', 'pd-line', `${d.customer || ''}${d.date ? ' · dispatch date ' + d.date : ''}`));

    const list = el('div', 'pd-list');
    body.append(list);
    const pieces = [];
    for (const pid of d.pieceIds) {
      const p = await P().get(pid);
      if (p) pieces.push(p);
    }
    const drawList = () => {
      list.innerHTML = '';
      if (!pieces.length) list.append(el('p', 'modal-hint', 'No parts added yet.'));
      pieces.forEach(p => {
        const row = el('div', 'pd-piece-row');
        row.append(el('span', null, P().label(p)));
        if (d.status === 'open') {
          const x = el('button', 'photo-del', '✕');
          x.title = 'Remove from dispatch';
          x.addEventListener('click', async () => {
            d.pieceIds = d.pieceIds.filter(x2 => x2 !== p.id);
            await SCI.db.put('dispatches', d);
            await P().transition(p.id, ST.READY, 'dispatch', 'Removed from dispatch', pc => { pc.dispatchId = null; });
            pieces.splice(pieces.indexOf(p), 1);
            drawList();
          });
          row.append(x);
        }
        list.append(row);
      });
    };
    drawList();

    const actions = [];
    if (d.status === 'open') {
      actions.push({ label: 'Add parts…', cls: 'btn-ghost', onClick: () => addPartsModal(d, refresh) });
      actions.push({ label: 'Email dispatch…', cls: 'btn-secondary', keepOpen: true, onClick: () => emailDispatch(d, pieces) });
      actions.push({ label: 'Mark dispatched', cls: 'btn-primary', onClick: async () => {
        if (!pieces.length) { SCI.toast('Add parts first'); return; }
        if (!confirm(`Mark ${pieces.length} part(s) as dispatched?`)) return;
        for (const p of pieces) await P().transition(p.id, ST.DISPATCHED, 'dispatch', 'Dispatched: ' + d.name);
        d.status = 'done';
        await SCI.db.put('dispatches', d);
        SCI.toast('Dispatch completed');
        refresh();
      } });
    }
    SCI.ui.modal({ title: d.name, body, actions });
  }

  async function addPartsModal(d, refresh) {
    const ready = await P().byStatus(P().ST.READY);
    const body = el('div');
    if (!ready.length) body.append(el('p', 'modal-hint', 'No parts are Ready to dispatch. Parts must pass internal inspection and TPI (or client) approval first.'));
    const checks = [];
    ready.forEach(p => {
      const row = el('label', 'pd-piece-row');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = true;
      checks.push([cb, p]);
      row.append(cb, el('span', null, ' ' + P().label(p)));
      body.append(row);
    });
    SCI.ui.modal({ title: 'Add parts to ' + d.name, body, actions: [
      { label: 'Add selected', cls: 'btn-primary', onClick: async () => {
        let n = 0;
        for (const [cb, p] of checks) {
          if (!cb.checked) continue;
          d.pieceIds.push(p.id);
          await P().transition(p.id, P().ST.IN_DISPATCH, 'dispatch', 'Added to dispatch: ' + d.name, pc => { pc.dispatchId = d.id; });
          n++;
        }
        await SCI.db.put('dispatches', d);
        SCI.toast(n + ' part(s) added');
        refresh();
      } },
    ] });
  }

  async function emailDispatch(d, pieces) {
    if (!pieces.length) { SCI.toast('Add parts first'); return; }
    const files = [];
    const seen = new Set();
    for (const p of pieces) {
      const rid = p.reportIds[p.reportIds.length - 1];
      if (!rid || seen.has(rid)) continue;
      seen.add(rid);
      const rep = await SCI.db.getReport(rid);
      if (!rep) continue;
      const schema = SCI.forms[rep.formId];
      files.push(new File([SCI.pdf.getBlob(schema, rep.data)],
        (schema.fileName(rep.data) || 'report') + '.pdf', { type: 'application/pdf' }));
    }
    const text = [
      'Dear Sir/Madam,', '',
      `The following parts are being dispatched by Shri Cauvery Industries${d.date ? ' on ' + d.date : ''}:`, '',
      ...pieces.map((p, i) => `${i + 1}. ${p.partNo}${p.partDescription ? ' — ' + p.partDescription : ''} — S/N ${p.serial} (WO ${p.woNo})`),
      '', 'Inspection reports for all parts are attached.',
      '', 'Regards,', 'Shri Cauvery Industries',
    ].join('\n');
    await SCI.shareFiles(files, 'Dispatch — ' + d.name, text);
  }

  /* ================= STATS TAB ================= */
  const STATUS_COLORS = {
    awaiting_tpi: '#33598a', ready: '#1e7d43', in_dispatch: '#0e7490',
    dispatched: '#64748b', deviation: '#e8890c', challan: '#a16207',
    rework: '#8d6e63', rejected: '#c0392b',
  };

  async function renderStats(root) {
    root.innerHTML = '';
    const s = await P().stats();

    const cards = el('div', 'stat-cards');
    const card = (num, lbl, cls) => {
      const c = el('div', 'stat-card' + (cls ? ' ' + cls : ''));
      c.append(el('div', 'stat-num', String(num)), el('div', 'stat-lbl', lbl));
      cards.append(c);
    };
    card(s.total, 'Total parts inspected');
    card(s.accepted, 'Accepted', 'good');
    card(s.rejected, 'Rejected / scrapped', 'bad');
    card(s.inProcess, 'In process');
    card(s.internalRate === null ? '—' : s.internalRate + '%', 'Internal acceptance');
    card(s.tpiRate === null ? '—' : s.tpiRate + '%', 'TPI acceptance');
    root.append(cards);

    if (!s.total) {
      root.append(el('p', 'empty-note', 'Charts appear once pieces are recorded.'));
      return;
    }

    const repBtn = el('button', 'btn btn-secondary bulk-btn', '📄 Monthly report PDF…');
    repBtn.addEventListener('click', () => monthReportModal());
    root.append(repBtn);

    const chartCard = (title, w, h, draw) => {
      const c = el('div', 'card');
      c.append(el('h3', null, title));
      const cv = el('canvas', 'pie-canvas');
      cv.width = w; cv.height = h;
      c.append(cv);
      draw(cv);
      root.append(c);
    };

    chartCard('Accepted vs Rejected', 520, 250, cv => drawPie(cv, [
      ['Accepted', s.accepted, '#1e7d43'],
      ['Rejected', s.rejected, '#c0392b'],
      ['In process', s.inProcess, '#e8890c'],
    ], 0));

    chartCard('Where parts are right now', 520, 250, cv => drawPie(cv,
      Object.values(P().ST)
        .map(st => [P().LABELS[st], s.byS[st].length, STATUS_COLORS[st]])
        .filter(([, v]) => v > 0), 52));

    chartCard('Inspections by month', 560, 260, cv => drawMonthly(cv, s.pieces));

    chartCard('Acceptance rates', 560, 150, cv => drawHBars(cv, [
      ['Internal', s.internalRate],
      ['TPI', s.tpiRate],
    ]));

    /* problem parts: part numbers with the most not-OK decisions */
    const problems = {};
    s.pieces.forEach(p => p.history.forEach(h => {
      if ((h.by === 'internal' || h.by === 'tpi') &&
          ['deviation', 'challan', 'rework', 'rejected'].includes(h.to)) {
        problems[p.partNo] = problems[p.partNo] || { n: 0, desc: p.partDescription };
        problems[p.partNo].n++;
      }
    }));
    const probRows = Object.entries(problems).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    if (probRows.length) {
      const c = el('div', 'card');
      c.append(el('h3', null, 'Most rejected part numbers'));
      probRows.forEach(([pn, { n, desc }]) =>
        c.append(el('div', 'pd-line', `${pn}${desc ? ' — ' + desc : ''}: ${n} not-OK decision(s)`)));
      root.append(c);
    }

    const listCard = (title, arr) => {
      const c = el('div', 'card');
      c.append(el('h3', null, title + ' (' + arr.length + ')'));
      if (!arr.length) c.append(el('p', 'modal-hint', 'None.'));
      arr.forEach(p => c.append(el('div', 'pd-line', P().label(p) + (p.partDescription ? ' — ' + p.partDescription : ''))));
      root.append(c);
    };
    listCard('Deviation parts', s.byS.deviation);
    listCard('Delivery challan parts', s.byS.challan);
    listCard('Scrapped / rejected parts', s.byS.rejected);
  }

  function drawPie(cv, slices, innerR) {
    const ctx = cv.getContext('2d');
    const total = slices.reduce((a, [, v]) => a + v, 0) || 1;
    const cx = 125, cy = cv.height / 2, r = Math.min(100, cv.height / 2 - 20);
    let a0 = -Math.PI / 2;
    slices.forEach(([, v, color]) => {
      if (!v) return;
      const a1 = a0 + 2 * Math.PI * v / total;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      a0 = a1;
    });
    if (innerR) {
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.fillStyle = '#1d2530';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(total), cx, cy + 8);
      ctx.textAlign = 'left';
    }
    ctx.font = '14px sans-serif';
    let ly = Math.max(30, cy - slices.length * 12);
    slices.forEach(([lbl, v, color]) => {
      ctx.fillStyle = color;
      ctx.fillRect(255, ly - 11, 13, 13);
      ctx.fillStyle = '#1d2530';
      ctx.fillText(`${lbl}: ${v} (${Math.round(100 * v / total)}%)`, 275, ly);
      ly += 24;
    });
  }

  /* grouped bars: inspected vs accepted per month (6 months ending at `end`) */
  function drawMonthly(cv, pieces, end) {
    const ctx = cv.getContext('2d');
    const months = [];
    const now = end || new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: d.getFullYear() + '-' + d.getMonth(),
        lbl: d.toLocaleDateString('en-IN', { month: 'short' }),
        inspected: 0, accepted: 0,
      });
    }
    const acceptedSet = ['ready', 'in_dispatch', 'dispatched'];
    pieces.forEach(p => {
      const at = p.history.length ? p.history[0].at : p.createdAt;
      const d = new Date(at);
      const m = months.find(x => x.key === d.getFullYear() + '-' + d.getMonth());
      if (!m) return;
      m.inspected++;
      if (acceptedSet.includes(p.status)) m.accepted++;
    });

    const maxV = Math.max(1, ...months.map(m => m.inspected));
    const x0 = 40, y0 = cv.height - 40, plotH = y0 - 24;
    const groupW = (cv.width - x0 - 16) / months.length;
    ctx.font = '13px sans-serif';
    /* y grid */
    ctx.strokeStyle = '#e5e9ee';
    ctx.fillStyle = '#64748b';
    for (let g = 0; g <= 4; g++) {
      const v = Math.ceil(maxV * g / 4);
      const y = y0 - plotH * g / 4;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(cv.width - 10, y); ctx.stroke();
      ctx.fillText(String(v), 8, y + 4);
    }
    months.forEach((m, i) => {
      const gx = x0 + i * groupW + groupW * 0.18;
      const bw = groupW * 0.26;
      const h1 = plotH * m.inspected / maxV;
      const h2 = plotH * m.accepted / maxV;
      ctx.fillStyle = '#1c3d5a';
      ctx.fillRect(gx, y0 - h1, bw, h1);
      ctx.fillStyle = '#1e7d43';
      ctx.fillRect(gx + bw + 4, y0 - h2, bw, h2);
      ctx.fillStyle = '#64748b';
      ctx.fillText(m.lbl, gx + bw - 8, y0 + 18);
    });
    /* legend */
    ctx.fillStyle = '#1c3d5a'; ctx.fillRect(x0, 4, 12, 12);
    ctx.fillStyle = '#1d2530'; ctx.fillText('Inspected', x0 + 18, 15);
    ctx.fillStyle = '#1e7d43'; ctx.fillRect(x0 + 105, 4, 12, 12);
    ctx.fillStyle = '#1d2530'; ctx.fillText('Accepted', x0 + 123, 15);
  }

  /* ---- monthly report PDF ---- */
  async function monthlyStats(y, m) {
    const ST = P().ST;
    const pieces = await P().all();
    const inMonth = ts => { const d = new Date(ts); return d.getFullYear() === y && d.getMonth() === m; };

    /* cohort: pieces first inspected in this month */
    const cohort = pieces.filter(p => p.history.length && inMonth(p.history[0].at));
    const byS = {};
    Object.values(ST).forEach(st => byS[st] = []);
    cohort.forEach(p => byS[p.status].push(p));
    const accepted = byS.ready.length + byS.in_dispatch.length + byS.dispatched.length;
    const rejected = byS.rejected.length;

    /* decision events that happened during this month (any piece) */
    const DECISIONS = [ST.AWAITING_TPI, ST.DEVIATION, ST.CHALLAN, ST.REWORK, ST.REJECTED];
    let intOk = 0, intAll = 0, tpiOk = 0, tpiAll = 0, dispatched = 0;
    const problems = {};
    pieces.forEach(p => p.history.forEach(h => {
      if (!inMonth(h.at)) return;
      if (h.by === 'internal' && DECISIONS.includes(h.to)) { intAll++; if (h.to === ST.AWAITING_TPI) intOk++; }
      if (h.by === 'tpi') { tpiAll++; if (h.to === ST.READY) tpiOk++; }
      if (h.by === 'dispatch' && h.to === ST.DISPATCHED) dispatched++;
      if ((h.by === 'internal' || h.by === 'tpi') && ['deviation', 'challan', 'rework', 'rejected'].includes(h.to)) {
        problems[p.partNo] = problems[p.partNo] || { n: 0, desc: p.partDescription };
        problems[p.partNo].n++;
      }
    }));

    return {
      pieces, cohort, byS, accepted, rejected,
      inProcess: cohort.length - accepted - rejected,
      internalRate: intAll ? Math.round(100 * intOk / intAll) : null,
      tpiRate: tpiAll ? Math.round(100 * tpiOk / tpiAll) : null,
      dispatched,
      problems: Object.entries(problems).sort((a, b) => b[1].n - a[1].n).slice(0, 10),
    };
  }

  function monthReportModal() {
    const body = el('div');
    body.append(el('p', 'modal-hint', 'Pick a month — the report covers parts first inspected in that month plus all decisions made during it.'));
    const sel = el('select', 'modal-input');
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const o = el('option', null, d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
      o.value = d.getFullYear() + '-' + d.getMonth();
      sel.append(o);
    }
    body.append(sel);
    const gen = async () => {
      const [y, m] = sel.value.split('-').map(Number);
      const label = new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const ms = await monthlyStats(y, m);
      if (!ms.cohort.length && ms.internalRate === null && ms.tpiRate === null && !ms.dispatched) {
        SCI.toast('No activity recorded in ' + label);
        return null;
      }
      return { doc: buildMonthlyPdf(y, m, label, ms), label };
    };
    SCI.ui.modal({ title: 'Monthly quality report', body, actions: [
      { label: 'Save PDF', cls: 'btn-secondary', onClick: async () => {
        const r = await gen();
        if (r) { r.doc.save('SCI-Monthly-Report_' + r.label.replace(/\s+/g, '-') + '.pdf'); SCI.toast('PDF saved to Downloads / Files'); }
      } },
      { label: 'Share / Email', cls: 'btn-primary', onClick: async () => {
        const r = await gen();
        if (!r) return;
        const file = new File([r.doc.output('blob')], 'SCI-Monthly-Report_' + r.label.replace(/\s+/g, '-') + '.pdf', { type: 'application/pdf' });
        await SCI.shareFiles([file], 'Monthly quality report — ' + r.label,
          'Dear Sir/Madam,\n\nPlease find attached the monthly quality report for ' + r.label + ' from Shri Cauvery Industries.\n\nRegards,\nShri Cauvery Industries');
      } },
    ] });
  }

  /* render a chart offscreen at 2x, on white, as JPEG (keeps the PDF small) */
  function chartPng(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = h * 2;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.scale(2, 2);
    /* draw fns read cv.width/height — give them logical size */
    const logical = { width: w, height: h, getContext: () => ctx };
    draw(logical);
    return cv.toDataURL('image/jpeg', 0.85);
  }

  function buildMonthlyPdf(y, m, label, ms) {
    const pdf = SCI.pdf;
    const { W, MARGIN } = pdf.PAGE;
    const doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let yPos = pdf.brandHeader(doc, 'Monthly Report — ' + label);

    /* topline numbers */
    yPos = pdf.sectionTitle(doc, 'Summary', yPos);
    const stats = [
      ['Parts inspected', ms.cohort.length],
      ['Accepted', ms.accepted],
      ['Rejected / scrapped', ms.rejected],
      ['In process', ms.inProcess],
      ['Dispatched this month', ms.dispatched],
      ['Internal acceptance', ms.internalRate === null ? '—' : ms.internalRate + '%'],
      ['TPI acceptance', ms.tpiRate === null ? '—' : ms.tpiRate + '%'],
    ];
    const colW = (W - MARGIN * 2) / stats.length;
    stats.forEach(([lbl, v], i) => {
      const x = MARGIN + i * colW;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(28, 61, 90);
      doc.text(String(v), x, yPos + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(doc.splitTextToSize(lbl.toUpperCase(), colW - 4), x, yPos + 9);
    });
    yPos += 20;

    /* charts, two per row */
    const chartW = 130, gap = (W - MARGIN * 2 - chartW * 2);
    const acceptedPie = chartPng(520, 250, cv => drawPie(cv, [
      ['Accepted', ms.accepted, '#1e7d43'],
      ['Rejected', ms.rejected, '#c0392b'],
      ['In process', ms.inProcess, '#e8890c'],
    ].filter(([, v]) => v > 0), 0));
    const statusDonut = chartPng(520, 250, cv => drawPie(cv,
      Object.values(P().ST)
        .map(st => [P().LABELS[st], ms.byS[st].length, STATUS_COLORS[st]])
        .filter(([, v]) => v > 0), 52));
    const trend = chartPng(560, 260, cv => drawMonthly(cv, ms.pieces, new Date(y, m, 1)));
    const rates = chartPng(560, 150, cv => drawHBars(cv, [
      ['Internal', ms.internalRate],
      ['TPI', ms.tpiRate],
    ]));

    if (ms.cohort.length) {
      yPos = pdf.sectionTitle(doc, 'This month\'s parts', yPos);
      doc.addImage(acceptedPie, 'JPEG', MARGIN, yPos, chartW, chartW * 250 / 520);
      doc.addImage(statusDonut, 'JPEG', MARGIN + chartW + gap, yPos, chartW, chartW * 250 / 520);
      yPos += chartW * 250 / 520 + 8;
    }

    yPos = pdf.sectionTitle(doc, 'Trend & rates', yPos);
    doc.addImage(trend, 'JPEG', MARGIN, yPos, chartW, chartW * 260 / 560);
    doc.addImage(rates, 'JPEG', MARGIN + chartW + gap, yPos, chartW, chartW * 150 / 560);
    yPos += chartW * 260 / 560 + 6;

    /* second page: lists */
    doc.addPage();
    let y2 = 16;
    const listBlock = (title, rows) => {
      y2 = pdf.sectionTitle(doc, title, y2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(30, 37, 48);
      if (!rows.length) {
        doc.setTextColor(100, 116, 139);
        doc.text('None.', MARGIN + 1, y2);
        y2 += 7;
      } else {
        rows.forEach(t => {
          if (y2 > 190) { doc.addPage(); y2 = 16; }
          doc.text('• ' + t, MARGIN + 1, y2);
          y2 += 5.5;
        });
        y2 += 3;
      }
    };
    const pieceLine = p => `${P().label(p)}${p.partDescription ? ' — ' + p.partDescription : ''}`;
    listBlock('Deviation parts (current)', ms.byS.deviation.map(pieceLine));
    listBlock('Delivery challan parts (current)', ms.byS.challan.map(pieceLine));
    listBlock('Scrapped / rejected parts', ms.byS.rejected.map(pieceLine));
    listBlock('Most rejected part numbers (decisions this month)',
      ms.problems.map(([pn, { n, desc }]) => `${pn}${desc ? ' — ' + desc : ''}: ${n} not-OK decision(s)`));

    pdf.brandFooter(doc);
    return doc;
  }

  /* horizontal % bars */
  function drawHBars(cv, rows) {
    const ctx = cv.getContext('2d');
    ctx.font = '14px sans-serif';
    let y = 24;
    rows.forEach(([lbl, pct]) => {
      ctx.fillStyle = '#1d2530';
      ctx.fillText(lbl, 10, y + 15);
      const bx = 90, bw = cv.width - bx - 70, bh = 22;
      ctx.fillStyle = '#e5e9ee';
      ctx.fillRect(bx, y, bw, bh);
      if (pct !== null) {
        ctx.fillStyle = pct >= 80 ? '#1e7d43' : pct >= 50 ? '#e8890c' : '#c0392b';
        ctx.fillRect(bx, y, bw * pct / 100, bh);
        ctx.fillStyle = '#1d2530';
        ctx.fillText(pct + '%', bx + bw + 10, y + 16);
      } else {
        ctx.fillStyle = '#64748b';
        ctx.fillText('no data yet', bx + bw + 10, y + 16);
      }
      y += 44;
    });
  }

  /* ================= SETTINGS TAB ================= */
  let adminUntil = 0;

  async function renderSettings(root) {
    root.innerHTML = '';
    const settings = (await SCI.db.kvGet('settings')) || {};

    if (!settings.adminPinHash) return renderCreatePin(root, settings);
    if (Date.now() > adminUntil) return renderPinGate(root, settings);

    /* ---- TPIs ---- */
    const tpiCard = el('div', 'card');
    tpiCard.append(el('h3', null, 'Third-party inspectors'));
    (settings.tpis || []).forEach((t, i) => {
      const row = el('div', 'pd-piece-row');
      row.append(el('span', null, `${t.name} <${t.email}>${t.pinHash ? ' · PIN set' : ''}`));
      const x = el('button', 'photo-del', '✕');
      x.addEventListener('click', async () => {
        if (!confirm('Remove ' + t.name + '?')) return;
        settings.tpis.splice(i, 1);
        await SCI.db.kvSet('settings', settings);
        renderSettings(root);
      });
      row.append(x);
      tpiCard.append(row);
    });
    const tn = el('input', 'modal-input'); tn.placeholder = 'TPI name';
    const te = el('input', 'modal-input'); te.placeholder = 'TPI email'; te.type = 'email';
    const tp = el('input', 'modal-input'); tp.placeholder = 'Fallback PIN (optional, 4+ digits)'; tp.inputMode = 'numeric';
    const addT = el('button', 'btn btn-secondary', 'Add TPI');
    addT.addEventListener('click', async () => {
      if (!tn.value.trim() || !te.value.includes('@')) { SCI.toast('Name and a valid email required'); return; }
      const t = { id: SCI.db.newId('t'), name: tn.value.trim(), email: te.value.trim() };
      if (tp.value.trim().length >= 4) {
        t.pinSalt = SCI.crypto.randSalt();
        t.pinHash = await SCI.crypto.hashPin(tp.value, t.pinSalt);
      }
      settings.tpis = settings.tpis || [];
      settings.tpis.push(t);
      await SCI.db.kvSet('settings', settings);
      renderSettings(root);
    });
    tpiCard.append(tn, te, tp, addT);
    root.append(tpiCard);

    /* ---- OTP endpoint ---- */
    const otpCard = el('div', 'card');
    otpCard.append(el('h3', null, 'Email OTP endpoint'));
    otpCard.append(el('p', 'modal-hint', 'Google Apps Script URL that emails approval codes to TPIs (see docs/otp-apps-script.gs in the repo for 5-minute setup). Without it, TPIs use their fallback PIN.'));
    const ou = el('input', 'modal-input'); ou.placeholder = 'https://script.google.com/macros/s/…/exec';
    ou.value = settings.otpEndpoint || '';
    const os = el('input', 'modal-input'); os.placeholder = 'Shared secret (same as in the script)';
    os.value = settings.otpSecret || '';
    const saveO = el('button', 'btn btn-secondary', 'Save endpoint');
    saveO.addEventListener('click', async () => {
      settings.otpEndpoint = ou.value.trim();
      settings.otpSecret = os.value.trim();
      await SCI.db.kvSet('settings', settings);
      SCI.toast('Saved');
    });
    const testO = el('button', 'btn btn-ghost', 'Send test code');
    testO.addEventListener('click', async () => {
      const tpis = settings.tpis || [];
      if (!tpis.length) { SCI.toast('Add a TPI first'); return; }
      settings.otpEndpoint = ou.value.trim(); settings.otpSecret = os.value.trim();
      await SCI.db.kvSet('settings', settings);
      const r = await SCI.tpi.sendOtp(tpis[0]);
      SCI.toast(r.ok ? 'Test code sent to ' + tpis[0].email : 'Failed: ' + r.error, 4500);
    });
    otpCard.append(ou, os, saveO, testO);
    root.append(otpCard);

    /* ---- backup ---- */
    const bkCard = el('div', 'card');
    bkCard.append(el('h3', null, 'Backup'));
    bkCard.append(el('p', 'modal-hint', settings.lastBackupAt
      ? 'Last backup: ' + fmtDT(settings.lastBackupAt)
      : 'Never backed up — everything lives only on this device!'));
    const bk = el('button', 'btn btn-primary', 'Back up now (share file)');
    bk.addEventListener('click', async () => {
      await SCI.backup.exportAll();
      renderSettings(root);
    });
    const restIn = el('input', 'modal-input');
    restIn.type = 'file';
    restIn.accept = 'application/json,.json';
    restIn.addEventListener('change', async () => {
      const f = restIn.files[0];
      if (!f) return;
      if (!confirm('Restoring REPLACES all data on this device with the backup. Continue?')) { restIn.value = ''; return; }
      try {
        const n = await SCI.backup.importFile(f);
        SCI.toast(`Restored ${n.reports} reports, ${n.pieces} pieces, ${n.dispatches} dispatches`);
        setTimeout(() => location.reload(), 1200);
      } catch (e) {
        SCI.toast('Restore failed: ' + e.message, 5000);
      }
    });
    bkCard.append(bk, el('p', 'modal-hint', 'Restore from a backup file:'), restIn);
    root.append(bkCard);

    /* ---- admin pin ---- */
    const pinCard = el('div', 'card');
    pinCard.append(el('h3', null, 'Admin PIN'));
    const np = el('input', 'modal-input'); np.placeholder = 'New admin PIN (4+ digits)'; np.inputMode = 'numeric'; np.type = 'password';
    const chg = el('button', 'btn btn-ghost', 'Change PIN');
    chg.addEventListener('click', async () => {
      if (np.value.trim().length < 4) { SCI.toast('PIN too short'); return; }
      settings.adminPinSalt = SCI.crypto.randSalt();
      settings.adminPinHash = await SCI.crypto.hashPin(np.value, settings.adminPinSalt);
      await SCI.db.kvSet('settings', settings);
      np.value = '';
      SCI.toast('Admin PIN changed');
    });
    pinCard.append(np, chg);
    root.append(pinCard);
  }

  function renderCreatePin(root, settings) {
    const card = el('div', 'card');
    card.append(el('h3', null, 'Set up admin PIN'));
    card.append(el('p', 'modal-hint', 'This PIN protects Settings (TPI list, backups). Choose one only you know.'));
    const p1 = el('input', 'modal-input'); p1.placeholder = 'New PIN (4+ digits)'; p1.type = 'password'; p1.inputMode = 'numeric';
    const p2 = el('input', 'modal-input'); p2.placeholder = 'Repeat PIN'; p2.type = 'password'; p2.inputMode = 'numeric';
    const go = el('button', 'btn btn-primary', 'Set PIN');
    go.addEventListener('click', async () => {
      if (p1.value.trim().length < 4) { SCI.toast('PIN too short'); return; }
      if (p1.value !== p2.value) { SCI.toast('PINs do not match'); return; }
      settings.adminPinSalt = SCI.crypto.randSalt();
      settings.adminPinHash = await SCI.crypto.hashPin(p1.value, settings.adminPinSalt);
      await SCI.db.kvSet('settings', settings);
      adminUntil = Date.now() + 10 * 60 * 1000;
      renderSettings(root);
    });
    card.append(p1, p2, go);
    root.innerHTML = '';
    root.append(card);
  }

  function renderPinGate(root, settings) {
    const card = el('div', 'card');
    card.append(el('h3', null, 'Settings locked'));
    const p = el('input', 'modal-input'); p.placeholder = 'Admin PIN'; p.type = 'password'; p.inputMode = 'numeric';
    const go = el('button', 'btn btn-primary', 'Unlock');
    go.addEventListener('click', async () => {
      const h = await SCI.crypto.hashPin(p.value, settings.adminPinSalt);
      if (h !== settings.adminPinHash) { SCI.toast('Wrong PIN'); p.value = ''; return; }
      adminUntil = Date.now() + 10 * 60 * 1000;
      renderSettings(root);
    });
    p.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
    card.append(p, go);
    root.innerHTML = '';
    root.append(card);
  }

  return { renderParts, renderDispatch, renderStats, renderSettings, ensureTpi };
})();
