import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, buildCatalog } from './catalog.js';
import { validateData } from '../js/validation.js';
const root = fileURLToPath(new URL('../', import.meta.url)),
  args = process.argv.slice(2);
const check = args.includes('--check'),
  inputIndex = args.indexOf('--input-dir'),
  input = inputIndex < 0 ? null : path.resolve(args[inputIndex + 1]);
async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error('API HTTP ' + r.status + ' ' + url);
  return r.text();
}
const read = async (p) => JSON.parse(await fs.readFile(path.join(root, p), 'utf8'));
try {
  const [oldHeroes, oldItems, challenges, dict] = await Promise.all(
    ['data/heroes.json', 'data/items.json', 'data/challenges.json', 'data/i18n.json'].map(read),
  );
  const versions = JSON.parse(
    input
      ? await fs.readFile(path.join(input, 'api-versions.json'), 'utf8')
      : await get(API + '/client-versions'),
  );
  if (
    !Array.isArray(versions) ||
    !versions.length ||
    !versions.every((v) => Number.isSafeInteger(v) && v > 0)
  )
    throw new Error('Invalid versions');
  const version = Math.max(...versions);
  if (input) {
    const cached = JSON.parse(await fs.readFile(path.join(input, 'snapshot.json'), 'utf8'));
    if (cached.clientVersion !== version) throw new Error('Cached input version mismatch');
  }
  const [heroText, itemText] = await Promise.all(
    ['heroes', 'items'].map((kind) =>
      input
        ? fs.readFile(path.join(input, 'api-' + kind + '.json'), 'utf8')
        : get(API + '/' + kind + '?client_version=' + version + '&language=english'),
    ),
  );
  const catalog = buildCatalog({
    heroText,
    itemText,
    clientVersion: version,
    retrievedAt: new Date().toISOString(),
    previousHeroes: oldHeroes.heroes,
    previousItems: oldItems.items,
  });
  validateData(
    {
      heroes: catalog.heroes.heroes,
      items: catalog.items.items,
      challenges: challenges.challenges,
      catalog: { heroes: catalog.heroes._meta, items: catalog.items._meta },
    },
    dict,
  );
  if (
    oldHeroes._meta?.revision === catalog.heroes._meta.revision &&
    oldItems._meta?.revision === catalog.items._meta.revision
  ) {
    console.log('Catalog unchanged: ' + catalog.heroes._meta.revision);
    process.exit(0);
  }
  for (const kind of ['heroes', 'items']) {
    const before = kind === 'heroes' ? oldHeroes.heroes : oldItems.items,
      after = catalog[kind][kind];
    console.log(
      kind +
        ': ' +
        after.filter((x) => x.active !== false).length +
        ' active; ' +
        after.filter((x) => !before.some((y) => y.id === x.id)).length +
        ' added; ' +
        after.filter((x) => x.active === false).length +
        ' archived',
    );
    if (
      after.filter((x) => x.active !== false).length <
      before.filter((x) => x.active !== false).length * 0.8
    )
      throw new Error('Unexpected large catalog reduction; manual investigation required');
  }
  console.log('Client version ' + version + '; revision ' + catalog.heroes._meta.revision);
  if (check) {
    console.log('Check only: no files changed');
    process.exit(0);
  }
  const sw = await fs.readFile(path.join(root, 'sw.js'), 'utf8');
  const marker = /const CATALOG_VERSION\s*=\s*'[^']*';/;
  if (!marker.test(sw)) throw new Error('Missing cache version marker');
  const files = [
    ['data/heroes.json', JSON.stringify(catalog.heroes, null, 2) + '\n'],
    ['data/items.json', JSON.stringify(catalog.items, null, 2) + '\n'],
    [
      'sw.js',
      sw.replace(marker, "const CATALOG_VERSION = '" + catalog.heroes._meta.revision + "';"),
    ],
  ];
  // Validate/fetch everything before touching the last good catalog. Roll back I/O failures.
  const backups = await Promise.all(files.map(async ([p]) => fs.readFile(path.join(root, p))));
  try {
    for (const [p, content] of files) await fs.writeFile(path.join(root, p + '.tmp'), content);
    for (const [p] of files) await fs.rename(path.join(root, p + '.tmp'), path.join(root, p));
  } catch (error) {
    for (let i = 0; i < files.length; i++)
      await fs.writeFile(path.join(root, files[i][0]), backups[i]);
    throw error;
  } finally {
    for (const [p] of files) await fs.rm(path.join(root, p + '.tmp'), { force: true });
  }
  console.log('Catalog and offline cache version updated. Run tests before publishing.');
} catch (error) {
  console.error('Catalog sync failed; previous catalog retained:', error.message);
  process.exitCode = 1;
}
