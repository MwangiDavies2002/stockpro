const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stockpro', {
  request: (request) => ipcRenderer.invoke('api:request', request),
  exportDatabase: () => ipcRenderer.invoke('backup:export'),
});
