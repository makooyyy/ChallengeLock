const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('challengeLockDesktop', {
  platform: process.platform,
  isDesktop: true,
  // Global hotkey asks the page for a new contract.
  onSpin: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('desktop:spin', () => callback());
  },
  // Lets the tray tooltip show the contract while the window is hidden.
  reportContract: (text) => {
    if (typeof text === 'string') ipcRenderer.send('desktop:contract', text);
  },
  // Where the game is installed and what its console log says.
  game: () => ipcRenderer.invoke('desktop:game'),
  gameLog: (count) => ipcRenderer.invoke('desktop:game-log', count),
});
