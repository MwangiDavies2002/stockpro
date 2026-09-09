const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { openDatabase, apiRequest } = require('./db');

let db;
let backupTimer;
function createWindow() { const win = new BrowserWindow({ width: 1440, height: 900, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } }); win.loadFile(path.join(__dirname, '..', 'bar-inventory-system', 'out', 'index.html')); }
app.whenReady().then(() => { db = openDatabase(app.getPath('userData')); ipcMain.handle('api:request', (_event, request) => apiRequest(db, request)); ipcMain.handle('backup:export', async () => { const target = await dialog.showSaveDialog({ defaultPath: 'stockpro-backup.sqlite' }); if (target.canceled || !target.filePath) return null; db.pragma('wal_checkpoint(TRUNCATE)'); fs.copyFileSync(path.join(app.getPath('userData'), 'data', 'stockpro.sqlite'), target.filePath); return target.filePath; });
  const backupDir = path.join(app.getPath('userData'), 'backups'); fs.mkdirSync(backupDir, { recursive: true }); backupTimer = setInterval(() => { try { db.pragma('wal_checkpoint(TRUNCATE)'); fs.copyFileSync(path.join(app.getPath('userData'), 'data', 'stockpro.sqlite'), path.join(backupDir, `stockpro-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`)); } catch (error) { console.error('Automatic backup failed:', error.message); } }, 6 * 60 * 60 * 1000); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
