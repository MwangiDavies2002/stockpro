const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stockpro', {
  shareWhatsApp:(authorization,text)=>ipcRenderer.invoke('share:whatsapp',authorization,text),
  request: (request) => ipcRenderer.invoke('api:request', request),
  exportDatabase: (authorization) => ipcRenderer.invoke('backup:export',authorization),
  restoreDatabase: (authorization) => ipcRenderer.invoke('backup:restore',authorization),
});
