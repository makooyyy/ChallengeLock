const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dist = path.join(__dirname, '..', 'dist');
const version = require(path.join(__dirname, '..', 'package.json')).version;
const exe = `ChallengeLock-${version}.exe`;
if (!fs.existsSync(path.join(dist, exe))) throw new Error('Installer missing for ' + version);
const exePath = path.join(dist, exe);
const buffer = fs.readFileSync(exePath);
const sha512 = crypto.createHash('sha512').update(buffer).digest('base64');
const size = buffer.length;

const releaseDate = new Date().toISOString();
const yaml = [
  `version: ${version}`,
  'files:',
  `  - url: ${exe}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${exe}`,
  `sha512: ${sha512}`,
  `releaseDate: '${releaseDate}'`,
  '',
].join('\n');
fs.writeFileSync(path.join(dist, 'latest.yml'), yaml);
console.log('Generated latest.yml for', exe);
