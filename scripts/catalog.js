import { createHash } from 'node:crypto';
export const API = 'https://api.deadlock-api.com/v1/assets';
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const aliases = {
  upgrade_clip_size: 'basic-magazine',
  upgrade_high_velocity_mag: 'high-velocity-mag',
  upgrade_mystic_regeneration: 'mystic-regen',
};
function requireValue(ok, message) {
  if (!ok) throw new Error(message);
}
function unique(list, field) {
  const values = list.map((x) => x[field]);
  requireValue(
    values.every((x) => x !== undefined) && new Set(values).size === values.length,
    'Duplicate or missing ' + field,
  );
}
function https(url) {
  requireValue(typeof url === 'string' && url.startsWith('https://'), 'Invalid asset URL');
  return url;
}
function identity(raw, previous, kind) {
  const old =
    previous.find((x) => x.apiId === raw.id) ||
    previous.find((x) => x.className === raw.class_name) ||
    previous.find((x) => key(x.name) === key(raw.name)) ||
    previous.find((x) => kind === 'item' && x.id === aliases[raw.class_name]);
  return old?.id || slug(raw.name);
}
export function buildCatalog({
  heroText,
  itemText,
  clientVersion,
  retrievedAt,
  previousHeroes = [],
  previousItems = [],
}) {
  const rawHeroes = JSON.parse(heroText),
    rawItems = JSON.parse(itemText);
  requireValue(Array.isArray(rawHeroes) && Array.isArray(rawItems), 'Expected API arrays');
  requireValue(Number.isSafeInteger(clientVersion) && clientVersion > 0, 'Invalid client version');
  requireValue(Number.isFinite(Date.parse(retrievedAt)), 'Invalid retrieval time');
  unique(rawHeroes, 'id');
  unique(rawItems, 'id');
  const selectedHeroes = rawHeroes.filter(
    (h) => h.player_selectable === true && h.disabled === false && h.in_development === false,
  );
  // Normal shop only; T5 special items are deliberately outside the supported build mode.
  const selectedItems = rawItems.filter(
    (i) =>
      i.type === 'upgrade' &&
      i.shopable === true &&
      i.disabled !== true &&
      Number.isInteger(i.item_tier) &&
      i.item_tier >= 1 &&
      i.item_tier <= 4,
  );
  requireValue(
    selectedHeroes.length >= 20 && selectedItems.length >= 50,
    'Suspiciously incomplete catalog',
  );
  const heroes = selectedHeroes.map((h) => {
    requireValue(
      typeof h.name === 'string' && h.name.length > 0 && Number.isSafeInteger(h.id) && h.id > 0,
      'Invalid hero',
    );
    const slots = [1, 2, 3, 4].map((slot) => h.items?.['signature' + slot]);
    requireValue(
      slots.every((x) => typeof x === 'string' && x),
      'Missing hero abilities: ' + h.name,
    );
    const color = h.colors?.style_hex;
    requireValue(/^#[0-9a-f]{6}$/i.test(color), 'Invalid hero color');
    return {
      id: identity(h, previousHeroes, 'hero'),
      apiId: h.id,
      className: h.class_name,
      name: h.name,
      color,
      abilities: slots.length,
      abilityClasses: slots,
      abilityDetails: slots.map((key) => {
        const ability = rawItems.find((i) => i.class_name === key);
        return ability
          ? {
              name: ability.name,
              icon: ability.image_webp || ability.image || '',
              apiId: ability.id,
            }
          : null;
      }),
      icon: https(h.images?.icon_image_small_webp || h.images?.icon_image_small),
      active: true,
      verified: true,
    };
  });
  const items = selectedItems.map((i) => {
    requireValue(
      typeof i.name === 'string' && i.name.length > 0 && Number.isSafeInteger(i.id) && i.id > 0,
      'Invalid item',
    );
    requireValue(
      Number.isInteger(i.cost) &&
        i.cost > 0 &&
        ['weapon', 'vitality', 'spirit'].includes(i.item_slot_type),
      'Invalid price or branch: ' + i.name,
    );
    requireValue(!i.heroes?.length, 'Hero-specific items require explicit support: ' + i.name);
    return {
      id: identity(i, previousItems, 'item'),
      apiId: i.id,
      className: i.class_name,
      name: i.name,
      branch: i.item_slot_type,
      tier: i.item_tier,
      cost: i.cost,
      icon: https(i.shop_image_webp || i.shop_image || i.image_webp || i.image),
      isActive: i.is_active_item === true,
      components: [],
      buildsInto: [],
      active: true,
      verified: true,
    };
  });
  unique(heroes, 'id');
  unique(items, 'id');
  unique(items, 'className');
  const byClass = new Map(items.map((i) => [i.className, i]));
  for (const raw of selectedItems) {
    const item = byClass.get(raw.class_name);
    requireValue(
      raw.component_items == null || Array.isArray(raw.component_items),
      'Invalid components',
    );
    item.components = (raw.component_items || []).map((name) => {
      const component = byClass.get(name);
      requireValue(component, 'Missing recipe component: ' + name);
      component.buildsInto.push(item.id);
      return component.id;
    });
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  function visit(id, stack = new Set()) {
    requireValue(!stack.has(id), 'Cyclic item recipe');
    const next = new Set([...stack, id]);
    for (const component of byId.get(id).components) visit(component, next);
  }
  for (const item of items) visit(item.id);
  // Keep removed entries readable in saved results, but never generate them again.
  const archive = (old, current) =>
    old
      .filter((x) => !current.some((y) => y.id === x.id))
      .map((x) => ({ ...x, active: false, verified: false, retiredAtVersion: clientVersion }));
  heroes.push(...archive(previousHeroes, heroes));
  items.push(...archive(previousItems, items));
  heroes.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  items.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const revision = hash(JSON.stringify({ clientVersion, heroes, items })).slice(0, 16);
  const shared = {
    schemaVersion: 1,
    clientVersion,
    retrievedAt,
    revision,
    provider: 'Deadlock API',
    providerUrl: 'https://deadlock-api.com/',
    verification: 'Matched to the provider snapshot; not independently verified by Valve.',
  };
  return {
    heroes: {
      _meta: {
        ...shared,
        source: API + '/heroes?client_version=' + clientVersion + '&language=english',
        sha256: hash(heroText),
        selection: 'player_selectable && !disabled && !in_development',
      },
      heroes,
    },
    items: {
      _meta: {
        ...shared,
        source: API + '/items?client_version=' + clientVersion + '&language=english',
        sha256: hash(itemText),
        selection: 'type=upgrade, shopable, not disabled, normal tiers 1–4; T5 excluded',
      },
      items,
    },
  };
}
