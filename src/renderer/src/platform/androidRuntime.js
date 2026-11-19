import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { v4 as uuidv4 } from 'uuid';
import appPackage from '../../../../package.json';
import { openAndroidDatabase } from './androidDatabase.js';
import { createAndroidDataApi } from './androidDataApi.js';

const asResult = async (work) => {
  try { return { success: true, data: await work() }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
};

export async function initializeAndroidRuntime() {
  if (Capacitor.getPlatform() !== 'android') return;
  const db = await openAndroidDatabase();
  await Filesystem.mkdir({ path: 'images', directory: Directory.Data, recursive: true });
  await Filesystem.mkdir({ path: 'backups', directory: Directory.Data, recursive: true });
  const listDirectory = async (path) => {
    try { return (await Filesystem.readdir({ path, directory: Directory.Data })).files; }
    catch (error) {
      if (/does not exist|not found|no such file/i.test(String(error?.message || error))) return [];
      throw error;
    }
  };
  window.bookAPI = createAndroidDataApi(db, {
    deleteImage: async (id) => {
      const result = await window.imageAPI.delete(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  window.generalAPI = { getVersion: async () => appPackage.version };
  window.storeAPI = {
    get: async (key, fallback) => { const value = localStorage.getItem(`storyteller:${key}`); return value === null ? fallback : JSON.parse(value); },
    set: async (key, value) => {
      localStorage.setItem(`storyteller:${key}`, JSON.stringify(value));
      if (key.startsWith('storage.')) scheduleBackup();
      return true;
    },
    delete: async (key) => { localStorage.removeItem(`storyteller:${key}`); return true; },
    clear: async () => { for (const key of Object.keys(localStorage)) if (key.startsWith('storyteller:')) localStorage.removeItem(key); return true; },
    has: async (key) => localStorage.getItem(`storyteller:${key}`) !== null,
    getAll: async () => Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith('storyteller:')).map((key) => [key.slice(12), JSON.parse(localStorage.getItem(key))])),
  };
  window.workspaceAPI = {
    load: (bookId) => asResult(async () => {
      const rows = (await db.query('SELECT dockview_layout AS dockviewLayout, panel_layout AS panelLayout FROM workspace_state WHERE book_id = ?', [bookId])).values ?? [];
      const row = rows[0];
      return row ? { dockviewLayout: row.dockviewLayout ? JSON.parse(row.dockviewLayout) : null, panelLayout: row.panelLayout ? JSON.parse(row.panelLayout) : null } : null;
    }),
    save: (bookId, state) => asResult(async () => {
      await db.run(`INSERT INTO workspace_state(book_id, dockview_layout, panel_layout, updated_at) VALUES(?, ?, ?, ?)
        ON CONFLICT(book_id) DO UPDATE SET dockview_layout=excluded.dockview_layout, panel_layout=excluded.panel_layout, updated_at=excluded.updated_at`,
      [bookId, JSON.stringify(state.dockviewLayout ?? {}), state.panelLayout ? JSON.stringify(state.panelLayout) : null, Date.now()]);
      return true;
    }),
  };
  window.imageAPI = {
    save: (base64Data, originalFilename = 'image.jpg') => asResult(async () => {
      const extension = originalFilename.match(/\.[a-z0-9]+$/i)?.[0] || '.jpg';
      const id = uuidv4();
      const data = base64Data.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
      await Filesystem.writeFile({ path: `images/${id}${extension}`, data, directory: Directory.Data, recursive: true });
      return { uuid: id, filename: `${id}${extension}`, filepath: `images/${id}${extension}` };
    }),
    getData: (id) => asResult(async () => {
      if (!id) return null;
      const files = await listDirectory('images');
      const file = files.find(({ name }) => name.startsWith(`${id}.`));
      if (!file) return null;
      const { data } = await Filesystem.readFile({ path: `images/${file.name}`, directory: Directory.Data });
      const ext = file.name.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      return `data:${mime};base64,${data}`;
    }),
    delete: (id) => asResult(async () => {
      if (!id) return { deleted: false };
      const files = await listDirectory('images');
      const file = files.find(({ name }) => name.startsWith(`${id}.`));
      if (!file) return { deleted: false };
      await Filesystem.deleteFile({ path: `images/${file.name}`, directory: Directory.Data });
      return { deleted: true };
    }),
  };
  const backupDirectory = 'backups';
  const backupPrefix = 'storyteller-backup-';
  let backupTimer;
  const getBackupInterval = () => Math.max(15, Number(JSON.parse(localStorage.getItem('storyteller:storage.backupIntervalMinutes') || '60')) || 60) * 60_000;
  const getMaxBackups = () => Math.max(1, Math.min(100, Number(JSON.parse(localStorage.getItem('storyteller:storage.maxBackupsToKeep') || '10')) || 10));
  const pruneBackups = async () => {
    let files;
    try { files = (await Filesystem.readdir({ path: backupDirectory, directory: Directory.Data })).files; }
    catch { return; }
    const names = files.map(({ name }) => name).filter((name) => name.startsWith(backupPrefix) && name.endsWith('.json')).sort();
    for (const name of names.slice(0, Math.max(0, names.length + 1 - getMaxBackups()))) {
      await Filesystem.deleteFile({ path: `${backupDirectory}/${name}`, directory: Directory.Data });
    }
  };
  const createBackup = async () => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `${backupPrefix}${stamp}.json`;
    const snapshot = await db.exportToJson('full');
    if (!snapshot.export) throw new Error('SQLite returned no export data');
    await Filesystem.writeFile({ path: `${backupDirectory}/${name}`, data: JSON.stringify(snapshot.export), directory: Directory.Data, recursive: true });
    await pruneBackups();
    localStorage.setItem('storyteller:storage.lastBackupAt', JSON.stringify(Date.now()));
    return `app-data://${backupDirectory}/${name}`;
  };
  const runScheduledBackup = async () => {
    backupTimer = undefined;
    const enabled = JSON.parse(localStorage.getItem('storyteller:storage.backupEnabled') || 'false') === true;
    if (!enabled) return;
    const interval = getBackupInterval();
    const last = Number(JSON.parse(localStorage.getItem('storyteller:storage.lastBackupAt') || '0'));
    if (!last || Date.now() - last >= interval) {
      try { await createBackup(); }
      catch (error) { console.error('Automatic local backup failed', error); }
    }
    scheduleBackup();
  };
  function scheduleBackup() {
    if (backupTimer) clearTimeout(backupTimer);
    if (JSON.parse(localStorage.getItem('storyteller:storage.backupEnabled') || 'false') === true) backupTimer = setTimeout(runScheduledBackup, getBackupInterval());
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void runScheduledBackup(); });
  window.storageAPI = {
    getDefaultBackupDir: async () => 'Storyteller / Application data / backups',
    backupNow: async () => { try { const filePath = await createBackup(); return { success: true, filePath }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; } },
    exportDatabase: async () => {
      try {
        const filePath = await createBackup();
        const { uri } = await Filesystem.getUri({ path: filePath.replace('app-data://', ''), directory: Directory.Data });
        await Share.share({ title: 'Storyteller database backup', files: [uri] });
        return { success: true, filePath };
      } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
    },
  };
  scheduleBackup();
}
