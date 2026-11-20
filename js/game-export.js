import { Decompress } from './vendor/fzstd.js';
// Deadlock clipboard format: Base64(Zstandard frame(CMsgHeroBuild protobuf)).
// Schema: SteamTracking/Protobufs/deadlock/citadel_gcmessages_common.proto.
// Zstandard raw blocks are defined by RFC 8878; no server or runtime dependency is needed.
import { restoreResult } from './roulette.js';
import { restoreBuild } from './builds.js';
import { buildSettings, BUILD_STAGES } from './build-config.js';
const utf8 = new TextEncoder();
const uint32 = (n) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) throw new Error('Invalid uint32');
  return n;
};
function variable(n) {
  uint32(n);
  const out = [];
  while (n >= 128) {
    out.push((n % 128) + 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}
const number = (field, n) => [...variable(field * 8), ...variable(n)];
const bytes = (field, b) => [...variable(field * 8 + 2), ...variable(b.length), ...b];
const text = (field, s) => bytes(field, utf8.encode(s));
const float = (field, n) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, n, true);
  return [...variable(field * 8 + 5), ...b];
};
export function challengeForExport(current, heroes, challenges, dict, lang = 'ru') {
  if (!current) return null;
  const x = restoreResult(current, heroes, challenges),
    d = dict[lang] || dict.ru;
  const local = (v) => (typeof v === 'string' ? v : v[lang] || v.ru);
  const hero = heroes.find((h) => h.id === x.hero).name;
  const lines = [
    d.exportChallengeTitle,
    hero + ' · ' + d['gameMode.' + x.opts.gameMode] + ' · ' + d['diff.' + x.diff],
    ...x.conds.map((id, i) => {
      const c = challenges.find((c) => c.id === id);
      return i + 1 + '. ' + local(c.name) + '\n' + local(c.desc);
    }),
  ];
  return { text: lines.join('\n\n'), heroId: x.hero, language: lang === 'ru' ? 8 : 0 };
}
export function encodeGameBuild(build, heroes, items, challenge = null) {
  const valid = restoreBuild(build, heroes, items);
  if (!valid) throw new Error('Invalid build');
  const hero = heroes.find((h) => h.id === valid.hero);
  if (!hero.apiId) throw new Error('Missing game hero ID');
  uint32(hero.apiId);
  const stage = { lane: 'Laning', mid: 'Mid game', full: 'Full game' }[valid.settings.stage];
  const names = ['Start & foundation', 'Power spikes', 'Final purchases'];
  const groups = [];
  for (const id of valid.items) {
    const item = items.find((i) => i.id === id);
    if (!item?.apiId) throw new Error('Missing game item ID');
    uint32(item.apiId);
    const phase = item.tier <= 2 ? 0 : item.tier === 3 ? 1 : 2;
    let group = groups.at(-1);
    if (!group || group.phase !== phase) {
      group = { phase, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  const details = groups.flatMap((group, index) =>
    bytes(1, [
      ...group.items.flatMap((item) => bytes(1, number(1, item.apiId))),
      ...text(2, names[group.phase]),
      ...(index === 0 && challenge ? text(3, challenge.text) : []),
      ...float(4, 545),
      ...float(
        5,
        220 +
          Math.max(0, Math.ceil(group.items.length / 6) - 1) * 125 +
          (index === 0 && challenge ? Math.ceil(challenge.text.length / 50) * 22 + 80 : 0),
      ),
    ]),
  );
  // The game's clipboard importer ignores builds with an absent/zero local ID.
  // 1 is a clipboard placeholder, not a published build ID. No account/origin ID is sent.
  // Explicit category sizes prevent the editor from clipping items into a tiny box.
  const payload = new Uint8Array([
    ...number(1, 1),
    ...number(2, hero.apiId),
    ...text(5, `ChallengeLock | ${hero.name} | ${stage}`),
    ...text(
      6,
      `Experimental ${valid.settings.focus} build. Budget: ${valid.budget} souls; items: ${valid.spent} souls. Purchase order from ChallengeLock.${challenge ? '\n\n' + challenge.text : ''}`,
    ),
    ...number(7, challenge?.language ?? 0),
    ...number(8, 0),
    ...bytes(10, details),
  ]);
  if (payload.length > 16000) throw new Error('Game build exceeds 16000 bytes');
  return payload;
}
export function zstdFrame(payload) {
  if (!(payload instanceof Uint8Array) || payload.length > 16000)
    throw new Error('Invalid frame payload');
  const size = payload.length,
    content = size < 256 ? [0x20, size] : [0x60, (size - 256) & 255, (size - 256) >>> 8];
  const block = size * 8 + 1; // Last block, Raw_Block, exact byte count.
  return new Uint8Array([
    0x28,
    0xb5,
    0x2f,
    0xfd,
    ...content,
    block & 255,
    (block >>> 8) & 255,
    (block >>> 16) & 255,
    ...payload,
  ]);
}
export function gameBuildCode(build, heroes, items, challenge = null) {
  const frame = zstdFrame(encodeGameBuild(build, heroes, items, challenge));
  return btoa(String.fromCharCode(...frame));
}

function base64ToBytes(value) {
  const clean = String(value).trim().replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(clean)) throw new Error('Invalid base64');
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function readVarint(bytes, start) {
  let n = 0n;
  for (let i = start; i < bytes.length && i < start + 10; i++) {
    const byte = bytes[i];
    if (i === start + 9 && byte > 1) throw new Error('Varint overflow');
    n |= BigInt(byte & 127) << BigInt((i - start) * 7);
    if (!(byte & 128))
      return { value: n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n, next: i + 1 };
  }
  throw new Error('Invalid varint');
}

function parseFields(bytes) {
  const fields = new Map();
  let i = 0;
  while (i < bytes.length) {
    const tag = readVarint(bytes, i);
    i = tag.next;
    if (!Number.isSafeInteger(tag.value) || tag.value === 0) throw new Error('Invalid field');
    const field = tag.value >>> 3;
    const wire = tag.value & 7;
    let value;
    if (wire === 0) {
      const v = readVarint(bytes, i);
      value = v.value;
      i = v.next;
    } else if (wire === 2) {
      const len = readVarint(bytes, i);
      if (!Number.isSafeInteger(len.value)) throw new Error('Invalid length');
      i = len.next;
      if (i + len.value > bytes.length) throw new Error('Truncated protobuf field');
      value = bytes.slice(i, i + len.value);
      i += len.value;
    } else if (wire === 1) {
      if (i + 8 > bytes.length) throw new Error('Truncated fixed64');
      value = bytes.slice(i, i + 8);
      i += 8;
    } else if (wire === 5) {
      if (i + 4 > bytes.length) throw new Error('Truncated protobuf float');
      value = bytes.slice(i, i + 4);
      i += 4;
    } else {
      throw new Error('Unsupported protobuf wire type');
    }
    if (!fields.has(field)) fields.set(field, []);
    fields.get(field).push(value);
  }
  return fields;
}

function fieldNumber(fields, number) {
  const values = fields.get(number);
  return values?.length ? values[0] : null;
}

function fieldNumbers(fields, number) {
  return fields.get(number) || [];
}

function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}

function decodeZstdFrame(bytes) {
  if (bytes.length > 32000) throw new Error('Build code is too large');
  // Reject oversized windows before the decoder allocates its history buffer.
  if (
    bytes.length < 6 ||
    bytes[0] !== 40 ||
    bytes[1] !== 181 ||
    bytes[2] !== 47 ||
    bytes[3] !== 253
  )
    throw new Error('Invalid zstd frame');
  const flag = bytes[4],
    single = !!(flag & 32);
  let pos = 5;
  if (!single) {
    const wd = bytes[pos++],
      base = 2 ** (10 + (wd >> 3));
    if (base + (base / 8) * (wd & 7) > 1048576) throw new Error('Build window too large');
  }
  pos += [0, 1, 2, 4][flag & 3];
  const sizeBytes = [single ? 1 : 0, 2, 4, 8][flag >> 6];
  let declared = 0;
  for (let i = 0; i < sizeBytes; i++) declared += bytes[pos + i] * 2 ** (8 * i);
  if (sizeBytes === 2) declared += 256;
  if (sizeBytes && (!Number.isSafeInteger(declared) || declared > 16000))
    throw new Error('Build payload too large');
  const chunks = [];
  let size = 0;
  const stream = new Decompress((chunk) => {
    size += chunk.length;
    if (size > 16000) throw new Error('Build payload too large');
    chunks.push(chunk.slice());
  });
  stream.push(bytes, true);
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export function decodeGameBuild(code, heroes, items) {
  if (typeof code !== 'string' || code.length > 45000) throw new Error('Invalid build code');
  const payload = decodeZstdFrame(base64ToBytes(code));
  const fields = parseFields(payload);
  const heroApiId = fieldNumber(fields, 2);
  const hero = heroes.find((h) => h.apiId === heroApiId);
  if (!hero) throw new Error('Unknown hero in game build');
  const name = fieldNumber(fields, 5) ? bytesToText(fieldNumber(fields, 5)) : '';
  const description = fieldNumber(fields, 6) ? bytesToText(fieldNumber(fields, 6)) : '';
  const stageName =
    name
      .split('|')
      .map((part) => part.trim())
      .pop() || '';
  let stage = stageName === 'Mid game' ? 'mid' : stageName === 'Full game' ? 'full' : 'lane';
  const budgetMatch = description.match(/Budget:\s*([\d\s]+)\s*souls/i);
  let budget = budgetMatch
    ? Number(budgetMatch[1].replace(/\s+/g, ''))
    : BUILD_STAGES[stage].budget;
  const focusMatch = description.match(/Experimental\s+(\w+)\s+build/i);
  const focus = ['balanced', 'weapon', 'vitality', 'spirit'].includes(focusMatch?.[1])
    ? focusMatch[1]
    : 'balanced';
  const details = fieldNumber(fields, 10);
  if (!details) throw new Error('Missing build details');
  const groupFields = parseFields(details);
  const itemApiIds = [];
  for (const groupBytes of fieldNumbers(groupFields, 1)) {
    const group = parseFields(groupBytes);
    for (const itemBytes of fieldNumbers(group, 1)) {
      const id = fieldNumber(parseFields(itemBytes), 1);
      if (!Number.isInteger(id)) throw new Error('Missing item ID');
      itemApiIds.push(id);
    }
  }
  const imported = itemApiIds.map((apiId) =>
    items.find((item) => item.apiId === apiId && item.active !== false),
  );
  if (imported.some((item) => !item)) throw new Error('Unknown item in game build');
  const ids = [...new Set(imported.map((item) => item.id))];
  if (!ids.length) throw new Error('No known items in game build');
  const list = ids.map((id) => items.find((item) => item.id === id));
  if (!['Laning', 'Mid game', 'Full game'].includes(stageName))
    stage =
      list.some((i) => i.tier === 4) || ids.length > 8
        ? 'full'
        : list.some((i) => i.tier === 3) || ids.length > 6
          ? 'mid'
          : 'lane';
  const spent = list.reduce((sum, item) => sum + item.cost, 0);
  if (!budgetMatch) budget = Math.max(800, spent);
  const active = list.filter((item) => item.isActive).length;
  // Keep whatever the game build uses instead of snapping it to our generator's buckets.
  if (active > 12) throw new Error('Too many active items');
  const maxActive = active;
  const settings = buildSettings({
    stage,
    budget: Number.isSafeInteger(budget) ? budget : BUILD_STAGES[stage].budget,
    heroId: hero.id,
    focus,
    maxActive,
    maxItems: Math.min(ids.length, BUILD_STAGES[stage].slots),
    keepHero: true,
  });
  const build = {
    hero: hero.id,
    seed: 'imported-' + Date.now(),
    items: [...new Set(ids)],
    budget: settings.budget,
    settings,
    locked: [],
    purchased: [],
  };
  const restored = restoreBuild(build, heroes, items);
  if (!restored) throw new Error('Imported build failed validation');
  return restored;
}
