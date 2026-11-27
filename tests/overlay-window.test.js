// Drive the actual overlay IPC handlers without starting Electron or using a real profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

function shell(profile) {
  const handlers = new Map();
  let window;
  class Window extends EventEmitter {
    constructor({ x, y, width, height }) {
      super();
      this.bounds = { x, y, width, height };
      this.webContents = Object.assign(new EventEmitter(), { send() {} });
      window = this;
    }
    isDestroyed() {
      return false;
    }
    isVisible() {
      return true;
    }
    getBounds() {
      return { ...this.bounds };
    }
    setBounds(b) {
      this.bounds = { ...b };
      this.emit('moved');
      this.emit('resized');
    }
    setOpacity() {}
    hide() {}
  }
  const electron = {
    app: {
      getPath: () => profile,
      disableHardwareAcceleration() {},
      on() {},
      requestSingleInstanceLock: () => true,
      whenReady: () => new Promise(() => {}),
    },
    ipcMain: { on: (k, f) => handlers.set(k, f), handle: (k, f) => handlers.set(k, f) },
    BrowserWindow: Window,
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 800 } }) },
  };
  const entry = new URL('../desktop/main.js', import.meta.url);
  const req = createRequire(entry);
  vm.runInNewContext(readFileSync(entry, 'utf8'), {
    require: (k) => (k === 'electron' ? electron : k === 'electron-updater' ? {} : req(k)),
    process: { argv: [], versions: { electron: 'test' }, env: {}, on() {} },
    module: { exports: {} },
    __dirname: path.dirname(fileURLToPath(entry)),
    console,
  });
  const call = (k, v, sender) => handlers.get('desktop:overlay-' + k)({ sender }, v);
  call('settings', { mode: 'manual' });
  call('toggle');
  return {
    window,
    settings: (v) => call('settings', v),
    fit: (h) => call('fit', h, window.webContents),
    state: () => call('state'),
    spoof: (h) => call('fit', h, {}),
  };
}

test('intrinsic height preserves presets, moved positions, and native/manual sizes', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cl-overlay-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = shell(dir);
  a.settings({ position: 'bottom-right', resetPosition: true });
  a.fit(190);
  const bottom = a.window.bounds.y + 190;
  a.fit(260);
  assert.equal(a.window.bounds.y + 260, bottom);
  assert.equal(a.state().position, 'bottom-right');
  a.spoof(50);
  assert.equal(a.window.bounds.height, 260);
  a.window.setBounds({ ...a.window.bounds, x: 70, y: 90 });
  a.fit(145);
  assert.deepEqual(a.window.bounds, { x: 70, y: 90, width: 360, height: 145 });
  a.fit(5000);
  assert.ok(a.window.bounds.height <= 800 && a.window.bounds.y >= 0);
  a.fit(145);
  assert.equal(a.window.bounds.y, 90);
  const b = shell(dir);
  b.fit(170);
  assert.deepEqual(b.window.bounds, { x: 70, y: 90, width: 360, height: 170 });
  b.window.setBounds({ ...b.window.bounds, width: 390, height: 245 });
  b.fit(200);
  assert.equal(b.window.bounds.height, 245);
  b.settings({ width: 430, height: 320 });
  b.fit(460);
  assert.deepEqual(b.window.bounds, { x: 70, y: 90, width: 430, height: 320 });
  b.settings({ position: 'top-right', resetPosition: true, width: null, height: null });
  b.fit(180);
  assert.equal(b.window.bounds.height, 180);
  assert.equal(b.state().position, 'top-right');
  writeFileSync(
    path.join(dir, 'overlay.json'),
    JSON.stringify({ bounds: { x: 40, y: 50, width: 420, height: 310 }, position: 'custom' }),
  );
  const legacy = shell(dir);
  legacy.fit(150);
  assert.deepEqual(legacy.window.bounds, { x: 40, y: 50, width: 420, height: 310 });
});
