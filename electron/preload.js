const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stockpro', {
  request: (request) => ipcRenderer.invoke('api:request', request),
  exportDatabase: (authorization) => ipcRenderer.invoke('backup:export',authorization),
  restoreDatabase: (authorization) => ipcRenderer.invoke('backup:restore',authorization),
});
