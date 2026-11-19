const { app, BrowserWindow, Menu, shell } = require('electron');
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  autoUpdater = null;
}
const http = require('http');
const fs = require('fs');
const path = require('path');

// A fixed port keeps the page origin stable. Chromium keys localStorage, the Service
// Worker cache and the theme by origin, so the previous random port wiped every
// contract, setting and cached asset on each launch.
const HOST = '127.0.0.1';
const PORT = 47821;

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

function pageUrl() {
  return `http://${HOST}:${serverPort}/index.html`;
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return mainWindow;
  }
  if (!serverPort) return null;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
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
  mainWindow.loadURL(pageUrl());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

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
    createWindow();
  });
}

// A second launch would bind another port and therefore another profile.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (autoUpdater) {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }
    Menu.setApplicationMenu(null);
    startServer();
  });

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
