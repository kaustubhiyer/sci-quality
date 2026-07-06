/* IndexedDB persistence — all data stays on this device. */
window.SCI = window.SCI || {};

SCI.db = (() => {
  const DB_NAME = 'sci-quality';
  const STORE = 'reports';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const out = fn(store);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
    }));
  }

  return {
    async save(report) {
      report.updatedAt = Date.now();
      await tx('readwrite', s => s.put(report));
      return report;
    },
    async get(id) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },
    async list() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).index('updatedAt').getAll();
        req.onsuccess = () => resolve((req.result || []).reverse());
        req.onerror = () => reject(req.error);
      });
    },
    async remove(id) {
      await tx('readwrite', s => s.delete(id));
    },
    newId() {
      return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
  };
})();
