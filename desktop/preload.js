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
    if (text === null || (text && typeof text.key === 'string' && typeof text.label === 'string'))
      ipcRenderer.send('desktop:contract', text);
  },
  reportTimer: (value) => {
    if (typeof value === 'string') ipcRenderer.send('desktop:timer', value);
  },
  // The shell asks the outcome question when a match ends in the game log.
  onOutcome: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('desktop:outcome', (_event, outcome) => callback(outcome));
  },
  onCompact: (callback) => {
    if (typeof callback === 'function')
      ipcRenderer.on('desktop:compact', (_event, value) => callback(value));
  },
  compactState: () => ipcRenderer.invoke('desktop:compact-state'),
  toggleCompact: () => ipcRenderer.send('desktop:compact-toggle'),
  onOverlay: (callback) => {
    if (typeof callback === 'function')
      ipcRenderer.on('desktop:overlay', (_event, value) => callback(value));
  },
  onOverlayTimer: (callback) => {
    if (typeof callback === 'function')
      ipcRenderer.on('desktop:overlay-timer', (_event, value) => callback(value));
  },
  overlayState: () => ipcRenderer.invoke('desktop:overlay-state'),
  toggleOverlay: () => ipcRenderer.send('desktop:overlay-toggle'),
  setOverlaySettings: (settings) => ipcRenderer.invoke('desktop:overlay-settings', settings),
  // Where the game is installed and what its console log says.
  game: () => ipcRenderer.invoke('desktop:game'),
  gameLog: (count) => ipcRenderer.invoke('desktop:game-log', count),
});
