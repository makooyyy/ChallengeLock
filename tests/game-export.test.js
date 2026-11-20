import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { zstdDecompressSync, zstdCompressSync } from 'node:zlib';
import {
  encodeGameBuild,
  decodeGameBuild,
  zstdFrame,
  gameBuildCode,
  challengeForExport,
} from '../js/game-export.js';
import { makeBuild } from '../js/builds.js';
import { options } from '../js/validation.js';
const read = (p) =>
    JSON.parse(fs.readFileSync(new URL('../data/' + p + '.json', import.meta.url), 'utf8'))[p],
  heroes = read('heroes'),
  items = read('items');
// Independent generic protobuf reader for validation against the game field numbers.
function decode(buffer) {
  let at = 0;
  const fields = new Map();
  const varint = () => {
    let value = 0,
      factor = 1;
    for (let n = 0; n < 5; n++) {
      assert(at < buffer.length);
      const byte = buffer[at++];
      value += (byte & 127) * factor;
      if (!(byte & 128)) return value;
      factor *= 128;
    }
    throw Error('varint');
  };
  while (at < buffer.length) {
    const tag = varint(),
      field = tag >>> 3;
    let value;
    if ((tag & 7) === 0) value = varint();
    else if ((tag & 7) === 5) {
      assert(at + 4 <= buffer.length);
      value = buffer.readFloatLE(at);
      at += 4;
    } else {
      assert.equal(tag & 7, 2);
      const size = varint();
      assert(at + size <= buffer.length);
      value = buffer.subarray(at, at + size);
      at += size;
    }
    fields.set(field, [...(fields.get(field) || []), value]);
  }
  return fields;
}
function parsed(code) {
  const compressed = Buffer.from(code, 'base64');
  assert.equal(compressed.readUInt32LE(0), 0xfd2fb528);
  return decode(zstdDecompressSync(compressed));
}
test('standard zstd decoder accepts the raw frame and both content-size forms', () => {
  for (const length of [0, 1, 255, 256, 257, 1024, 16000]) {
    const data = Uint8Array.from({ length }, (_, i) => i % 251);
    assert.deepEqual(new Uint8Array(zstdDecompressSync(zstdFrame(data))), data);
  }
  assert.throws(() => zstdFrame(new Uint8Array(16001)));
});
test('game code contains real hero/item IDs, exact order, import placeholder ID and no account identity', () => {
  for (const hero of heroes.filter((h) => h.active !== false))
    for (const stage of ['lane', 'mid', 'full']) {
      const b = makeBuild('export', heroes, items, 32000, options(), { stage, heroId: hero.id });
      const code = gameBuildCode(b, heroes, items),
        raw = encodeGameBuild(b, heroes, items),
        out = parsed(code);
      assert(raw.length <= 16000);
      assert.equal(out.get(2)[0], hero.apiId);
      assert.equal(out.get(8)[0], 0);
      assert.equal(out.get(1)[0], 1);
      assert(!out.has(3));
      assert(!out.has(9));
      assert(Buffer.from(out.get(5)[0]).toString().includes(hero.name));
      const categories = decode(out.get(10)[0]).get(1);
      for (const category of categories) {
        const fields = decode(category);
        assert.equal(fields.get(4)[0], 545);
        assert.equal(
          fields.get(5)[0],
          220 + Math.max(0, Math.ceil(fields.get(1).length / 6) - 1) * 125,
        );
      }
      const ids = categories.flatMap((c) =>
        decode(c)
          .get(1)
          .map((i) => decode(i).get(1)[0]),
      );
      assert.deepEqual(
        ids,
        b.items.map((id) => items.find((i) => i.id === id).apiId),
      );
      b.purchased = [...b.items];
      b.locked = [...b.items];
      assert.equal(gameBuildCode(b, heroes, items), code);
    }
});
test('invalid IDs and stale catalog records are rejected instead of producing broken codes', () => {
  const b = makeBuild('export', heroes, items, 4800, options());
  assert.throws(() => gameBuildCode({ ...b, items: ['missing'] }, heroes, items));
  const bad = items.map((i) => ({ ...i, apiId: 0x100000000 }));
  assert.throws(() => gameBuildCode(b, heroes, bad));
  assert.throws(() =>
    gameBuildCode(
      b,
      heroes.map((h) => ({ ...h, apiId: null })),
      items,
    ),
  );
  const unicode = heroes.map((h) => ({ ...h, name: 'Герой — ' + h.name }));
  assert(
    Buffer.from(parsed(gameBuildCode(b, unicode, items)).get(5)[0])
      .toString()
      .includes('Герой'),
  );
});

test('current challenge is exported in full in build and first category descriptions', () => {
  const challenges = read('challenges'),
    dict = JSON.parse(fs.readFileSync(new URL('../data/i18n.json', import.meta.url), 'utf8'));
  const b = makeBuild('challenge-export', heroes, items, 32000, options(), {
    heroId: 'haze',
    stage: 'full',
  });
  for (const lang of ['ru', 'en'])
    for (const count of [1, 2, 3]) {
      const current = {
        seed: 'test',
        r: 0,
        diff: 'insane',
        hero: 'abrams',
        conds: ['ab_no1', 'ab_no2', 'ab_no3'].slice(0, count),
        player: 0,
        opts: options(),
        ts: Date.now(),
        outcome: null,
      };
      const challenge = challengeForExport(current, heroes, challenges, dict, lang),
        out = parsed(gameBuildCode(b, heroes, items, challenge));
      assert.equal(out.get(2)[0], heroes.find((h) => h.id === 'haze').apiId);
      assert.equal(challenge.heroId, 'abrams');
      assert.equal(out.get(7)[0], lang === 'ru' ? 8 : 0);
      assert(out.get(6)[0].toString().includes(challenge.text));
      const categories = decode(out.get(10)[0]).get(1);
      assert.equal(decode(categories[0]).get(3)[0].toString(), challenge.text);
      for (const id of current.conds) {
        const c = challenges.find((c) => c.id === id);
        assert(challenge.text.includes(c.name[lang]));
        assert(challenge.text.includes(c.desc[lang]));
      }
      const ids = categories.flatMap((c) =>
        decode(c)
          .get(1)
          .map((i) => decode(i).get(1)[0]),
      );
      assert.deepEqual(
        ids,
        b.items.map((id) => items.find((i) => i.id === id).apiId),
      );
    }
  assert.equal(challengeForExport(null, heroes, challenges, dict), null);
  assert.throws(() => gameBuildCode(b, heroes, items, { text: 'я'.repeat(17000), language: 8 }));
});

test('imports standard compressed frames and preserves four active items', () => {
  const active = items.filter((i) => i.active !== false && i.isActive && i.tier === 4).slice(0, 4);
  assert.equal(active.length, 4);
  const b = makeBuild('import-four', heroes, items, 64000, options(), {
    stage: 'full',
    maxActive: 4,
    locked: active.map((i) => i.id),
  });
  assert(b);
  for (const code of [
    gameBuildCode(b, heroes, items),
    zstdCompressSync(encodeGameBuild(b, heroes, items)).toString('base64'),
  ]) {
    const restored = decodeGameBuild(code, heroes, items);
    assert.deepEqual(restored.items, b.items);
    assert.equal(restored.settings.maxActive, 4);
  }
  assert.throws(() =>
    decodeGameBuild(Buffer.from([40, 181, 47, 253, 32, 255]).toString('base64'), heroes, items),
  );
  assert.throws(() =>
    decodeGameBuild(zstdCompressSync(Buffer.alloc(16001)).toString('base64'), heroes, items),
  );
});
