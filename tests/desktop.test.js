// The desktop shell is testable without Electron: the electron module is replaced by
// a stub, then the server, the tray, the hotkeys and the window guards are exercised.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));

const state = {
  opened: [],
  windows: [],
  sent: [],
  shortcuts: new Map(),
  ipc: {},
  tray: null,
};

class FakeWebContents {
  constructor() {
    this.handlers = {};
    this.reloads = 0;
  }
  setWindowOpenHandler(fn) {
    this.handlers.open = fn;
  }
  on(event, fn) {
    this.handlers[event] = fn;
  }
  send(channel, payload) {
    state.sent.push({ channel, payload });
  }
  reload() {
    this.reloads++;
  }
  toggleDevTools() {}
}

class FakeWindow {
  constructor(options) {
    this.options = options;
    this.webContents = new FakeWebContents();
    this.handlers = {};
    this.url = null;
    this.bounds = { x: 100, y: 100, width: 1280, height: 820 };
    this.visible = true;
    this.alwaysOnTop = false;
    state.windows.push(this);
  }
  loadURL(url) {
    this.url = url;
  }
  on(event, fn) {
    this.handlers[event] = fn;
  }
  once(event, fn) {
    this.handlers[event] = fn;
  }
  isDestroyed() {
    return false;
  }
  isMinimized() {
    return false;
  }
  isVisible() {
    return this.visible;
  }
  restore() {}
  focus() {}
  show() {
    this.visible = true;
  }
  hide() {
    this.visible = false;
  }
  getBounds() {
    return { ...this.bounds };
  }
  setBounds(bounds) {
    this.bounds = { ...bounds };
  }
  setAlwaysOnTop(value) {
    this.alwaysOnTop = value;
  }
  static getAllWindows() {
    return state.windows;
  }
}

class FakeTray {
  constructor(icon) {
    this.icon = icon;
    this.menu = null;
    this.tooltip = '';
    state.tray = this;
  }
  setToolTip(text) {
    this.tooltip = text;
  }
  setContextMenu(menu) {
    this.menu = menu;
  }
  on() {}
}

const fakeElectron = {
  app: {
    whenReady: () => Promise.resolve(),
    requestSingleInstanceLock: () => true,
    quit: () => assert.fail('a first instance must not quit'),
    on: () => {},
    getPath: () => 'C:/user-data',
    exit: () => assert.fail('a healthy start must not exit'),
  },
  dialog: { showErrorBox: () => {} },
  BrowserWindow: FakeWindow,
  Tray: FakeTray,
  Menu: {
    setApplicationMenu: () => {},
    buildFromTemplate: (template) => ({ items: template }),
  },
  globalShortcut: {
    register: (accelerator, handler) => {
      state.shortcuts.set(accelerator, handler);
      return true;
    },
    unregisterAll: () => state.shortcuts.clear(),
  },
  screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) },
  ipcMain: {
    on: (channel, handler) => {
      state.ipc[channel] = handler;
    },
    handle: (channel, handler) => {
      state.ipcHandlers = state.ipcHandlers || {};
      state.ipcHandlers[channel] = handler;
    },
  },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => false, resize: () => ({ resized: true }) }),
  },
  shell: {
    openExternal: async (url) => {
      state.opened.push(url);
    },
    openPath: async (target) => {
      state.opened.push(target);
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

// One server for all three checks; close it once the file is done.
after(() => shell.server.close());

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

test('the shell serves the app from a stable origin and guards the window', async () => {
  const port = await listening();
  await new Promise((resolve) => setTimeout(resolve, 25));
  const [window] = state.windows;

  assert.equal(port, shell.PORT, 'the port must be fixed, not random');
  assert.equal(state.windows.length, 1, 'one window is created on start');
  assert.equal(window.url, `http://127.0.0.1:${shell.PORT}/index.html`);
  assert.ok(window.options.webPreferences.contextIsolation);
  assert.equal(window.options.webPreferences.nodeIntegration, false);

  const page = await request('/index.html', `127.0.0.1:${port}`, port);
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('ChallengeLock'), 'serves the application');

  const rebinding = await request('/index.html', `evil.example:${port}`, port);
  assert.equal(rebinding.status, 403, 'a foreign Host header is rejected');

  const traversal = await request('/../package.json', `127.0.0.1:${port}`, port);
  assert.equal(traversal.status, 403, 'path traversal is rejected');

  assert.deepEqual(window.webContents.handlers.open({ url: 'https://deadlock-api.com/' }), {
    action: 'deny',
  });
  assert.deepEqual(state.opened, ['https://deadlock-api.com/'], 'external links leave the shell');

  let blocked = false;
  window.webContents.handlers['will-navigate'](
    { preventDefault: () => (blocked = true) },
    'https://example.com/',
  );
  assert.equal(blocked, true, 'navigation away is prevented');

  window.webContents.handlers['before-input-event'](
    { preventDefault: () => {} },
    { type: 'keyDown', key: 'F5', control: false },
  );
  assert.equal(window.webContents.reloads, 1, 'F5 reloads the page');
});

test('closing the window parks the app in the tray instead of quitting', async () => {
  await listening();
  const [window] = state.windows;

  let prevented = false;
  window.handlers.close({ preventDefault: () => (prevented = true) });
  assert.equal(prevented, true, 'close is intercepted');
  assert.equal(window.isVisible(), false, 'the window is hidden, not destroyed');
  assert.ok(state.tray, 'the tray exists');
});

test('the tray and the hotkeys drive the page', async () => {
  await listening();
  const [window] = state.windows;

  assert.deepEqual([...state.shortcuts.keys()].sort(), ['Control+Alt+O', 'Control+Alt+R']);
  assert.ok(state.tray.icon, 'the tray gets an icon');
  assert.equal(state.tray.tooltip, 'ChallengeLock');

  const labels = state.tray.menu.items.map((item) => item.label).filter(Boolean);
  assert.ok(labels.includes('Новый челлендж'), 'tray offers a new contract');
  assert.ok(labels.includes('Поверх игры'), 'tray offers compact mode');
  assert.ok(labels.includes('Выход'), 'tray offers quit');

  state.shortcuts.get('Control+Alt+R')();
  assert.deepEqual(
    state.sent.filter((message) => message.channel === 'desktop:spin').length,
    1,
    'the hotkey asks the page for a contract',
  );

  const compactItem = state.tray.menu.items.find((item) => item.label === 'Поверх игры');
  compactItem.click();
  assert.equal(window.alwaysOnTop, true, 'compact mode stays on top');
  assert.equal(window.bounds.width, 430, 'compact mode shrinks the window');
  assert.equal(window.bounds.x, 1920 - 430 - 24, 'and parks it by the right edge');
  compactItem.click();
  assert.equal(window.alwaysOnTop, false);
  assert.deepEqual(window.bounds, { x: 100, y: 100, width: 1280, height: 820 });

  state.ipc['desktop:contract']({}, 'Abrams · Сложная');
  assert.equal(
    state.tray.tooltip,
    'ChallengeLock — Abrams · Сложная',
    'the tray shows the contract',
  );
});

test('the game probe is reachable from the page', async () => {
  await listening();
  const handlers = state.ipcHandlers || {};
  assert.equal(typeof handlers['desktop:game'], 'function', 'the shell exposes the probe');
  assert.equal(typeof handlers['desktop:game-log'], 'function', 'and the log tail');

  const info = await handlers['desktop:game']();
  assert.ok(Array.isArray(info.candidates), 'candidates are always reported');
  assert.ok('install' in info, 'install is either a path or null');
  const tail = await handlers['desktop:game-log'](5);
  assert.ok(Array.isArray(tail.lines), 'the tail is an array even without a log');
});
