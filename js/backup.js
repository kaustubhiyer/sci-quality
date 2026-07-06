/* Backup & restore — everything lives on this tablet, so regular exports
 * (share to Drive/Gmail) are the safety net. */
window.SCI = window.SCI || {};

SCI.backup = (() => {
  const STORES = ['reports', 'pieces', 'dispatches', 'kv'];

  async function exportAll() {
    const dump = { app: 'sci-quality', version: 2, exportedAt: new Date().toISOString() };
    for (const s of STORES) dump[s] = await SCI.db.all(s);
    const name = 'sci-quality-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });

    const settings = (await SCI.db.kvGet('settings')) || {};
    settings.lastBackupAt = Date.now();
    await SCI.db.kvSet('settings', settings);

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'SCI Quality backup' });
        return true;
      } catch (e) { if (e.name === 'AbortError') return false; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }

  async function importFile(file) {
    const text = await file.text();
    const dump = JSON.parse(text);
    if (dump.app !== 'sci-quality') throw new Error('Not an SCI Quality backup file');
    for (const s of STORES) {
      if (!Array.isArray(dump[s])) continue;
      await SCI.db.clear(s);
      for (const obj of dump[s]) await SCI.db.put(s, obj);
    }
    return {
      reports: (dump.reports || []).length,
      pieces: (dump.pieces || []).length,
      dispatches: (dump.dispatches || []).length,
    };
  }

  async function nagIfStale() {
    const settings = (await SCI.db.kvGet('settings')) || {};
    const pieces = await SCI.db.all('pieces');
    if (!pieces.length) return;
    const last = settings.lastBackupAt || 0;
    if (Date.now() - last > 7 * 24 * 3600 * 1000) {
      SCI.toast('Reminder: no backup in over a week — Settings → Back up now', 5000);
    }
  }

  return { exportAll, importFile, nagIfStale };
})();
