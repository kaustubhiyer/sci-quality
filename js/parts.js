/* Piece lifecycle engine.
 * A "piece" is one physical part: WO No. + Part No. + Serial.
 *
 * Status flow:
 *   internal OK        -> awaiting_tpi -> (TPI approve) -> ready -> in_dispatch -> dispatched
 *   internal/TPI NOK   -> deviation | challan | rework | rejected
 *   deviation/challan  -> client approved -> ready (skips TPI) | client rejected -> rework
 *   rework             -> re-inspected -> back through the flow
 */
window.SCI = window.SCI || {};

SCI.parts = (() => {
  const ST = {
    AWAITING_TPI: 'awaiting_tpi',
    READY: 'ready',
    IN_DISPATCH: 'in_dispatch',
    DISPATCHED: 'dispatched',
    DEVIATION: 'deviation',
    CHALLAN: 'challan',
    REWORK: 'rework',
    REJECTED: 'rejected',
  };

  const LABELS = {
    awaiting_tpi: 'Awaiting TPI',
    ready: 'Ready to dispatch',
    in_dispatch: 'In dispatch',
    dispatched: 'Dispatched',
    deviation: 'Deviation',
    challan: 'Delivery challan',
    rework: 'Rework',
    rejected: 'Rejected',
  };

  /* chip colour class per status (defined in styles.css) */
  const CHIP = {
    awaiting_tpi: 'st-wait', ready: 'st-ok', in_dispatch: 'st-info',
    dispatched: 'st-done', deviation: 'st-warn', challan: 'st-warn',
    rework: 'st-warn', rejected: 'st-bad',
  };

  /* internal result buckets selectable on the inspection form */
  const INTERNAL_RESULTS = [
    { key: 'ok', label: 'OK' },
    { key: 'deviation', label: 'Deviation' },
    { key: 'challan', label: 'Challan' },
    { key: 'rework', label: 'Rework' },
    { key: 'rejected', label: 'Rejected' },
  ];

  const pieceId = (woNo, partNo, serial) =>
    [String(woNo).trim(), String(partNo).trim(), serial].join('|');

  async function get(id) { return SCI.db.get('pieces', id); }
  async function all() { return SCI.db.all('pieces'); }
  async function byStatus(status) {
    return (await all()).filter(p => p.status === status);
  }

  /* Highest serial already used for this WO+Part (for auto-numbering). */
  async function maxSerial(woNo, partNo) {
    const prefix = String(woNo).trim() + '|' + String(partNo).trim() + '|';
    let max = 0;
    (await all()).forEach(p => {
      if (p.id.startsWith(prefix)) max = Math.max(max, p.serial);
    });
    return max;
  }

  function pushHistory(piece, to, by, note) {
    piece.history.push({ at: Date.now(), from: piece.status || null, to, by, note: note || '' });
    piece.status = to;
    piece.updatedAt = Date.now();
  }

  /* Create/update pieces from a saved inspection report.
   * Only touches pieces still in a pre-approval state — a report edit can
   * never clobber a TPI-approved or dispatched piece. */
  async function syncFromReport(report) {
    const d = report.data;
    const pr = d.pieceResults;
    if (!d.woNo || !d.partNo || !pr || !pr.results) return 0;
    const editable = [null, undefined, ST.AWAITING_TPI, ST.DEVIATION, ST.CHALLAN, ST.REWORK, ST.REJECTED];
    let touched = 0;

    for (let i = 0; i < pr.results.length; i++) {
      const res = pr.results[i];
      if (!res) continue;
      const serial = (pr.start || 1) + i;
      const id = pieceId(d.woNo, d.partNo, serial);
      let piece = await get(id);
      if (!piece) {
        piece = {
          id, woNo: String(d.woNo).trim(), partNo: String(d.partNo).trim(), serial,
          partDescription: d.partDescription || '', customer: d.customer || '',
          status: null, history: [], reportIds: [], photos: [],
          approval: null, dispatchId: null, createdAt: Date.now(),
        };
      }
      if (!piece.reportIds.includes(report.id)) piece.reportIds.push(report.id);
      piece.partDescription = d.partDescription || piece.partDescription;
      piece.customer = d.customer || piece.customer;

      if (!editable.includes(piece.status)) continue; // locked (ready/dispatch)
      const to = res === 'ok' ? ST.AWAITING_TPI : ST[res.toUpperCase()];
      if (piece.status !== to) pushHistory(piece, to, 'internal', 'Internal inspection');
      await SCI.db.put('pieces', piece);
      touched++;
    }
    return touched;
  }

  async function transition(id, to, by, note, mutate) {
    const piece = await get(id);
    if (!piece) throw new Error('Piece not found: ' + id);
    pushHistory(piece, to, by, note);
    if (mutate) mutate(piece);
    await SCI.db.put('pieces', piece);
    return piece;
  }

  /* ---- analytics ---- */
  async function stats() {
    const pieces = await all();
    const byS = {};
    Object.values(ST).forEach(s => byS[s] = []);
    pieces.forEach(p => (byS[p.status] || (byS[p.status] = [])).push(p));

    const accepted = byS.ready.length + byS.in_dispatch.length + byS.dispatched.length;
    const rejected = byS.rejected.length;
    const inProcess = pieces.length - accepted - rejected;

    /* Acceptance rates: count only inspection decisions, not logistics moves. */
    const DECISIONS = [ST.AWAITING_TPI, ST.DEVIATION, ST.CHALLAN, ST.REWORK, ST.REJECTED];
    let intOk = 0, intAll = 0, tpiOk = 0, tpiAll = 0;
    pieces.forEach(p => p.history.forEach(h => {
      if (h.by === 'internal' && DECISIONS.includes(h.to)) { intAll++; if (h.to === ST.AWAITING_TPI) intOk++; }
      if (h.by === 'tpi') { tpiAll++; if (h.to === ST.READY) tpiOk++; }
    }));

    return {
      pieces, byS,
      total: pieces.length, accepted, rejected, inProcess,
      internalRate: intAll ? Math.round(100 * intOk / intAll) : null,
      tpiRate: tpiAll ? Math.round(100 * tpiOk / tpiAll) : null,
    };
  }

  const label = p => `${p.partNo} · S/N ${p.serial} · WO ${p.woNo}`;

  return { ST, LABELS, CHIP, INTERNAL_RESULTS, pieceId, get, all, byStatus, maxSerial, syncFromReport, transition, stats, label };
})();
