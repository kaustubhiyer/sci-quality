/* Incoming/outgoing inspection report — based on the SCI quality template. */
SCI.registerForm({
  id: 'inspection-report',
  title: 'Inspection Report',
  icon: '📐',
  iconName: 'ruler',
  description: 'Dimensional & quality inspection of fabricated parts',

  sections: [
    {
      type: 'fields',
      title: 'Details',
      fields: [
        { key: 'customer', label: 'Customer', input: 'text' },
        { key: 'partDescription', label: 'Part Description', input: 'text' },
        { key: 'partNo', label: 'Part No.', input: 'text' },
        { key: 'qty', label: 'Qty', input: 'number' },
        { key: 'poNo', label: 'P.O. No.', input: 'text' },
        { key: 'woNo', label: 'WO No.', input: 'text' },
        { key: 'grnNo', label: 'GRN No.', input: 'text' },
        { key: 'date', label: 'Date', input: 'date', default: 'today' },
      ],
    },
    {
      type: 'measurements',
      key: 'measurements',
      title: 'Measurements',
      defaultRows: 5,
      maxReadings: 10,
      defaultReadings: 5,
    },
    {
      type: 'pieceResults',
      key: 'pieceResults',
      title: 'Piece Results',
    },
    {
      type: 'checks',
      key: 'checks',
      title: 'Condition Checks',
      options: ['OK', 'Not OK', 'N/A'],
      items: [
        { key: 'surface', label: 'Surface finish — Matt / Mirror / GBB / Plating / Painting' },
        { key: 'physical', label: 'Physical condition — no scratches / rust / bend / bad surface' },
        { key: 'packing', label: 'Transport-worthy packing is done' },
      ],
    },
    {
      type: 'textarea',
      key: 'remarks',
      title: 'Remarks',
      label: 'Remarks / observations',
      placeholder: 'e.g. M6 tap has been found OK',
    },
    {
      type: 'fields',
      title: 'Result',
      fields: [
        { key: 'result', label: 'Inspection Result', input: 'select', options: ['Accepted', 'Rejected', 'Conditionally Accepted'] },
        { key: 'inspector', label: 'Inspected By', input: 'text' },
      ],
    },
    { type: 'signature', key: 'signature', title: 'Inspector Signature' },
  ],

  summary(data) {
    const title = [data.partDescription, data.partNo && `(${data.partNo})`].filter(Boolean).join(' ') || 'Untitled report';
    const bits = [];
    if (data.customer) bits.push(data.customer);
    if (data.poNo) bits.push('P.O. ' + data.poNo);
    if (data.date) bits.push(data.date);
    let status = 'draft';
    if (data.result === 'Accepted') status = 'ok';
    else if (data.result === 'Rejected') status = 'bad';
    return { title, subtitle: bits.join(' · '), status, statusLabel: data.result || 'Draft' };
  },

  fileName(data) {
    const safe = s => (s || '').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '');
    return ['Inspection-Report', safe(data.partNo), data.date].filter(Boolean).join('_');
  },

  emailText(data) {
    const l = [];
    l.push(`Dear Sir/Madam,`);
    l.push('');
    l.push(`Please find attached the inspection report from Shri Cauvery Industries.`);
    l.push('');
    if (data.partDescription) l.push(`Part: ${data.partDescription}${data.partNo ? ' (Part No. ' + data.partNo + ')' : ''}`);
    if (data.qty) l.push(`Qty: ${data.qty}`);
    if (data.poNo) l.push(`P.O. No.: ${data.poNo}`);
    if (data.woNo) l.push(`WO No.: ${data.woNo}`);
    if (data.grnNo) l.push(`GRN No.: ${data.grnNo}`);
    if (data.result) l.push(`Inspection result: ${data.result}`);
    if (data.date) l.push(`Inspection date: ${data.date}`);
    l.push('');
    l.push('Regards,');
    l.push(data.inspector || 'Quality Team');
    l.push('Shri Cauvery Industries');
    return l.join('\n');
  },
});
