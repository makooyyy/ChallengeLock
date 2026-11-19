// The game probe: where Deadlock is installed and what its console log says.
// Kept free of Electron imports so node --test can drive it directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const game = require('../desktop/game.js');

test('library folders are parsed from the Steam vdf format', () => {
  const vdf = `
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
		"label"		""
	}
	"1"
	{
		"path"		"D:\\\\SteamLibrary"
	}
	"2"
	{
		"path"		"D:\\\\SteamLibrary"
	}
}`;
  assert.deepEqual(game.parseLibraryFolders(vdf), [
    'C:\\Program Files (x86)\\Steam',
    'D:\\SteamLibrary',
  ]);
  assert.deepEqual(game.parseLibraryFolders(''), []);
  assert.deepEqual(game.parseLibraryFolders(null), []);
});

test('the registry answer yields the Steam path', () => {
  const output = [
    'HKEY_CURRENT_USER\\Software\\Valve\\Steam',
    '    SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam',
    '',
  ].join('\r\n');
  assert.equal(game.decodeRegPath(output), 'C:\\Program Files (x86)\\Steam');
  assert.equal(game.decodeRegPath('nothing here'), null);
  assert.equal(game.decodeRegPath(''), null);
});

test('candidates cover every library and every known folder name', () => {
  const candidates = game.candidateInstalls('C:\\Steam', ['D:\\Games', 'C:\\Steam']);
  assert.equal(candidates.length, 6, 'two unique roots, three folder names each');
  assert.ok(candidates.includes(path.join('D:\\Games', 'steamapps', 'common', 'Deadlock')));
  assert.ok(candidates.includes(path.join('C:\\Steam', 'steamapps', 'common', 'Project8Staging')));
  assert.equal(game.candidateInstalls(null, []).length, 0);
});

test('the install is the first candidate that exists', () => {
  const candidates = ['A', 'B', 'C'];
  assert.equal(
    game.findInstall((dir) => dir === 'B', candidates),
    'B',
  );
  assert.equal(
    game.findInstall(() => false, candidates),
    null,
  );
  assert.equal(
    game.findInstall(() => true, []),
    null,
  );
});

test('the log is described without reading it and tailed safely', () => {
  const fakeFs = {
    existsSync: (file) => file === 'C:\\Game\\game\\citadel\\console.log',
    statSync: () => ({ size: 2048, mtime: new Date('2026-11-19T20:00:00Z') }),
  };
  assert.equal(
    game.logPathFor('C:\\Game'),
    path.join('C:\\Game', 'game', 'citadel', 'console.log'),
  );
  assert.equal(game.logPathFor(null), null);

  const logPath = game.logPathFor('C:\\Game');
  const described = game.describeLog(fakeFs, logPath);
  assert.equal(described.exists, true);
  assert.equal(described.size, 2048);
  assert.equal(described.modified, '2026-11-19T20:00:00.000Z');

  const missing = game.describeLog(fakeFs, 'C:\\Other\\console.log');
  assert.equal(missing.exists, false);
  assert.equal(missing.path, 'C:\\Other\\console.log');

  const text = 'one\r\ntwo\n\nthree\nfour\n';
  assert.deepEqual(game.tailLines(text, 2), ['three', 'four']);
  assert.deepEqual(game.tailLines(text, 100), ['one', 'two', 'three', 'four']);
  assert.deepEqual(game.tailLines('', 5), []);
  assert.deepEqual(game.tailLines(null, 5), []);
});
