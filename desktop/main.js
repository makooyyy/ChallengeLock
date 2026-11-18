const { app, BrowserWindow, Menu } = require('electron');
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
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
    mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });
});

app.on('window-all-closed', () => {
  server.close();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) app.whenReady();
});
