/* Touch/stylus signature pad on a <canvas>. */
window.SCI = window.SCI || {};

SCI.SignaturePad = class {
  constructor(canvas, onChange) {
    this.canvas = canvas;
    this.onChange = onChange || (() => {});
    this.ctx = canvas.getContext('2d');
    this.drawing = false;
    this.dirty = false;
    this._resize();
    canvas.addEventListener('pointerdown', e => this._start(e));
    canvas.addEventListener('pointermove', e => this._move(e));
    window.addEventListener('pointerup', () => this._end());
    window.addEventListener('resize', () => this._resize(true));
  }

  _resize(preserve) {
    const data = preserve && this.dirty ? this.canvas.toDataURL() : null;
    const ratio = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;
    this.ctx.scale(ratio, ratio);
    this.ctx.lineWidth = 2.2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#1d2530';
    if (data) {
      const img = new Image();
      img.onload = () => this.ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = data;
    }
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _start(e) {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.drawing = true;
    const p = this._pos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
    this.ctx.lineTo(p.x + 0.1, p.y + 0.1);
    this.ctx.stroke();
    this.dirty = true;
  }

  _move(e) {
    if (!this.drawing) return;
    e.preventDefault();
    const p = this._pos(e);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
  }

  _end() {
    if (!this.drawing) return;
    this.drawing = false;
    this.onChange(this.toDataURL());
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = false;
    this.onChange(null);
  }

  /* Export as JPEG on white — keeps saved reports and PDFs small. */
  toDataURL() {
    if (!this.dirty) return null;
    const off = document.createElement('canvas');
    off.width = this.canvas.width;
    off.height = this.canvas.height;
    const c = off.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, off.width, off.height);
    c.drawImage(this.canvas, 0, 0);
    return off.toDataURL('image/jpeg', 0.85);
  }

  load(dataURL) {
    this.clear();
    if (!dataURL) return;
    const img = new Image();
    img.onload = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.ctx.drawImage(img, 0, 0, rect.width, rect.height);
      this.dirty = true;
    };
    img.src = dataURL;
  }
};
