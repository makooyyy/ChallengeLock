// Guards the offline cache: every shipped asset must be listed in sw.js, and a
// change to a cached file must come with a new cache version.
// Usage: node scripts/check-sw.mjs [base-git-ref]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const rel = (p) => p.split(path.sep).join('/');
const errors = [];

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function readList(name) {
  const match = sw.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const files = readList('FILES');
// Documentation and the social preview are shipped but never needed offline.
const NOT_CACHED = new Set(['assets/og-image.jpg']);
const isDoc = (file) => /\.(md|txt)$/.test(file);
if (!files) {
  errors.push('sw.js: cannot parse the FILES array');
} else {
  const listed = new Set(files);
  for (const dir of ['js', 'css', 'data', 'assets']) {
    const walk = (current) => {
      for (const entry of fs.readdirSync(path.join(root, current), { withFileTypes: true })) {
        const next = path.posix.join(current, entry.name);
        if (entry.isDirectory()) walk(next);
        else if (!listed.has(next) && !NOT_CACHED.has(next) && !isDoc(next)) {
          errors.push(`sw.js: ${next} is not cached (offline users would miss it)`);
        }
      }
    };
    walk(dir);
  }
  for (const file of files) {
    if (file === './') continue;
    if (!fs.existsSync(path.join(root, file)))
      errors.push(`sw.js: cached file ${file} does not exist`);
  }
}

const version = sw.match(/'v(\d+):'/);
if (!version) errors.push("sw.js: cannot find the VERSION literal 'v<number>:'");

const base = process.argv[2] || process.env.SW_BASE_REF || 'HEAD~1';
try {
  execFileSync('git', ['rev-parse', '--verify', '--quiet', base], { cwd: root, stdio: 'ignore' });
  const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const before = execFileSync('git', ['show', `${base}:sw.js`], { cwd: root, encoding: 'utf8' });
  const beforeFiles = new Set(
    (before.match(/const FILES = \[([\s\S]*?)\];/)?.[1] ?? '')
      .match(/'([^']+)'/g)
      ?.map((s) => s.slice(1, -1)) ?? [],
  );
  const cached = changed.filter((file) => beforeFiles.has(file) && file !== 'sw.js');
  if (cached.length && before.includes(`'v${version[1]}:`)) {
    errors.push(
      `sw.js: cache version is still v${version[1]} but cached files changed: ${cached.join(', ')}. Bump VERSION.`,
    );
  }
} catch {
  console.log(`check-sw: base ref "${base}" unavailable, skipped the version-bump comparison`);
}

if (errors.length) {
  for (const message of errors) console.error('FAIL ' + message);
  process.exit(1);
}
console.log(`check-sw: ${files.length} cached files, version v${version[1]}, all present`);
