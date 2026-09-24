const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeWidget: () => ipcRenderer.send('close-widget')
});
