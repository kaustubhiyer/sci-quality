/**
 * SCI Quality — TPI OTP email sender (Google Apps Script)
 *
 * Emails a one-time approval code to the TPI, from YOUR Gmail account.
 * The app never sees the code until the TPI types it in: only a hash is
 * returned to the browser.
 *
 * ONE-TIME SETUP (~5 minutes):
 *  1. Go to https://script.google.com → New project.
 *  2. Delete the sample code, paste this entire file.
 *  3. Change SECRET below to a long random phrase (keep it private).
 *  4. Click Deploy → New deployment → type: Web app.
 *       - Execute as: Me
 *       - Who has access: Anyone
 *     → Deploy, authorize when prompted, and copy the Web app URL
 *       (ends in /exec).
 *  5. In the SCI Quality app: Settings → Email OTP endpoint →
 *     paste the URL and the same SECRET → Save → "Send test code".
 *
 * NOTE: free Gmail allows ~100 MailApp emails/day — far more than needed.
 */

const SECRET = 'CHANGE-ME-to-a-long-random-phrase';

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad-request' });
  }
  if (body.secret !== SECRET) return json_({ ok: false, error: 'unauthorized' });

  if (body.action === 'send_otp') {
    if (!body.email || body.email.indexOf('@') < 0) return json_({ ok: false, error: 'bad-email' });
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const salt = Utilities.getUuid();
    const hash = sha256_(otp + salt);
    MailApp.sendEmail({
      to: body.email,
      subject: 'SCI Quality — TPI approval code: ' + otp,
      body:
        'Your one-time approval code for SCI Quality is:\n\n' +
        '    ' + otp + '\n\n' +
        'It expires in 10 minutes. If you did not expect this, ignore this email.\n\n' +
        '— Shri Cauvery Industries quality app',
    });
    return json_({ ok: true, hash: hash, salt: salt, expiresAt: Date.now() + 10 * 60 * 1000 });
  }

  return json_({ ok: false, error: 'unknown-action' });
}

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
