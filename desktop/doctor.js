// Diagnoses a desktop build that refuses to start, without opening a window.
// Run from the desktop folder: npm run doctor
const fs = require('fs');
const net = require('net');
const path = require('path');

const PORT = 47821;
const results = [];
const pass = (name, detail) => results.push({ ok: true, name, detail });
const fail = (name, detail, fix) => results.push({ ok: false, name, detail, fix });

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 22) pass('Node.js', process.versions.node);
  else fail('Node.js', process.versions.node + ' — нужен 22 или новее', 'установите Node.js 22+');
}

function checkElectron() {
  const pkgFile = path.join(__dirname, 'node_modules', 'electron', 'package.json');
  if (!fs.existsSync(pkgFile)) {
    fail('Electron', 'модуль не установлен', 'cd desktop && npm install');
    return;
  }
  const installed = readJson(pkgFile).version;
  const wanted = readJson(path.join(__dirname, 'package.json')).devDependencies.electron;
  pass('Electron', installed + ' (в package.json ' + wanted + ')');

  let binary = null;
  try {
    binary = require('electron');
  } catch {
    // Not installed: the check below reports it.
  }
  if (binary && fs.existsSync(binary))
    pass('Бинарник Electron', path.relative(process.cwd(), binary));
  else
    fail(
      'Бинарник Electron',
      'не найден — вероятно, скачивание оборвалось',
      'cd desktop && npm rebuild electron',
    );
}

function checkWebFiles() {
  const root = path.join(__dirname, '..');
  for (const [label, relative] of [
    ['index.html', 'index.html'],
    ['данные заданий', 'data/challenges.json'],
    ['иконка трея', 'assets/icon-192.png'],
  ]) {
    const file = path.join(root, relative);
    if (fs.existsSync(file)) pass(label, relative);
    else
      fail(label, 'файл не найден: ' + relative, 'проверьте, что репозиторий склонирован целиком');
  }
  const built = path.join(__dirname, 'web', 'index.html');
  if (fs.existsSync(built)) pass('Собранные веб-файлы', 'desktop/web');
  else pass('Собранные веб-файлы', 'нет — dev-режим возьмёт файлы из родительской папки');
}

function checkPort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => {
      const busy = error.code === 'EADDRINUSE';
      fail(
        'Порт ' + PORT,
        busy ? 'занят другим процессом' : error.message,
        busy
          ? 'если приложение уже запущено — это нормально; иначе закройте процесс, который держит порт'
          : 'проверьте права на локальные порты',
      );
      resolve();
    });
    server.once('listening', () =>
      server.close(() => {
        pass('Порт ' + PORT, 'свободен');
        resolve();
      }),
    );
    server.listen(PORT, '127.0.0.1');
  });
}

(async () => {
  console.log('ChallengeLock — проверка окружения\n');
  checkNode();
  checkElectron();
  checkWebFiles();
  await checkPort();

  let failed = 0;
  for (const row of results) {
    console.log((row.ok ? '  OK   ' : '  СБОЙ ') + row.name + ': ' + row.detail);
    if (!row.ok) {
      failed++;
      if (row.fix) console.log('         что сделать: ' + row.fix);
    }
  }
  console.log('');
  if (failed) {
    console.log('Найдено проблем: ' + failed + '. Исправьте их и запустите снова.');
    process.exit(1);
  }
  console.log('Всё на месте. Запуск: npm start');
  console.log(
    'Если окно не появится, причина будет в логе: ' +
      path.join(
        process.env.APPDATA || process.env.HOME || '',
        'challengelock-desktop',
        'challenge-lock.log',
      ),
  );
  process.exit(0);
})();
