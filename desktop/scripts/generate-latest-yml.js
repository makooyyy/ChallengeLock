const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dist = path.join(__dirname, '..', 'dist');
const files = fs.readdirSync(dist).filter((name) => /\.exe$/i.test(name) && name !== 'latest.yml');
if (!files.length) throw new Error('No installer exe found in dist');
const exe = files[0];
const exePath = path.join(dist, exe);
const buffer = fs.readFileSync(exePath);
const sha512 = crypto.createHash('sha512').update(buffer).digest('base64');
const size = buffer.length;
const version = require(path.join(__dirname, '..', 'package.json')).version;
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
