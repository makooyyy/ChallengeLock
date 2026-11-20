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
const logWatch = require('./log-watch.js');

// The interface is 2D, so software compositing costs nothing and removes the GPU
// process. On some Windows setups that process dies at startup with
// "GPU process isn't usable. Goodbye.", which kills the app before any window exists.
// Run with --enable-gpu to opt back in.
if (!process.argv.includes('--enable-gpu')) app.disableHardwareAcceleration();

// Windows GUI builds do not attach the main-process console to the terminal, so the
// startup trail goes to a file next to the profile. Without it "nothing happens" is
// the only symptom a user can report.
const LOG_NAME = 'challenge-lock.log';
const LOG_LIMIT = 512 * 1024;
let logPathCache;

function logPath() {
  if (logPathCache !== undefined) return logPathCache;
  try {
    logPathCache = path.join(app.getPath('userData'), LOG_NAME);
  } catch {
    logPathCache = null;
  }
  return logPathCache;
}

function log(...args) {
  const line = new Date().toISOString() + ' ' + args.map((value) => String(value)).join(' ');
  const file = logPath();
  // Plain Node (tests) must not touch the profile directory.
  if (file && process.versions.electron) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size > LOG_LIMIT) fs.writeFileSync(file, '');
      fs.appendFileSync(file, line + '\n');
    } catch {
      // Logging must never break the app.
    }
  }
  console.log(line);
}

// A fixed port keeps the page origin stable. Chromium keys localStorage, the Service
// Worker cache and the theme by origin, so the previous random port wiped every
// contract, setting and cached asset on each launch. CHALLENGELOCK_PORT is an escape
// hatch for tests and for a machine where 47821 is taken by something permanent.
const HOST = '127.0.0.1';
const PORT = Number(process.env.CHALLENGELOCK_PORT) || 47821;

// Compact mode: a small always-on-top window you can park next to the game.
const COMPACT = { width: 430, height: 580, margin: 24 };
const OVERLAY = { width: 360, height: 440, margin: 16 };
const SPIN_ACCELERATOR = 'Control+Alt+R';
const COMPACT_ACCELERATOR = 'Control+Alt+O';
const OVERLAY_ACCELERATOR = 'Control+Alt+P';
const OVERLAY_CLICKTHROUGH_ACCELERATOR = 'Control+Alt+Space';

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
let overlayWindow = null;
let serverPort = null;
let tray = null;
let quitting = false;
let compact = false;
let normalBounds = null;
// Last successful probe, so the About dialog can name the log without re-scanning.
let probeCache = { install: null };

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
    frame: false,
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
  log('window created for ' + pageUrl());
  // A restored or off-screen window would look like a silent start: force it once.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      log('window stayed hidden for 3s, showing it');
      mainWindow.show();
    }
  }, 3000).unref?.();
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
  mainWindow.webContents.send('desktop:compact', compact);
  refreshTrayMenu();
  return compact;
}

const OVERLAY_SETTINGS_FILE = 'overlay.json';
const DEFAULT_OVERLAY_SETTINGS = {
  visible: false,
  opacity: 0.92,
  clickThrough: false,
  autoShow: true,
  autoHide: false,
  position: 'top-right',
  bounds: null,
  width: null,
  height: null,
  showHero: true,
  showConditions: true,
  showTimer: true,
  showStatus: true,
  showBuild: true,
  lockPosition: false,
};

function overlaySettingsPath() {
  try {
    return path.join(app.getPath('userData'), OVERLAY_SETTINGS_FILE);
  } catch {
    return null;
  }
}

function loadOverlaySettings() {
  const file = overlaySettingsPath();
  if (!file || !fs.existsSync(file)) return { ...DEFAULT_OVERLAY_SETTINGS };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...DEFAULT_OVERLAY_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_OVERLAY_SETTINGS };
  }
}

function saveOverlaySettings(settings) {
  const file = overlaySettingsPath();
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  } catch {
    // Settings are optional; the overlay still works with defaults.
  }
}

let overlaySettings = loadOverlaySettings();
let overlayContract = null;
let overlayBuild = null;

function overlayBounds(position = overlaySettings.position) {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.max(260, Number(overlaySettings.width) || OVERLAY.width);
  const height = Math.max(160, Number(overlaySettings.height) || OVERLAY.height);
  const margin = OVERLAY.margin;
  const positions = {
    'top-left': { x: area.x + margin, y: area.y + margin },
    'top-right': { x: area.x + area.width - width - margin, y: area.y + margin },
    'bottom-left': { x: area.x + margin, y: area.y + area.height - height - margin },
    'bottom-right': {
      x: area.x + area.width - width - margin,
      y: area.y + area.height - height - margin,
    },
    center: {
      x: area.x + Math.round((area.width - width) / 2),
      y: area.y + Math.round((area.height - height) / 2),
    },
  };
  return { ...(positions[position] || positions['top-right']), width, height };
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.showInactive?.();
    return overlayWindow;
  }
  const bounds = overlaySettings.bounds || overlayBounds(overlaySettings.position);
  overlayWindow = new BrowserWindow({
    ...bounds,
    show: false,
    minWidth: 260,
    minHeight: 160,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'ChallengeLock Overlay',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWindow.setAlwaysOnTop?.(true, 'screen-saver');
  if (typeof overlayWindow.setOpacity === 'function')
    overlayWindow.setOpacity(Math.min(1, Math.max(0.35, Number(overlaySettings.opacity) || 0.92)));
  const saveBounds = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    overlaySettings.bounds = overlayWindow.getBounds();
    overlaySettings.position = 'custom';
    saveOverlaySettings(overlaySettings);
  };
  if (typeof overlayWindow.on === 'function') {
    overlayWindow.on('moved', saveBounds);
    overlayWindow.on('resized', saveBounds);
  }
  if (typeof overlayWindow.loadFile === 'function')
    overlayWindow.loadFile(path.join(__dirname, 'overlay.html')).catch((error) => {
      log('overlay failed to load: ' + String((error && error.message) || error));
    });
  overlayWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    log('overlay did-fail-load ' + code + ' ' + description + ' ' + url);
  });
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
  {
    overlayWindow.webContents.on('did-finish-load', () => {
      if (overlayWindow && !overlayWindow.isDestroyed())
        overlayWindow.webContents.send('desktop:overlay', {
          contract: overlayContract,
          build: overlayBuild,
          settings: overlaySettings,
        });
    });
  }
  applyOverlayClickThrough();
  return overlayWindow;
}

function applyOverlayClickThrough() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (typeof overlayWindow.setIgnoreMouseEvents === 'function')
    overlayWindow.setIgnoreMouseEvents(Boolean(overlaySettings.clickThrough), { forward: true });
}

function showOverlay() {
  if (!process.versions.electron) return;
  const win = createOverlayWindow();
  if (!win) return;
  win.showInactive?.();
  win.webContents.send('desktop:overlay', {
    contract: overlayContract,
    build: overlayBuild,
    settings: overlaySettings,
  });
}

function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
}

function toggleOverlay() {
  if (!process.versions.electron) return overlaySettings.visible;
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    hideOverlay();
    overlaySettings.visible = false;
  } else {
    overlaySettings.visible = true;
    showOverlay();
  }
  saveOverlaySettings(overlaySettings);
  return overlaySettings.visible;
}

function setOverlayContract(contract) {
  overlayContract = contract && typeof contract.key === 'string' ? contract : null;
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())
    overlayWindow.webContents.send('desktop:overlay', {
      contract: overlayContract,
      build: overlayBuild,
      settings: overlaySettings,
    });
}

function openDataFolder() {
  Promise.resolve(shell.openPath(app.getPath('userData'))).catch(() => {});
}

function aboutDialog() {
  const lines = [
    'Версия: ' + app.getVersion(),
    'Electron: ' + (process.versions.electron || '—'),
    'Chromium: ' + (process.versions.chrome || '—'),
    'Порт: ' + (serverPort || '—'),
    'Данные: ' + app.getPath('userData'),
    'Лог игры: ' + (game.logPathFor(probeCache.install) || 'не найден'),
  ];
  dialog.showMessageBox({
    type: 'info',
    title: 'ChallengeLock',
    message: 'ChallengeLock',
    detail: lines.join('\n'),
    buttons: ['Ок'],
  });
}

function loginItemEnabled() {
  try {
    return Boolean(app.getLoginItemSettings().openAtLogin);
  } catch {
    return false;
  }
}

function toggleLoginItem() {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: 'ChallengeLock',
      message: 'Автозапуск доступен только в собранной версии приложения.',
      buttons: ['Ок'],
    });
    return;
  }
  app.setLoginItemSettings({ openAtLogin: !loginItemEnabled() });
  refreshTrayMenu();
}

async function checkUpdates() {
  if (!autoUpdater) {
    dialog.showMessageBox({
      type: 'info',
      title: 'ChallengeLock',
      message: 'Проверка обновлений работает только в собранной версии.',
      buttons: ['Ок'],
    });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    const latest = result && result.updateInfo && result.updateInfo.version;
    const newer = latest && game.compareVersions(latest, app.getVersion()) > 0;
    dialog.showMessageBox({
      type: 'info',
      title: 'ChallengeLock',
      message: newer
        ? 'Скачивается версия ' + latest + '. Она установится при выходе.'
        : 'У вас последняя версия: ' + app.getVersion(),
      buttons: ['Ок'],
    });
  } catch (error) {
    dialog.showErrorBox(
      'Не удалось проверить обновления',
      String((error && error.message) || error),
    );
  }
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
    {
      label: 'Оверлей',
      type: 'checkbox',
      checked: Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()),
      accelerator: OVERLAY_ACCELERATOR,
      click: () => toggleOverlay(),
    },
    { type: 'separator' },
    { label: 'Открыть папку данных', click: openDataFolder },
    {
      label: 'Запускать с Windows',
      type: 'checkbox',
      checked: loginItemEnabled(),
      click: toggleLoginItem,
    },
    { label: 'Проверить обновления', click: checkUpdates },
    { label: 'О приложении', click: aboutDialog },
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
    log('tray icon is missing, running without a tray');
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
  if (!globalShortcut.register(OVERLAY_ACCELERATOR, () => toggleOverlay()))
    failed.push(OVERLAY_ACCELERATOR);
  if (
    !globalShortcut.register(OVERLAY_CLICKTHROUGH_ACCELERATOR, () => {
      overlaySettings.clickThrough = !overlaySettings.clickThrough;
      saveOverlaySettings(overlaySettings);
      applyOverlayClickThrough();
    })
  )
    failed.push(OVERLAY_CLICKTHROUGH_ACCELERATOR);
  if (failed.length) log('hotkeys already taken: ' + failed.join(', '));
  else
    log(
      'hotkeys ' +
        SPIN_ACCELERATOR +
        ', ' +
        COMPACT_ACCELERATOR +
        ', ' +
        OVERLAY_ACCELERATOR +
        ' and ' +
        OVERLAY_CLICKTHROUGH_ACCELERATOR,
    );
}

// The renderer reports what it rolled, so the tray tooltip shows the current contract
// while the window is hidden behind the game.
let contractActive = false;
let activeContract = null;
let matchContract = null;
ipcMain.on('desktop:contract', (_event, text) => {
  const reportedContract =
    text && typeof text.key === 'string' && typeof text.label === 'string'
      ? {
          key: text.key,
          label: text.label,
          hero: text.hero,
          difficulty: text.difficulty,
          conditions: Array.isArray(text.conditions) ? text.conditions : [],
          mode: text.mode,
          timer: text.timer,
          outcome: text.outcome,
          lang: text.lang,
        }
      : null;
  activeContract =
    reportedContract && !['done', 'fail'].includes(reportedContract.outcome)
      ? reportedContract
      : null;
  contractActive = !!activeContract;
  if (matchContract && matchContract.key !== activeContract?.key) matchContract = null;
  if (tray && contractActive)
    tray.setToolTip('ChallengeLock — ' + activeContract.label.slice(0, 120));
  else if (tray && !contractActive) tray.setToolTip('ChallengeLock');
  setOverlayContract(reportedContract);
});

// Match watching: the game rewrites console.log on every launch, so the reader keeps
// an offset and resets it when the file shrinks.
const logWatcher = {
  timer: null,
  file: null,
  reader: null,
  tracker: logWatch.createTracker(),
  lastLookup: 0,
};

function promptMatchResult(contract) {
  if (!contract || activeContract?.key !== contract.key) {
    log('match ended, but no contract is active');
    return;
  }
  const answer = dialog.showMessageBoxSync({
    type: 'question',
    title: 'ChallengeLock',
    message: 'Матч закончился. Засчитать контракт?\n' + contract.label,
    buttons: ['Выполнено', 'Провал', 'Позже'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (answer === 2) {
    log('match ended, the player chose to decide later');
    return;
  }
  const outcome = answer === 1 ? 'fail' : 'done';
  log('match ended, sending outcome ' + outcome);
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('desktop:outcome', { key: contract.key, outcome });
  showWindow();
}

function watchTick() {
  const now = Date.now();
  if (!logWatcher.file || !fs.existsSync(logWatcher.file)) {
    // Look the install up again at most every 30 seconds: the game may appear later.
    if (now - logWatcher.lastLookup < 30000) return;
    logWatcher.lastLookup = now;
    probeGame()
      .then((info) => {
        if (info.log && info.log.exists) {
          logWatcher.file = info.log.path;
          logWatcher.reader = logWatch.createLogReader(info.log.path);
          logWatcher.reader();
          logWatcher.tracker = logWatch.createTracker();
          matchContract = null;
          log('watching the game log: ' + info.log.path);
        }
      })
      .catch(() => {});
    return;
  }
  let batch;
  try {
    batch = logWatcher.reader();
  } catch {
    logWatcher.file = null;
    matchContract = null;
    return;
  }
  if (batch.reset) {
    logWatcher.tracker = logWatch.createTracker();
    matchContract = null;
  }
  for (const line of batch.lines) {
    const event = logWatch.trackLine(logWatcher.tracker, line);
    if (!event) continue;
    if (event.type === 'start') {
      matchContract = activeContract ? { ...activeContract } : null;
      if (overlaySettings.autoShow) showOverlay();
      log('match started');
    } else if (event.type === 'end') {
      log('match ended in state ' + event.state);
      const contract = matchContract;
      matchContract = null;
      promptMatchResult(contract);
      if (overlaySettings.autoHide) {
        setTimeout(() => {
          if (overlayWindow && !overlayWindow.isDestroyed()) hideOverlay();
        }, 10000).unref?.();
      }
    } else log('unrecognised game state after GameInProgress: ' + event.state);
  }
}

function startMatchWatch() {
  if (logWatcher.timer) return;
  logWatcher.timer = setInterval(watchTick, 2000);
  logWatcher.timer.unref?.();
}

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
  probeCache = { install };
  return {
    steamPath,
    libraries,
    candidates,
    install,
    log: game.describeLog(fs, game.logPathFor(install)),
  };
}

ipcMain.handle('desktop:app-version', () => app.getVersion());
ipcMain.handle('desktop:compact-state', () => compact);
ipcMain.on('desktop:compact-toggle', () => toggleCompact());
ipcMain.on('desktop:window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});
ipcMain.on('desktop:window-maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('desktop:window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});
ipcMain.handle('desktop:window-is-maximized', () =>
  Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized()),
);
ipcMain.handle('desktop:overlay-state', () => ({
  ...overlaySettings,
  contract: overlayContract,
  build: overlayBuild,
}));
ipcMain.on('desktop:overlay-toggle', () => toggleOverlay());
ipcMain.on('desktop:timer', (_event, value) => {
  if (overlayContract) overlayContract.timer = value;
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())
    overlayWindow.webContents.send('desktop:overlay-timer', value);
});
ipcMain.on('desktop:build', (_event, build) => {
  overlayBuild = build && typeof build === 'object' ? build : null;
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())
    overlayWindow.webContents.send('desktop:overlay', {
      contract: overlayContract,
      build: overlayBuild,
      settings: overlaySettings,
    });
});
ipcMain.handle('desktop:overlay-settings', (_event, settings) => {
  const previousBounds = overlaySettings.bounds;
  overlaySettings = { ...overlaySettings, ...settings };
  if (
    !settings.resetPosition &&
    previousBounds &&
    (Number.isFinite(settings.width) || Number.isFinite(settings.height))
  ) {
    overlaySettings.bounds = {
      ...previousBounds,
      width: Math.max(260, Number(settings.width) || previousBounds.width),
      height: Math.max(160, Number(settings.height) || previousBounds.height),
    };
  }
  if (settings.resetPosition) overlaySettings.bounds = null;
  delete overlaySettings.resetPosition;
  if (Number.isFinite(settings.width)) overlaySettings.width = settings.width;
  if (Number.isFinite(settings.height)) overlaySettings.height = settings.height;
  saveOverlaySettings(overlaySettings);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setOpacity(Math.min(1, Math.max(0.35, Number(overlaySettings.opacity) || 0.92)));
    applyOverlayClickThrough();
    if (typeof overlayWindow.setBounds === 'function') {
      const bounds =
        overlaySettings.bounds || overlayBounds(overlaySettings.position || 'top-right');
      overlayWindow.setBounds(bounds);
    }
    overlayWindow.webContents.send('desktop:overlay', {
      contract: overlayContract,
      build: overlayBuild,
      settings: overlaySettings,
    });
  }
  return overlaySettings;
});
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
        log(
          'port ' +
            PORT +
            ' is busy, using ' +
            serverPort +
            ' instead (this run starts with an empty profile)',
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
    log('serving the app on http://' + HOST + ':' + PORT);
    createWindow();
  });
}

// A failed start used to show nothing at all: just a process that never opened a
// window. A native error box is the only thing a user can report back.
function reportFatal(error) {
  const text = String((error && (error.stack || error.message)) || error || 'unknown error');
  log('fatal: ' + text);
  try {
    dialog.showErrorBox('ChallengeLock не смог запуститься', text);
  } catch {
    // The dialog is the last resort; the log file already has the text.
  }
  app.exit(1);
}

if (process.versions.electron) {
  process.on('uncaughtException', reportFatal);
  process.on('unhandledRejection', (reason) => reportFatal(reason));
}

// A second launch would bind another port and therefore another profile. It also used
// to exit silently, which reads exactly like "the app does not start".
if (!app.requestSingleInstanceLock()) {
  log('another instance holds the profile lock: focusing it and exiting');
  app
    .whenReady()
    .then(() =>
      dialog.showMessageBox({
        type: 'info',
        title: 'ChallengeLock',
        message: 'Приложение уже запущено.',
        detail:
          'Окно должно быть на панели задач или в трее рядом с часами (иконка может быть в скрытых значках). Если окна нет — завершите все процессы electron.exe и запустите снова.',
        buttons: ['Ок'],
      }),
    )
    .catch(() => {})
    .finally(() => app.quit());
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    try {
      log('ready');
      if (autoUpdater) {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.checkForUpdatesAndNotify().catch(() => {});
      }
      Menu.setApplicationMenu(null);
      startServer();
      createTray();
      registerShortcuts();
      startMatchWatch();
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
module.exports = { server, pageUrl, PORT, watchTick, logWatcher };
