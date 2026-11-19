const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  shell,
  screen,
  ipcMain,
  nativeImage,
  dialog,
} = require('electron');
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  autoUpdater = null;
}
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const game = require('./game.js');

// A fixed port keeps the page origin stable. Chromium keys localStorage, the Service
// Worker cache and the theme by origin, so the previous random port wiped every
// contract, setting and cached asset on each launch.
const HOST = '127.0.0.1';
const PORT = 47821;

// Compact mode: a small always-on-top window you can park next to the game.
const COMPACT = { width: 430, height: 580, margin: 24 };
const SPIN_ACCELERATOR = 'Control+Alt+R';
const COMPACT_ACCELERATOR = 'Control+Alt+O';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function webRoot() {
  const local = path.join(__dirname, 'web');
  if (fs.existsSync(path.join(local, 'index.html'))) return local;
  const dev = path.join(__dirname, '..');
  if (fs.existsSync(path.join(dev, 'index.html'))) return dev;
  return path.join(process.resourcesPath, 'app', 'web');
}

const root = webRoot();
const server = http.createServer((req, res) => {
  // Only our own page may talk to this server: this blocks DNS rebinding, where a
  // hostile site resolves its own hostname to 127.0.0.1 and reads the app's files.
  const expectedHost = HOST + ':' + (server.address()?.port ?? '');
  if (req.headers.host !== expectedHost) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  if (process.platform === 'win32' && urlPath.includes('\\')) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  const filePath = path.resolve(root, '.' + urlPath);
  const relative = path.relative(root, filePath);
  // prevent path traversal and sibling-directory prefix matches
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

let mainWindow = null;
let serverPort = null;
let tray = null;
let quitting = false;
let compact = false;
let normalBounds = null;

function pageUrl() {
  return `http://${HOST}:${serverPort}/index.html`;
}

function trayIcon() {
  const file = path.join(root, 'assets', 'icon-192.png');
  if (!fs.existsSync(file)) return null;
  const image = nativeImage.createFromPath(file);
  return image.isEmpty() ? null : image.resize({ width: 16, height: 16 });
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  if (!serverPort) return null;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 320,
    title: 'ChallengeLock',
    backgroundColor: '#101217',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const origin = `http://${HOST}:${serverPort}/`;
  // External links belong in the system browser: a menu-less child window showing
  // deadlock-api.com used to strand the player with no way back.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(origin)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
  });
  // The application menu is gone, which also removed reload and devtools shortcuts.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    if (key === 'f5' || (input.control && key === 'r')) {
      mainWindow.webContents.reload();
      event.preventDefault();
    } else if (key === 'f12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  // Closing the window parks the app in the tray instead of killing it, so the
  // hotkey keeps working while the game is in the foreground. Without a tray there
  // would be no way back, so the close must really close.
  mainWindow.on('close', (event) => {
    if (quitting || !tray) return;
    event.preventDefault();
    mainWindow.hide();
    refreshTrayMenu();
  });
  // Show only when the page is ready: no white flash, and a window that is
  // guaranteed to be visible even if something hid it earlier.
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadURL(pageUrl());
  return mainWindow;
}

function spinFromDesktop() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.webContents.send('desktop:spin');
  return true;
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return createWindow();
  mainWindow.show();
  mainWindow.focus();
  refreshTrayMenu();
  return mainWindow;
}

function toggleCompact() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  compact = !compact;
  if (compact) {
    normalBounds = mainWindow.getBounds();
    const area = screen.getPrimaryDisplay().workArea;
    const width = Math.min(COMPACT.width, area.width);
    const height = Math.min(COMPACT.height, area.height);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setBounds({
      x: area.x + area.width - width - COMPACT.margin,
      y: area.y + COMPACT.margin,
      width,
      height,
    });
  } else {
    mainWindow.setAlwaysOnTop(false);
    if (normalBounds) mainWindow.setBounds(normalBounds);
  }
  mainWindow.show();
  mainWindow.focus();
  refreshTrayMenu();
  return compact;
}

function openDataFolder() {
  Promise.resolve(shell.openPath(app.getPath('userData'))).catch(() => {});
}

function checkUpdates() {
  if (autoUpdater) autoUpdater.checkForUpdates().catch(() => {});
}

function buildTrayMenu() {
  const visible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
  return Menu.buildFromTemplate([
    {
      label: visible ? 'Скрыть окно' : 'Показать окно',
      click: () => (visible ? mainWindow.hide() : showWindow()),
    },
    {
      label: 'Новый челлендж',
      accelerator: SPIN_ACCELERATOR,
      click: () => showWindow() && spinFromDesktop(),
    },
    {
      label: 'Поверх игры',
      type: 'checkbox',
      checked: compact,
      accelerator: COMPACT_ACCELERATOR,
      click: () => toggleCompact(),
    },
    { type: 'separator' },
    { label: 'Открыть папку данных', click: openDataFolder },
    { label: 'Проверить обновления', click: checkUpdates },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  const icon = trayIcon();
  if (!icon) {
    console.warn('ChallengeLock: tray icon is missing, running without a tray');
    return null;
  }
  tray = new Tray(icon);
  tray.setToolTip('ChallengeLock');
  refreshTrayMenu();
  tray.on('click', () => (mainWindow && mainWindow.isVisible() ? mainWindow.hide() : showWindow()));
  return tray;
}

function registerShortcuts() {
  const failed = [];
  if (!globalShortcut.register(SPIN_ACCELERATOR, () => spinFromDesktop()))
    failed.push(SPIN_ACCELERATOR);
  if (!globalShortcut.register(COMPACT_ACCELERATOR, () => toggleCompact()))
    failed.push(COMPACT_ACCELERATOR);
  if (failed.length) console.warn('ChallengeLock: hotkeys already taken: %s', failed.join(', '));
  else console.log('ChallengeLock: hotkeys %s and %s', SPIN_ACCELERATOR, COMPACT_ACCELERATOR);
}

// The renderer reports what it rolled, so the tray tooltip shows the current contract
// while the window is hidden behind the game.
ipcMain.on('desktop:contract', (_event, text) => {
  if (tray && typeof text === 'string') tray.setToolTip('ChallengeLock — ' + text.slice(0, 120));
});

const GAME_LOG_TAIL_BYTES = 64 * 1024;

function readTextFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

// The last block is enough for a preview and keeps a multi-megabyte log cheap.
function readTail(file, bytes = GAME_LOG_TAIL_BYTES) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function steamPathFromRegistry() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      execFile(
        'reg',
        ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
        { windowsHide: true },
        (error, stdout) => resolve(error ? null : game.decodeRegPath(stdout)),
      );
    } catch {
      // Some environments refuse to spawn at all: the probe just finds no Steam.
      resolve(null);
    }
  });
}

async function probeGame() {
  const steamPath = await steamPathFromRegistry();
  const libraries = steamPath
    ? game.parseLibraryFolders(
        readTextFile(path.join(steamPath, 'steamapps', 'libraryfolders.vdf')),
      )
    : [];
  const candidates = game.candidateInstalls(steamPath, libraries);
  const install = game.findInstall((directory) => fs.existsSync(directory), candidates);
  return {
    steamPath,
    libraries,
    candidates,
    install,
    log: game.describeLog(fs, game.logPathFor(install)),
  };
}

ipcMain.handle('desktop:game', async () => {
  try {
    return await probeGame();
  } catch (error) {
    return {
      error: String((error && error.message) || error),
      candidates: [],
      install: null,
      log: { exists: false, path: null },
    };
  }
});

ipcMain.handle('desktop:game-log', async (_event, count) => {
  try {
    const info = await probeGame();
    if (!info.log || !info.log.exists) return { lines: [], log: info.log };
    const wanted = Math.min(Math.max(Number(count) || 40, 1), 200);
    return { lines: game.tailLines(readTail(info.log.path), wanted), log: info.log };
  } catch (error) {
    return { lines: [], error: String((error && error.message) || error) };
  }
});

// The fixed port is the normal path. If another process already holds it, fall back
// to a random one: the app still works, but that run starts with an empty profile.
function startServer() {
  const fallback = () => {
    server.close(() => {
      server.listen(0, HOST, () => {
        serverPort = server.address().port;
        console.warn(
          'ChallengeLock: port %d is busy, using %d instead (data will not persist).',
          PORT,
          serverPort,
        );
        createWindow();
      });
    });
  };
  server.once('error', (error) => {
    if (error.code !== 'EADDRINUSE') throw error;
    fallback();
  });
  server.listen(PORT, HOST, () => {
    serverPort = PORT;
    console.log('ChallengeLock: serving the app on http://%s:%d', HOST, PORT);
    createWindow();
  });
}

// A failed start used to show nothing at all: just a process that never opened a
// window. A native error box is the only thing a user can report back.
function reportFatal(error) {
  const text = String((error && (error.stack || error.message)) || error || 'unknown error');
  try {
    dialog.showErrorBox('ChallengeLock не смог запуститься', text);
  } catch {
    console.error(text);
  }
  app.exit(1);
}

if (process.versions.electron) {
  process.on('uncaughtException', reportFatal);
  process.on('unhandledRejection', (reason) => reportFatal(reason));
}

// A second launch would bind another port and therefore another profile.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    try {
      if (autoUpdater) {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.checkForUpdatesAndNotify().catch(() => {});
      }
      Menu.setApplicationMenu(null);
      startServer();
      createTray();
      registerShortcuts();
    } catch (error) {
      reportFatal(error);
    }
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());

  app.on('window-all-closed', () => {
    // Windows/Linux: quit as before. macOS keeps the app (and the single server)
    // alive so the dock icon can re-open a window through `activate`.
    if (process.platform !== 'darwin') {
      server.close();
      app.quit();
    }
  });

  app.on('activate', () => {
    // macOS: re-create the window without calling app.whenReady() again.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// Exposed for tests/desktop.test.js, which drives the shell without Electron.
module.exports = { server, pageUrl, PORT };
