const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..');
const dst = path.join(__dirname, 'web');

const entries = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'data', 'assets'];

function copyRecursive(s, d) {
  if (!fs.existsSync(s)) return;
  const stat = fs.statSync(s);
  if (stat.isDirectory()) {
    fs.mkdirSync(d, { recursive: true });
    for (const f of fs.readdirSync(s)) copyRecursive(path.join(s, f), path.join(d, f));
  } else {
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(s, d);
  }
}

if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
for (const e of entries) copyRecursive(path.join(src, e), path.join(dst, e));
console.log('Web assets copied to', dst);
