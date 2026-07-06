/* PDF generation (jsPDF + autotable) — renders any registered form schema
 * into a branded A4 landscape report. */
window.SCI = window.SCI || {};

SCI.pdf = (() => {
  const COMPANY = 'SHRI CAUVERY INDUSTRIES';
  const NAVY = [28, 61, 90];
  const AMBER = [232, 137, 12];
  const RED = [192, 57, 43];
  const GREY = [100, 116, 139];
  const LINE = [216, 222, 229];

  const PAGE_W = 297, PAGE_H = 210, MARGIN = 12;

  function build(schema, data) {
    const doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let y = header(doc, schema.title);

    schema.sections.forEach(sec => {
      if (sec.type === 'fields') y = drawFields(doc, sec, data, y);
      else if (sec.type === 'measurements') y = drawMeasurements(doc, sec, data, y);
      else if (sec.type === 'checks') y = drawChecks(doc, sec, data, y);
      else if (sec.type === 'textarea') y = drawTextarea(doc, sec, data, y);
      else if (sec.type === 'signature') y = drawSignature(doc, sec, data, y);
    });

    footer(doc);
    return doc;
  }

  function header(doc, title) {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_W, 22, 'F');
    doc.setFillColor(...AMBER);
    doc.rect(0, 22, PAGE_W, 1.4, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(COMPANY, MARGIN, 10.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(220, 228, 236);
    doc.text('Steel & Sheet Metal Fabrication — Quality Assurance', MARGIN, 16.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), PAGE_W - MARGIN, 13.5, { align: 'right' });
    return 30;
  }

  function footer(doc) {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GREY);
      doc.text(COMPANY + ' — generated ' + new Date().toLocaleDateString('en-IN'), MARGIN, PAGE_H - 6);
      doc.text('Page ' + i + ' of ' + pages, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
    }
  }

  function ensureRoom(doc, y, needed) {
    if (y + needed > PAGE_H - 14) {
      doc.addPage();
      return 14;
    }
    return y;
  }

  function sectionTitle(doc, title, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(title.toUpperCase(), MARGIN, y);
    doc.setDrawColor(...AMBER);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y + 1.5, MARGIN + 24, y + 1.5);
    return y + 6;
  }

  function drawFields(doc, sec, data, y) {
    const fields = sec.fields.filter(f => data[f.key]);
    if (!fields.length) return y;
    y = ensureRoom(doc, y, 18);
    if (sec.title) y = sectionTitle(doc, sec.title, y);

    const cols = 4;
    const colW = (PAGE_W - MARGIN * 2) / cols;
    for (let i = 0; i < fields.length; i += cols) {
      let rowH = 0;
      fields.slice(i, i + cols).forEach((f, c) => {
        const x = MARGIN + c * colW;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...GREY);
        doc.text(f.label.toUpperCase(), x, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(30, 37, 48);
        const lines = doc.splitTextToSize(String(data[f.key]), colW - 8);
        doc.text(lines, x, y + 4.6);
        rowH = Math.max(rowH, 4.6 + lines.length * 4.6);
      });
      y += rowH + 2.5;
    }
    return y + 1;
  }

  function drawMeasurements(doc, sec, data, y) {
    const m = data[sec.key];
    if (!m) return y;
    const rows = m.rows.filter(r => r.parameter || r.spec || r.r.some(v => String(v).trim() !== ''));
    if (!rows.length) return y;

    y = ensureRoom(doc, y, 30);
    y = sectionTitle(doc, sec.title || 'Measurements', y);

    const n = m.readings;
    const hasTap = rows.some(r => r.tapped);
    const head = [['#', 'Parameter', 'Specification', 'Tolerance', 'Instrument',
      ...Array.from({ length: n }, (_, i) => 'R' + (i + 1)),
      ...(hasTap ? ['Tapping'] : [])]];
    const body = rows.map((r, i) => [
      i + 1, r.parameter, r.spec,
      r.tol ? (String(r.tol).includes('±') ? r.tol : '± ' + r.tol) : '',
      r.instrument,
      ...r.r.slice(0, n).map(v => v === undefined ? '' : String(v)),
      ...(hasTap ? [r.tapped ? (r.tapResult || '—') : ''] : []),
    ]);

    doc.autoTable({
      head, body,
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 14 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.15, textColor: [30, 37, 48] },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 42 },
        2: { halign: 'center', cellWidth: 24 },
        3: { halign: 'center', cellWidth: 20 },
        4: { cellWidth: 26 },
      },
      didParseCell(hook) {
        if (hook.section !== 'body' || hook.column.index < 5) return;
        hook.cell.styles.halign = 'center';
        const row = rows[hook.row.index];
        if (hook.column.index < 5 + n) {
          const reading = row.r[hook.column.index - 5];
          if (SCI.isOutOfTol(row.spec, row.tol, reading)) {
            hook.cell.styles.textColor = RED;
            hook.cell.styles.fontStyle = 'bold';
            hook.cell.styles.fillColor = [253, 236, 234];
          }
        } else if (row.tapped) { /* Tapping column */
          const v = row.tapResult;
          hook.cell.styles.fontStyle = 'bold';
          if (v === 'Not OK') {
            hook.cell.styles.textColor = RED;
            hook.cell.styles.fillColor = [253, 236, 234];
          } else if (v === 'OK') {
            hook.cell.styles.textColor = [30, 125, 67];
          } else {
            hook.cell.styles.textColor = GREY;
          }
        }
      },
    });
    return doc.lastAutoTable.finalY + 7;
  }

  function drawChecks(doc, sec, data, y) {
    const state = data[sec.key] || {};
    const items = sec.items.filter(i => state[i.key]);
    if (!items.length) return y;
    y = ensureRoom(doc, y, 12 + items.length * 6);
    y = sectionTitle(doc, sec.title || 'Checks', y);

    items.forEach(item => {
      const val = state[item.key];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 37, 48);
      doc.text('• ' + item.label, MARGIN + 1, y);
      doc.setFont('helvetica', 'bold');
      if (val === 'OK') doc.setTextColor(30, 125, 67);
      else if (val === 'Not OK') doc.setTextColor(...RED);
      else doc.setTextColor(...GREY);
      doc.text(val, PAGE_W - MARGIN, y, { align: 'right' });
      y += 5.5;
    });
    return y + 2;
  }

  function drawTextarea(doc, sec, data, y) {
    const text = (data[sec.key] || '').trim();
    if (!text) return y;
    const lines = doc.splitTextToSize(text, PAGE_W - MARGIN * 2 - 2);
    y = ensureRoom(doc, y, 12 + lines.length * 4.5);
    y = sectionTitle(doc, sec.title || 'Remarks', y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 37, 48);
    doc.text(lines, MARGIN + 1, y);
    return y + lines.length * 4.5 + 3;
  }

  function drawSignature(doc, sec, data, y) {
    const sig = data[sec.key];
    if (!sig) return y;
    y = ensureRoom(doc, y, 26) + 2;
    const fmt = sig.slice(0, 24).includes('image/png') ? 'PNG' : 'JPEG';
    try {
      doc.addImage(sig, fmt, MARGIN, y, 50, 16);
    } catch (e) { /* corrupt signature data — leave space blank */ }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + 18, MARGIN + 60, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text((sec.title || 'Signature').toUpperCase(), MARGIN, y + 21.5);
    return y + 25;
  }

  return {
    build,
    download(schema, data) {
      build(schema, data).save((schema.fileName(data) || 'report') + '.pdf');
    },
    getBlob(schema, data) {
      return build(schema, data).output('blob');
    },
    /* shared branding for non-form PDFs (e.g. monthly report) */
    brandHeader: header,
    brandFooter: footer,
    sectionTitle,
    PAGE: { W: PAGE_W, H: PAGE_H, MARGIN },
    NAVY, GREY,
  };
})();
