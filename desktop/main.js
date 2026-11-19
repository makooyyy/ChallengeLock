const { app, BrowserWindow, Menu } = require('electron');
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  autoUpdater = null;
}
const http = require('http');
const fs = require('fs');
const path = require('path');

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
    res.end(data);
  });
});

let mainWindow = null;
let serverPort = null;

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
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/index.html`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

app.whenReady().then(() => {
  if (autoUpdater) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
  Menu.setApplicationMenu(null);
  // The local HTTP server is started exactly once; window recreation never re-listens.
  server.listen(0, '127.0.0.1', () => {
    serverPort = server.address().port;
    createWindow();
  });
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
