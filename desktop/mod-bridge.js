// Read-only loopback bridge for the Panorama addon. Never expose account IDs,
// game logs, filesystem paths or the full application state here.
const text = (value, limit) => String(value || '').slice(0, limit);
function snapshot(contract, build) {
  const state = {
    version: 1,
    shopToken: text(build?.shopToken, 64),
    canUndo: build?.canUndo === true,
    lang: build?.lang || contract?.lang || 'ru',
    hero: text(contract?.hero, 60),
    mode: text(contract?.mode, 60),
    outcome: ['done', 'fail'].includes(contract?.outcome) ? contract.outcome : '',
    conditions: (contract?.conditions || []).slice(0, 3).map((c) => ({
      name: text(c.name, 80),
      desc: text(c.desc, 380),
      checked: c.checked === true,
    })),
    buildHero: text(build?.hero, 60),
    ...(build?.nextSkill ? { nextSkill: text(build.nextSkill, 160) } : {}),
    next: text(build?.nextItem, 80),
    cost: Number.isFinite(build?.nextCost) ? build.nextCost : 0,
    complete: build?.complete === true,
    items: (build?.displayItems || [])
      .slice(0, 12)
      .map((i) => ({ name: text(i.name, 60), purchased: i.purchased === true })),
  };
  return state;
}
const bridgePage = require('fs').readFileSync(
  require('path').join(__dirname, 'mod-shop.html'),
  'utf8',
);
module.exports = { snapshot, bridgePage };
