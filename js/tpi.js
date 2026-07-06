/* TPI (third-party inspector) verification.
 * Preferred: 6-digit OTP emailed to the TPI via the user's own Google Apps
 * Script endpoint (docs/otp-apps-script.gs). Fallback: per-TPI PIN set in
 * Settings. A successful check opens a 10-minute session so the TPI can act
 * on several pieces without re-verifying. */
window.SCI = window.SCI || {};

SCI.tpi = (() => {
  const SESSION_MS = 10 * 60 * 1000;
  let session = null; // { tpi:{id,name,email}, until }

  function active() {
    if (session && Date.now() < session.until) return session.tpi;
    session = null;
    return null;
  }

  function start(tpi) {
    session = { tpi: { id: tpi.id, name: tpi.name, email: tpi.email }, until: Date.now() + SESSION_MS };
  }

  function end() { session = null; }

  async function sendOtp(tpi) {
    const cfg = (await SCI.db.kvGet('settings')) || {};
    if (!cfg.otpEndpoint) return { ok: false, error: 'no-endpoint' };
    try {
      const res = await fetch(cfg.otpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight
        body: JSON.stringify({ action: 'send_otp', email: tpi.email, secret: cfg.otpSecret || '' }),
      });
      const j = await res.json();
      if (!j.ok) return { ok: false, error: j.error || 'endpoint-error' };
      return { ok: true, hash: j.hash, salt: j.salt, expiresAt: j.expiresAt };
    } catch (e) {
      return { ok: false, error: 'network' };
    }
  }

  async function verifyOtp(challenge, entered) {
    if (Date.now() > challenge.expiresAt) return false;
    const h = await SCI.crypto.sha256(String(entered).trim() + challenge.salt);
    return h === challenge.hash;
  }

  async function verifyPin(tpi, entered) {
    if (!tpi.pinHash) return false;
    const h = await SCI.crypto.hashPin(entered, tpi.pinSalt);
    return h === tpi.pinHash;
  }

  return { active, start, end, sendOtp, verifyOtp, verifyPin, SESSION_MS };
})();
