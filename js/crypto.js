/* Hashing helpers for PINs and OTPs (WebCrypto SHA-256). */
window.SCI = window.SCI || {};

SCI.crypto = {
  async sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  randSalt() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  hashPin(pin, salt) {
    return SCI.crypto.sha256(salt + ':' + String(pin).trim());
  },
};
