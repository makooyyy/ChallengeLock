// Optional real-browser regression suite. Install playwright or set PLAYWRIGHT_MODULE.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(async (req, res) => {
  try {
    const relative =
      decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') ||
      'index.html';
    const target = path.resolve(root, relative);
    if (!target.startsWith(root)) throw new Error('outside root');
    const body = await fs.readFile(target);
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
      }[path.extname(target)] || 'application/octet-stream',
    );
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
  });
  const context = await browser.newContext({ reducedMotion: 'reduce' }),
    page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error(e.stack);
  });
  await page.goto(origin + '/#seed=hello&d=mid&r=0');
  await page.waitForSelector('#contract h2');
  assert(await page.locator('#spin').isVisible());
  assert(await page.locator('#data-notice').isVisible());
  assert((await page.locator('#data-notice').textContent()).includes('Каталог сверён с API'));
  assert.equal(
    await page.locator('#data-notice a').getAttribute('href'),
    'https://deadlock-api.com/',
  );
  // Version chip and the changelog tab.
  assert.match(await page.locator('#foot-version').textContent(), /^v\d+\.\d+\.\d+ · /);
  await page.click('#foot-version');
  await page.waitForSelector('#p-updates .release');
  assert(await page.locator('#p-updates').isVisible());
  assert((await page.locator('#p-updates .release').count()) >= 1);
  assert.match(await page.locator('#p-updates .release-version').first().textContent(), /^v\d/);
  assert((await page.locator('#p-updates h1').textContent()).trim().length > 0);
  await page.click('[data-tab="roulette"]');
  assert(await page.locator('#spin').isVisible());
  const state = () =>
    page.evaluate(async () => {
      const { S, RT } = await import('/js/state.js');
      return {
        cur: RT.cur,
        rerolls: RT.rerolls,
        stats: S.stats,
        friend: S.friend,
        diff: S.diff,
        busy: RT.busy,
      };
    });
  const initial = (await state()).cur;
  await page.click('[data-tab="history"]');
  await page.click('.hl a');
  assert(await page.locator('#spin').isVisible());
  await page.click('[data-lock="0"]');
  await page.click('[data-lock="1"]');
  await page.click('#reroll');
  await page.waitForFunction(async () => !(await import('/js/state.js')).RT.busy);
  const rerolled = await state();
  assert.equal(rerolled.cur.hero, initial.hero);
  assert.equal(rerolled.cur.conds[0], initial.conds[0]);
  const url = page.url();
  const second = await browser.newContext({ reducedMotion: 'reduce' });
  const receiver = await second.newPage();
  await receiver.addInitScript(() =>
    localStorage.setItem(
      'dlr.v1',
      JSON.stringify({
        only: ['bebop'],
        cats: ['tm'],
        team: false,
        friend: { same: false, player: 9 },
      }),
    ),
  );
  await receiver.goto(url);
  await receiver.waitForSelector('#contract h2');
  const received = await receiver.evaluate(async () => (await import('/js/state.js')).RT.cur);
  assert.equal(received.hero, rerolled.cur.hero);
  assert.deepEqual(received.conds, rerolled.cur.conds);
  assert.deepEqual(received.opts, rerolled.cur.opts);
  await page.click('#done');
  const completed = (await state()).stats.done;
  assert(await page.locator('#completion-dialog').isVisible());
  assert(await page.locator('.result-seal').isVisible());
  assert.equal(await page.locator('#rank,.reward-box,.completion-points').count(), 0);
  assert(!('points' in (await state()).stats));
  assert.equal(await page.locator('#completion-dialog').getAttribute('data-outcome'), 'done');
  assert.equal(await page.locator('.completion-rules li').count(), rerolled.cur.conds.length);
  await page.keyboard.press('r');
  assert.deepEqual((await state()).cur.conds, rerolled.cur.conds);
  await page.keyboard.press('Escape');
  assert(await page.locator('#completion-dialog').isHidden());
  await page.click('#review-stamp');
  assert(await page.locator('#completion-dialog').isVisible());
  assert.equal((await state()).stats.done, completed);
  await page.keyboard.press('Escape');
  await page.click('#theme');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.reload();
  await page.waitForSelector('#spin');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.click('[data-tab="history"]');
  await page.click('.hl a');
  assert(await page.locator('#done').isDisabled());
  assert.equal((await state()).stats.done, completed);
  await page.evaluate(() => (location.hash = '#seed=change&d=easy&r=0&p=2'));
  await page.waitForFunction(async () => (await import('/js/state.js')).S.diff === 'easy');
  await page.evaluate(() => (location.hash = '#seed=change&d=hard&r=0&p=3'));
  await page.waitForFunction(async () => (await import('/js/state.js')).S.friend.player === 3);
  assert.equal((await state()).diff, 'hard');
  const beforeFailure = (await state()).stats;
  await page.click('#failb');
  assert.equal(await page.locator('#completion-dialog').getAttribute('data-outcome'), 'fail');
  assert(await page.locator('.result-seal').isVisible());
  assert.equal((await state()).stats.done, beforeFailure.done);
  assert.equal((await state()).stats.fail, beforeFailure.fail + 1);
  await page.locator('.completion-close').click();
  await page.evaluate(() => (location.hash = '#seed=change&d=hard&r=0'));
  await page.waitForFunction(async () => (await import('/js/state.js')).S.friend.same);
  await page.click('[data-tab="build"]');
  await page.click('#rb');
  const priorBuild = await page.evaluate(async () => (await import('/js/state.js')).RT.build);
  await page.click('[data-tab="ban"]');
  await page.click('[data-ban-type="item"]');
  await page.click('#ban-roll');
  const priorBan = await page.evaluate(async () => (await import('/js/state.js')).RT.ban);
  await page.click('[data-tab="roulette"]');
  const before = await state();
  await page.evaluate(async () => {
    const { S, RT } = await import('/js/state.js');
    S.excluded = RT.data.heroes.map((h) => h.id);
  });
  await page.click('#reroll');
  assert.equal((await state()).rerolls, before.rerolls);
  assert.deepEqual((await state()).cur, before.cur);
  await page.click('[data-tab="build"]');
  await page.click('#rb');
  assert((await page.locator('#toast').textContent()).includes('героев'));
  await page.click('[data-tab="ban"]');
  await page.click('[data-ban-type="item"]');
  await page.click('#ban-roll');
  assert((await page.locator('#toast').textContent()).includes('героев'));
  assert.deepEqual(
    await page.evaluate(async () => (await import('/js/state.js')).RT.build),
    priorBuild,
  );
  assert.deepEqual(
    await page.evaluate(async () => (await import('/js/state.js')).RT.ban),
    priorBan,
  );
  await page.evaluate(() =>
    localStorage.setItem(
      'dlr.v1',
      JSON.stringify({
        stats: { points: 'oops' },
        friend: null,
        cats: null,
        history: [null, {}],
        favs: 'broken',
      }),
    ),
  );
  await page.goto(origin + '/');
  await page.waitForSelector('#spin');
  assert.equal((await state()).stats.done, 0);
  await page.goto(origin + '/#seed=a&v=2&x=null');
  await page.waitForSelector('#spin');
  assert((await page.locator('#toast').textContent()).includes('Ссылка'));
  await page.click('#spin');
  await page.waitForSelector('#contract h2');
  await page.click('#lang');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.locator('#spin').isVisible());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Real Service Worker installation, offline reload, and isolation from another app's cache.
  await page.evaluate(async () => {
    await caches.open('unrelated-test-cache');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForSelector('#spin');
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#spin');
  await page.click('#spin');
  await page.waitForSelector('#contract h2');
  assert(await page.evaluate(async () => (await caches.keys()).includes('unrelated-test-cache')));
  await context.setOffline(false);
  // Search must preserve selected heroes even when other cards are hidden.
  await page.click('[data-tab="custom"]');
  await page.fill('#hero-search', 'abrams');
  assert.equal(await page.locator('.hc:visible').count(), 1);
  await page.check('[data-h="abrams"]');
  await page.fill('#hero-search', 'haze');
  await page.check('[data-h="haze"]');
  assert.deepEqual(await page.evaluate(async () => (await import('/js/state.js')).S.sel.sort()), [
    'abrams',
    'haze',
  ]);
  await page.fill('#hero-search', 'nothing-matches-this');
  assert(await page.locator('#hero-search-empty').isVisible());
  await page.click('#hreset');
  await page.fill('#hero-search', '');
  assert.equal(await page.locator('.hc:visible').count(), 42);
  await page.click('[data-tab="roulette"]');
  await page.locator('.board-options summary').click();
  await page.uncheck('#fsame');
  assert(await page.locator('#fpl').isEnabled());
  await page.check('#fsame');
  assert(await page.locator('#fpl').isDisabled());
  for (const language of ['ru', 'en']) {
    if ((await page.locator('html').getAttribute('lang')) !== language) await page.click('#lang');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of ['roulette', 'build', 'ban', 'custom', 'history']) {
        await page.click('[data-tab="' + tab + '"]');
        assert(await page.locator('#p-' + tab + ' h1').isVisible());
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'Overflow: ' + language + ' ' + tab + ' at ' + width,
        );
      }
    }
  }

  // Mode selection resets only the active view and survives reload and sharing.
  await page.click('[data-tab="roulette"]');
  for (const mode of ['street', 'ranked', 'normal']) {
    await page.click('[data-game-mode="' + mode + '"]');
    assert.equal(
      await page.locator('[data-game-mode="' + mode + '"]').getAttribute('aria-pressed'),
      'true',
    );
    if (mode !== 'normal') {
      assert.equal(await page.locator('#contract h2').count(), 1);
      assert.equal((await state()).cur, null);
    }
    await page.click('#spin');
    await page.waitForSelector('#contract h2');
    const result = (await state()).cur;
    assert.equal(result.opts.gameMode, mode);
    assert(
      await page.evaluate(async () => {
        const { RT } = await import('/js/state.js');
        return RT.cur.conds.every((id) =>
          (RT.data.challenges.find((c) => c.id === id).gameModes || ['normal']).includes(
            RT.cur.opts.gameMode,
          ),
        );
      }),
    );
    await receiver.goto(page.url());
    await receiver.waitForSelector('#contract h2');
    assert.equal(
      await receiver.evaluate(async () => (await import('/js/state.js')).S.gameMode),
      mode,
    );
    await page.reload();
    await page.waitForSelector('#spin');
    assert.equal(
      await page.locator('[data-game-mode="' + mode + '"]').getAttribute('aria-pressed'),
      'true',
    );
  }
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.click('#theme');
    for (const language of ['ru', 'en']) {
      if ((await page.locator('html').getAttribute('lang')) !== language) await page.click('#lang');
      await page.setViewportSize({ width: 320, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }

  // Build Lab: exact budgets, pins, shopping progress, persistence and single-item replacement.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('[data-tab="build"]');
  await page.click('[data-build-stage="full"]');
  await page.fill('#bud', '32000');
  await page.selectOption('#build-hero', 'abrams');
  await page.selectOption('#build-focus', 'spirit');
  await page.selectOption('#build-active', '0');
  await page.click('#rb');
  let lab = await page.evaluate(async () => (await import('/js/state.js')).RT.build);
  assert.equal(lab.hero, 'abrams');
  assert(lab.spent <= 32000);
  assert.equal(lab.settings.focus, 'spirit');
  await page.click('[data-build-lock="' + lab.items[0] + '"]');
  await page.check('[data-build-buy="' + lab.items[1] + '"]');
  await page.click('#rb');
  let regenerated = await page.evaluate(async () => (await import('/js/state.js')).RT.build);
  assert(regenerated.items.includes(lab.items[0]));
  assert(regenerated.items.includes(lab.items[1]));
  const replace = regenerated.items.find(
    (id) => !regenerated.locked.includes(id) && !regenerated.purchased.includes(id),
  );
  await page.click('[data-build-replace="' + replace + '"]');
  let replaced = await page.evaluate(async () => (await import('/js/state.js')).RT.build);
  assert(!replaced.items.includes(replace));
  assert(
    regenerated.items.filter((id) => id !== replace).every((id) => replaced.items.includes(id)),
  );
  await page.reload();
  await page.waitForSelector('#spin');
  await page.click('[data-tab="build"]');
  let saved = await page.evaluate(async () => (await import('/js/state.js')).RT.build);
  assert.deepEqual(saved.items, replaced.items);
  assert(saved.purchased.includes(lab.items[1]));
  await page.fill('#bud', '10');
  await page.click('#rb');
  assert.deepEqual(
    (await page.evaluate(async () => (await import('/js/state.js')).RT.build)).items,
    saved.items,
  );
  await page.fill('#bud', '32000');
  await page.locator('#build-hero').focus();
  await page.click('[data-tab="ban"]');
  await page.selectOption('#ban-hero', 'abrams');
  await page.click('[data-ban-type="ability"]');
  await page.selectOption('#ban-slot', '2');
  await page.click('#ban-roll');
  assert.equal(await page.locator('.ban-slot-map .blocked b').textContent(), '2');
  await page.click('[data-ban-type="item"]');
  await page.check('#ban-from-build');
  await page.click('#ban-roll');
  const ban = await page.evaluate(async () => (await import('/js/state.js')).RT.ban);
  assert(saved.items.includes(ban.item));
  for (const language of ['ru', 'en']) {
    if ((await page.locator('html').getAttribute('lang')) !== language) await page.click('#lang');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of ['build', 'ban']) {
        await page.click('[data-tab="' + tab + '"]');
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'Lab overflow ' + tab + ' ' + language + ' ' + width,
        );
      }
    }
  }
  // Export the displayed build, even after editing the next build's budget.
  await page.click('[data-tab="build"]');
  await page.fill('#bud', '4800');
  await page.evaluate(() => {
    window.__copyCalls = [];
    navigator.clipboard.writeText = async (text) => window.__copyCalls.push(text);
  });
  await page.click('#copy-game-build');
  await page.waitForSelector('#game-export-dialog[open]');
  assert(await page.locator('.export-challenge').isVisible());
  await page.locator('.export-challenge summary').click();
  assert((await page.locator('.export-challenge pre').textContent()).includes('1.'));
  const exportCode = await page.locator('#export-code').inputValue();
  assert(exportCode.startsWith('KLUv'));
  assert.equal(await page.evaluate(() => window.__copyCalls.at(-1)), exportCode);
  assert.equal(
    await page.evaluate(async () => {
      const { RT, S } = await import('/js/state.js');
      const { gameBuildCode, challengeForExport } = await import('/js/game-export.js');
      const { getDict } = await import('/js/i18n.js');
      return gameBuildCode(
        RT.build,
        RT.data.heroes,
        RT.data.items,
        challengeForExport(RT.cur, RT.data.heroes, RT.data.challenges, getDict(), S.lang),
      );
    }),
    exportCode,
  );
  await page.click('#export-copy-again');
  assert.equal(await page.evaluate(() => window.__copyCalls.length), 2);
  await page.keyboard.press('Escape');
  assert(await page.locator('#game-export-dialog').isHidden());
  assert(await page.locator('#copy-game-build').evaluate((el) => el === document.activeElement));
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw Error('denied');
    };
    document.execCommand = () => false;
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.click('#copy-game-build');
  await page.waitForSelector('#game-export-dialog[open]');
  assert.equal(await page.locator('#export-code').inputValue(), exportCode);
  assert(
    await page
      .locator('#export-code')
      .evaluate(
        (el) =>
          el === document.activeElement &&
          el.selectionStart === 0 &&
          el.selectionEnd === el.value.length,
      ),
  );
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (process.env.EXPORT_SCREENSHOT) await page.screenshot({ path: process.env.EXPORT_SCREENSHOT });
  await page.locator('#game-export-dialog [data-export-close]').first().click();
  assert.deepEqual(errors, []);
  console.log(
    'PASS browser: deep links, history, locks, clean-session replay, duplicate completion, hash changes, failed-roll transaction, empty builds/bans, corrupt storage, malformed links, language, mobile, offline PWA, cache isolation; no page errors.',
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
