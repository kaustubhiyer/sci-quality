/* IndexedDB persistence — all data stays on this device.
 * Stores: reports (inspection reports), pieces (individual parts by
 * WO+PartNo+Serial), dispatches (dispatch groups), kv (settings). */
window.SCI = window.SCI || {};

SCI.db = (() => {
  const DB_NAME = 'sci-quality';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('reports')) {
          const s = db.createObjectStore('reports', { keyPath: 'id' });
          s.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('pieces')) {
          const s = db.createObjectStore('pieces', { keyPath: 'id' });
          s.createIndex('status', 'status');
        }
        if (!db.objectStoreNames.contains('dispatches')) {
          db.createObjectStore('dispatches', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'k' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function req(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const r = fn(db.transaction(store, mode).objectStore(store));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  }

  const api = {
    put: (store, obj) => req(store, 'readwrite', s => s.put(obj)),
    get: (store, id) => req(store, 'readonly', s => s.get(id)).then(r => r || null),
    all: store => req(store, 'readonly', s => s.getAll()).then(r => r || []),
    del: (store, id) => req(store, 'readwrite', s => s.delete(id)),
    clear: store => req(store, 'readwrite', s => s.clear()),

    kvGet: k => api.get('kv', k).then(r => (r ? r.v : null)),
    kvSet: (k, v) => api.put('kv', { k, v }),

    /* ---- reports (kept API-compatible with v1) ---- */
    async save(report) {
      report.updatedAt = Date.now();
      await api.put('reports', report);
      return report;
    },
    getReport: id => api.get('reports', id),
    async list() {
      const all = await api.all('reports');
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    remove: id => api.del('reports', id),

    newId(prefix) {
      return (prefix || 'r') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    },
  };
  return api;
})();
