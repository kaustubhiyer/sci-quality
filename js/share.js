/* Share the PDF via the Android share sheet (Gmail, WhatsApp, Drive…).
 * Falls back to a plain download when the Web Share API is unavailable. */
window.SCI = window.SCI || {};

SCI.share = async function (schema, data) {
  const fileName = (schema.fileName(data) || 'report') + '.pdf';
  const blob = SCI.pdf.getBlob(schema, data);
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const text = schema.emailText ? schema.emailText(data) : '';
  const title = schema.title + ' — Shri Cauvery Industries';

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user closed the share sheet
      console.warn('Share failed, falling back to download', e);
    }
  }

  // Fallback: download the PDF, then open a pre-filled email (attach manually).
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  SCI.toast('Sharing not supported here — PDF downloaded. Attach it to the email that opens.', 5000);
  setTimeout(() => {
    location.href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(text);
  }, 800);
};
