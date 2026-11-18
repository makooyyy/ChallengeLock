const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('challengeLockDesktop', {
  platform: process.platform,
  isDesktop: true,
});
