// Guards the stylesheet as it migrates to design tokens. The palette should move
// into custom properties; the budget only ever goes down.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
// Comments explain the palette and must not count as rules.
const css = source.replace(/\/\*[\s\S]*?\*\//g, '');

// Lower this number when you replace literals with tokens. Never raise it for a new rule:
// add a custom property to :root and the dark theme block instead.
const HEX_BUDGET = 436;

// Custom properties written from markup or JS per element, never from the stylesheet.
const FROM_RUNTIME = new Set([
  '--c',
  '--hero-color',
  '--difficulty-color',
  '--branch',
  '--item-branch',
  '--rule-index',
  '--x',
  '--y',
]);

test('raw color literals stay within the token budget', () => {
  const found = css.match(/#[0-9a-f]{3,8}\b/gi) || [];
  assert.ok(
    found.length <= HEX_BUDGET,
    `${found.length} raw color literals, budget is ${HEX_BUDGET}: move new colors into custom properties`,
  );
});

test('every custom property used by the stylesheet is defined somewhere', () => {
  const defined = new Set(
    [...css.matchAll(/(?:^|[\s{;])(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1]),
  );
  const used = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1]));
  const missing = [...used].filter((name) => !defined.has(name) && !FROM_RUNTIME.has(name));
  assert.deepEqual(missing, [], `undefined custom properties: ${missing.join(', ')}`);
});
