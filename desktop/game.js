// Locating the game and its console log. Pure functions on purpose: the Electron
// shell wires the real filesystem, registry and IPC, while tests use plain objects.
const path = require('path');

// The retail folder is "Deadlock"; the playtest branch ships under a different name.
const GAME_FOLDERS = ['Deadlock', 'Deadlock Beta', 'Project8Staging'];
const LOG_PARTS = ['game', 'citadel', 'console.log'];

// libraryfolders.vdf lists every Steam library on every drive. We only need paths.
function parseLibraryFolders(text) {
  const found = new Set();
  for (const match of String(text || '').matchAll(/"path"\s+"([^"]+)"/gi))
    found.add(match[1].replace(/\\\\/g, '\\'));
  return [...found];
}

// `reg query HKCU\Software\Valve\Steam /v SteamPath` answers with a REG_SZ line.
function decodeRegPath(output) {
  const match = String(output || '').match(/SteamPath\s+REG_SZ\s+(.+)/i);
  return match ? match[1].trim() : null;
}

function candidateInstalls(steamPath, libraries) {
  const roots = [...new Set([...(libraries || []), steamPath].filter(Boolean))];
  const candidates = [];
  for (const root of roots)
    for (const folder of GAME_FOLDERS)
      candidates.push(path.join(root, 'steamapps', 'common', folder));
  return candidates;
}

function findInstall(exists, candidates) {
  // An uninstall can leave an empty directory or even an old console.log behind.
  // Prefer actual game files; a log is useful evidence only if no install has them.
  let logged = null;
  for (const candidate of candidates || []) {
    if (
      exists(path.join(candidate, 'game', 'bin', 'win64', 'deadlock.exe')) ||
      exists(path.join(candidate, 'game', 'citadel', 'gameinfo.gi'))
    )
      return candidate;
    if (!logged && exists(logPathFor(candidate))) logged = candidate;
  }
  return logged;
}

function logPathFor(install) {
  return install ? path.join(install, ...LOG_PARTS) : null;
}

function describeLog(fsApi, logPath) {
  if (!logPath || !fsApi.existsSync(logPath)) return { exists: false, path: logPath };
  const stat = fsApi.statSync(logPath);
  return {
    exists: true,
    path: logPath,
    size: stat.size,
    modified: stat.mtime instanceof Date ? stat.mtime.toISOString() : String(stat.mtime),
  };
}

// Reading the last block is enough for a preview and keeps a 200 MB log cheap.
function tailLines(text, count = 40) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length)
    .slice(-Math.max(1, count));
}

// 1.21.0-style dotted versions, without pulling a semver dependency into the shell.
function compareVersions(a, b) {
  const left = String(a || '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
  const right = String(b || '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

module.exports = {
  GAME_FOLDERS,
  parseLibraryFolders,
  decodeRegPath,
  candidateInstalls,
  findInstall,
  logPathFor,
  describeLog,
  tailLines,
  compareVersions,
};
