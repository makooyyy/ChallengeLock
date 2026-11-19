// The desktop shell is testable without Electron: the electron module is replaced by
// a stub, then the local server and the window guards are exercised for real.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));

const opened = [];
const windows = [];
const handlers = {};

class FakeWebContents {
  setWindowOpenHandler(fn) {
    handlers.open = fn;
  }
  on(event, fn) {
    if (event === 'will-navigate') handlers.navigate = fn;
    if (event === 'before-input-event') handlers.input = fn;
  }
  reload() {
    handlers.reloads = (handlers.reloads || 0) + 1;
  }
  toggleDevTools() {}
}

class FakeWindow {
  constructor(options) {
    this.options = options;
    this.webContents = new FakeWebContents();
    this.url = null;
    windows.push(this);
  }
  loadURL(url) {
    this.url = url;
  }
  on() {}
  isDestroyed() {
    return false;
  }
  isMinimized() {
    return false;
  }
  restore() {}
  focus() {}
  static getAllWindows() {
    return windows;
  }
}

const fakeElectron = {
  app: {
    whenReady: () => Promise.resolve(),
    requestSingleInstanceLock: () => true,
    quit: () => assert.fail('a first instance must not quit'),
    on: () => {},
  },
  BrowserWindow: FakeWindow,
  Menu: { setApplicationMenu: () => {} },
  shell: {
    openExternal: async (url) => {
      opened.push(url);
    },
  },
};

const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return fakeElectron;
  if (request === 'electron-updater') throw new Error('not installed');
  return originalLoad.call(this, request, ...rest);
};
const shell = require(path.join(root, 'desktop', 'main.js'));
Module._load = originalLoad;

const request = (pathname, host, port) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method: 'GET', headers: { Host: host } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });

async function listening(timeout = 3000) {
  const started = Date.now();
  while (!shell.server.address()) {
    if (Date.now() - started > timeout) throw new Error('server never started');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return shell.server.address().port;
}

test('desktop shell keeps a stable origin and guards the window', async (t) => {
  const port = await listening();
  t.after(() => shell.server.close());
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(port, shell.PORT, 'the port must be fixed, not random');
  assert.equal(windows.length, 1, 'one window is created on start');
  assert.equal(windows[0].url, `http://127.0.0.1:${shell.PORT}/index.html`);
  assert.ok(windows[0].options.webPreferences.contextIsolation);
  assert.equal(windows[0].options.webPreferences.nodeIntegration, false);

  const page = await request('/index.html', `127.0.0.1:${port}`, port);
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('ChallengeLock'), 'serves the application');

  const rebinding = await request('/index.html', `evil.example:${port}`, port);
  assert.equal(rebinding.status, 403, 'a foreign Host header is rejected');

  const traversal = await request('/../package.json', `127.0.0.1:${port}`, port);
  assert.equal(traversal.status, 403, 'path traversal is rejected');

  assert.deepEqual(handlers.open({ url: 'https://deadlock-api.com/' }), { action: 'deny' });
  assert.deepEqual(opened, ['https://deadlock-api.com/'], 'external links leave the shell');

  let blocked = false;
  handlers.navigate({ preventDefault: () => (blocked = true) }, 'https://example.com/');
  assert.equal(blocked, true, 'navigation away is prevented');

  handlers.input({ preventDefault: () => {} }, { type: 'keyDown', key: 'F5', control: false });
  assert.equal(handlers.reloads, 1, 'F5 reloads the page');
});
