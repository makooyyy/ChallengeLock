// Guards the public changelog: it is the only place where the site version
// lives, so a broken entry would ship an empty or mismatched updates page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const changelog = read('data/changelog.json');
const langs = ['ru', 'en'];

test('changelog releases are complete and ordered newest first', () => {
  assert.ok(Array.isArray(changelog.releases), 'releases must be an array');
  assert.ok(changelog.releases.length > 0, 'changelog must not be empty');

  const seen = new Set();
  let previous = Number.POSITIVE_INFINITY;

  for (const release of changelog.releases) {
    assert.match(release.version, /^\d+\.\d+\.\d+$/, `bad version: ${release.version}`);
    assert.ok(!seen.has(release.version), `duplicate version: ${release.version}`);
    seen.add(release.version);

    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, `bad date: ${release.date}`);
    const stamp = Date.parse(release.date);
    assert.ok(Number.isFinite(stamp), `unparsable date: ${release.date}`);
    assert.ok(stamp <= previous, `${release.version} must not be newer than the entry above it`);
    previous = stamp;

    for (const lang of langs) {
      assert.ok(release.title?.[lang]?.trim(), `${release.version}: missing ${lang} title`);
      const items = release.items?.[lang];
      assert.ok(Array.isArray(items) && items.length, `${release.version}: no ${lang} items`);
      for (const item of items) assert.ok(item?.trim(), `${release.version}: empty ${lang} item`);
    }
    assert.equal(
      release.items.ru.length,
      release.items.en.length,
      `${release.version}: ru and en lists differ in length`,
    );
  }
});

test('the newest release is the version rendered by the site', () => {
  const newest = changelog.releases[0];
  const views = fs.readFileSync(new URL('../js/views/updates.js', import.meta.url), 'utf8');
  // The updates view derives the site version from the first release; keep it that way.
  assert.match(views, /releases\[0\]\?\.version/);
  assert.ok(newest.version.length > 0);
});

test('the changelog ships in the offline cache', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'data/changelog.json'"), 'sw.js must cache data/changelog.json');
});
