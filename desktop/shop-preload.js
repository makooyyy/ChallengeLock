const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shopControls', {
  act: (action, token) => ipcRenderer.send('shop:act', action, token),
  hover: (active) => ipcRenderer.send('shop:hover', active === true),
});
