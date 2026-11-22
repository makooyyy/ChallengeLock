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
  assert.equal(await page.locator('.journal-record').count(), 0);
  await page.click('[data-tab="roulette"]');
  assert(await page.locator('#spin').isVisible());
  await page.click('[data-lock="0"]');
  await page.click('[data-lock="1"]');
  assert(await page.locator('#reroll').isDisabled());
  await page.click('[data-lock="1"]');
  await page.click('#reroll');
  await page.waitForFunction(async () => !(await import('/js/state.js')).RT.busy);
  const rerolled = await state();
  assert.equal(rerolled.cur.hero, initial.hero);
  assert.notEqual(rerolled.cur.conds[0], initial.conds[0]);
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
  await page.click('#accept-contract');
  await page.click('#contract-build');
  assert.equal(await page.locator('#build-hero').inputValue(), (await state()).cur.hero);
  await page.click('[data-tab="roulette"]');
  await page.click('#done');
  async function checkResultContrast() {
    const minimum = await page.locator('.completion-card').evaluate((card) => {
      const root = document.documentElement;
      const previous = root.getAttribute('data-theme');
      const luminance = (color) => {
        const rgb = color
          .match(/\d+/g)
          .slice(0, 3)
          .map((n) => Number(n) / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      let min = Infinity;
      for (const theme of ['light', 'dark']) {
        root.setAttribute('data-theme', theme);
        const bg = luminance(getComputedStyle(card).backgroundColor);
        for (const el of card.querySelectorAll(
          'h2,h3,p,small,.eyebrow,.completion-seed,.completion-paper-head span,.completion-rules b,.completion-bottom > span',
        )) {
          const fg = luminance(getComputedStyle(el).color);
          min = Math.min(min, (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05));
        }
      }
      if (previous === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previous);
      return min;
    });
    assert(minimum >= 4.5, 'Result text contrast: ' + minimum);
  }
  await checkResultContrast();
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
  const currentSeed = (await state()).cur.seed;
  await page.click('.journal-record summary');
  assert(await page.locator('#p-history').isVisible());
  assert.equal((await state()).cur.seed, currentSeed);
  await page.click('[data-journal-stamp]');
  assert(await page.locator('.result-seal').isVisible());
  await page.keyboard.press('Escape');
  await page.click('[data-journal-repeat]');
  assert(await page.locator('#accept-contract').isVisible());
  assert.notEqual((await state()).cur.seed, currentSeed);
  assert.deepEqual((await state()).cur.conds, rerolled.cur.conds);
  assert.equal((await state()).stats.done, completed);
  await page.evaluate(() => (location.hash = '#seed=change&d=easy&r=0&p=2'));
  await page.waitForFunction(async () => (await import('/js/state.js')).S.diff === 'easy');
  await page.evaluate(() => (location.hash = '#seed=change&d=hard&r=0&p=3'));
  await page.waitForFunction(async () => (await import('/js/state.js')).S.friend.player === 3);
  assert.equal((await state()).diff, 'hard');
  const beforeFailure = (await state()).stats;
  await page.click('#accept-contract');
  await page.click('#failb');
  assert.equal(await page.locator('#completion-dialog').getAttribute('data-outcome'), 'fail');
  await checkResultContrast();
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
  // Enter settings directly from the roulette and restore keyboard focus on return.
  await page.click('#configure-pool');
  assert(await page.locator('#hero-search').evaluate((el) => el === document.activeElement));
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
  assert.equal(await page.locator('[data-pool-label]').first().textContent(), 'In pool');
  await page.click('#back-to-roll');
  assert(await page.locator('#configure-pool').evaluate((el) => el === document.activeElement));
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
  await page.click('#build-advanced summary');
  await page.selectOption('#build-focus', 'spirit');
  await page.selectOption('#build-active', '0');
  await page.click('#rb');
  let lab = await page.evaluate(async () => (await import('/js/state.js')).RT.build);
  assert.equal(lab.hero, 'abrams');
  assert(lab.spent <= 32000);
  assert.equal(lab.settings.focus, 'spirit');
  const chart = page.locator('.skill-scroll');
  assert.equal(await chart.locator('thead th').count(), 17);
  assert.equal(await chart.locator('tbody tr').count(), 4);
  for (const row of await chart.locator('tbody tr').all()) {
    assert.deepEqual(await row.locator('.skill-mark').allTextContents(), ['◆', '1', '2', '5']);
  }
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
  await page.locator('[data-choose-item]').first().click();
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
  await page.locator('[data-buy-next]').click();
  await page.click('#undo-buy');
  await page.click('#compare-build');
  await page.waitForSelector('#swap-build');
  await page.click('#swap-build');
  assert.deepEqual(
    await page.evaluate(async () => (await import('/js/state.js')).RT.build.items),
    saved.items,
  );
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
  assert(await page.locator('#apply-ban').isVisible());
  await page.click('#apply-ban');
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
  await page.click('[data-tab="roulette"]');
  await page.click('#accept-contract');
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
      const note = challengeForExport(
        RT.cur,
        RT.data.heroes,
        RT.data.challenges,
        getDict(),
        S.lang,
      );
      const { rule } = await import('/js/ban-ui.js');
      note.text += '\n\n' + getDict()[S.lang].oneMatchRule + ' · ' + rule(RT.ban);
      return gameBuildCode(RT.build, RT.data.heroes, RT.data.items, note);
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
  // Desktop compact mode has its own match-first layout and rejects stale outcomes.
  const desk = await browser.newContext({
    viewport: { width: 430, height: 580 },
    reducedMotion: 'reduce',
  });
  await desk.addInitScript(() => {
    window.challengeLockDesktop = {
      isDesktop: true,
      appVersion: async () => '1.33.0',
      minimizeWindow: () => (window.__windowAction = 'minimize'),
      maximizeWindow: () => (window.__windowAction = 'maximize'),
      closeWindow: () => (window.__windowAction = 'close'),
      reportContract: (c) => (window.__contract = c),
      onSpin: (f) => (window.__spin = f),
      onOutcome: (f) => (window.__outcome = f),
      onMatch: (f) => (window.__match = f),
      matchState: async () => ({ phase: 'waiting', api: 'disabled' }),
      onCompact: (f) => (window.__compact = f),
      compactState: async () => true,
      toggleCompact: () => window.__compact(false),
    };
  });
  const compactPage = await desk.newPage();
  compactPage.on('pageerror', (e) => errors.push(e.message));
  await compactPage.goto(origin + '/#seed=compact&d=insane&r=0');
  await compactPage.waitForSelector('html.desktop-compact');
  assert.equal(await compactPage.locator('.titlebar-version').textContent(), '1.33.0');
  assert.equal(
    await compactPage.locator('.titlebar').evaluate((el) => getComputedStyle(el).webkitAppRegion),
    'drag',
  );
  assert.equal(
    await compactPage
      .locator('.titlebar-controls')
      .evaluate((el) => getComputedStyle(el).webkitAppRegion),
    'no-drag',
  );
  const controls = compactPage.locator('.titlebar-button');
  const bounds = await controls.evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      const glyph = button.querySelector('svg').getBoundingClientRect();
      return [
        box.width,
        box.height,
        box.y,
        glyph.width,
        glyph.height,
        glyph.x - box.x,
        glyph.y - box.y,
      ];
    }),
  );
  assert.equal(bounds.length, 3);
  assert.deepEqual(bounds[0], bounds[1]);
  assert.deepEqual(bounds[1], bounds[2]);
  for (const action of ['minimize', 'maximize', 'close']) {
    await compactPage.locator('[data-window-action="' + action + '"]').click();
    assert.equal(await compactPage.evaluate(() => window.__windowAction), action);
  }
  assert(await compactPage.locator('.hero-display').isVisible());
  assert(await compactPage.locator('.studio-intro').isHidden());
  assert((await compactPage.locator('.hero-display').boundingBox()).y < 180);
  assert((await compactPage.locator('.condition-result').first().boundingBox()).y < 260);
  assert(await compactPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await compactPage.click('#accept-contract');
  await compactPage.locator('[data-progress]').first().click();
  await compactPage.reload();
  await compactPage.waitForSelector('[data-progress][aria-pressed="true"]');
  await compactPage.evaluate(() =>
    window.__match({
      key: window.__contract.key,
      phase: 'playing',
      startedAt: Date.now() - 4000,
      api: 'ready',
    }),
  );
  assert(await compactPage.evaluate(async () => (await import('/js/state.js')).RT.timer.run));
  await compactPage.evaluate(() =>
    window.__match({
      key: window.__contract.key,
      phase: 'ended',
      durationMs: 90000,
      api: 'waiting',
    }),
  );
  assert.equal(
    await compactPage.evaluate(async () => (await import('/js/state.js')).RT.timer.run),
    false,
  );
  assert.equal(await compactPage.locator('#tm, #tgl, .contract-hero').count(), 0);
  assert.equal(
    await compactPage.evaluate(async () => (await import('/js/state.js')).RT.timer.ms),
    90000,
  );
  await compactPage.evaluate(() =>
    window.__match({
      key: window.__contract.key,
      phase: 'ended',
      api: 'verified',
      checks: window.__contract.conditions.map((c, i) => ({
        ...c,
        status: i === 1 ? 'pass' : 'manual',
        value: 3,
        target: 2,
      })),
    }),
  );
  assert(
    (await compactPage.locator('#contract [data-match-status]').textContent()).includes(
      'Осталось подтвердить вручную',
    ),
  );
  assert.equal(
    await compactPage.evaluate(() => window.__contract.conditions.filter((c) => c.checked).length),
    2,
  );
  await compactPage.evaluate(() => window.__outcome({ key: 'stale', outcome: 'done' }));
  assert.equal(
    await compactPage.evaluate(async () => (await import('/js/state.js')).RT.finished),
    false,
  );
  await compactPage.evaluate(() =>
    window.__match({
      key: window.__contract.key,
      phase: 'ended',
      api: 'verified',
      durationMs: 90000,
      outcome: 'done',
      checks: [],
    }),
  );
  assert(await compactPage.locator('#completion-dialog').isVisible());
  await compactPage.keyboard.press('Escape');
  if (process.env.COMPACT_SCREENSHOT)
    await compactPage.screenshot({ path: process.env.COMPACT_SCREENSHOT });
  await compactPage.locator('.compact-exit').click();
  assert(await compactPage.locator('.studio-intro').isVisible());
  assert.equal(await compactPage.evaluate(() => window.__contract.outcome), 'done');
  const shopPage = await desk.newPage();
  await shopPage.route('**/mod/state', (route) =>
    route.fulfill({
      json: {
        hero: 'Abrams',
        conditions: [
          { name: 'Remaining', desc: 'Finish this', checked: false },
          { name: 'Already marked', desc: '', checked: true },
        ],
        ban: 'Rule',
        next: 'Item',
        cost: 800,
        buildHero: 'Abrams',
      },
    }),
  );
  await shopPage.goto(origin + '/desktop/mod-shop.html');
  await shopPage.waitForSelector('#next:text("Item")');
  assert.equal(await shopPage.locator('#conditions li').count(), 1);
  assert.match(await shopPage.locator('#checked').textContent(), /1 \/ 2/);
  assert.match(await shopPage.locator('#price').textContent(), /800/);
  assert(
    await shopPage
      .locator('#price')
      .evaluate(
        (el) =>
          el.getBoundingClientRect().bottom <=
          document.querySelector('#ban').getBoundingClientRect().top,
      ),
  );
  await shopPage.close();
  // Exercise the actual overlay document, including CSS hidden/overflow behavior.
  const overlayPage = await desk.newPage();
  await overlayPage.setViewportSize({ width: 360, height: 220 });
  await overlayPage.addInitScript(() => {
    window.challengeLockDesktop = {
      onOverlay: (fn) => (window.__overlay = fn),
      onOverlayTimer: (fn) => (window.__timer = fn),
    };
  });
  overlayPage.on('pageerror', (e) => errors.push(e.message));
  await overlayPage.goto(origin + '/desktop/overlay.html');
  const contract = {
    key: 'overlay-test',
    hero: 'Rem',
    lang: 'ru',
    timer: '02:15',
    conditions: Array.from({ length: 3 }, (_, i) => ({
      name: 'Условие ' + i,
      desc: 'В каждом сыгранном раунде получи хотя бы одно убийство или содействие.',
    })),
  };
  await overlayPage.evaluate((contract) => window.__overlay({ contract, settings: {} }), contract);
  assert(await overlayPage.locator('#build').isHidden());
  assert.equal(await overlayPage.locator('.condition').count(), 3);
  assert(
    await overlayPage.evaluate(() => {
      const el = document.querySelector('.content');
      el.scrollTop = el.scrollHeight;
      const last = document.querySelector('.condition:last-child').getBoundingClientRect();
      return (
        el.clientHeight > 80 &&
        el.scrollTop > 0 &&
        last.bottom <= el.getBoundingClientRect().bottom + 1
      );
    }),
  );
  await overlayPage.evaluate(
    (contract) =>
      window.__overlay({
        contract,
        settings: { showHero: false, showConditions: false, showTimer: false, showStatus: false },
      }),
    contract,
  );
  for (const selector of ['.header', '#conditions', '#timer', '#status', '#build'])
    assert(await overlayPage.locator(selector).isHidden(), selector);
  for (const outcome of ['done', 'fail']) {
    await overlayPage.evaluate((contract) => window.__overlay({ contract, settings: {} }), {
      ...contract,
      outcome,
    });
    assert.equal(
      await overlayPage.locator('#status').textContent(),
      outcome === 'done' ? 'Выполнено' : 'Провал',
    );
  }
  await overlayPage.evaluate(() =>
    window.__overlay({
      contract: null,
      build: { complete: true, items: ['a'], purchased: ['a'], lang: 'en' },
      settings: {},
    }),
  );
  assert(await overlayPage.locator('#build').isVisible());
  assert.equal(await overlayPage.locator('#build-name').textContent(), 'Build complete');
  await overlayPage.evaluate(() =>
    window.__overlay({
      contract: null,
      build: { nextItem: 'Item' },
      settings: { showBuild: false },
    }),
  );
  assert(await overlayPage.locator('#build').isHidden());
  await compactPage.evaluate(async () => {
    const { RT } = await import('/js/state.js');
    const { renderBuilder } = await import('/js/builder-ui.js');
    const { buildSettings } = await import('/js/build-config.js');
    const { makeBuild } = await import('/js/builds.js');
    RT.build = makeBuild(
      'overlay-complete',
      RT.data.heroes,
      RT.data.items,
      8000,
      { excluded: [], only: [] },
      buildSettings(),
    );
    window.challengeLockDesktop.reportBuild = (build) => (window.__reportedBuild = build);
    RT.build.purchased = [...RT.build.items];
    renderBuilder();
  });
  assert.equal(await compactPage.evaluate(() => window.__reportedBuild.complete), true);
  assert.equal(await compactPage.evaluate(() => window.__reportedBuild.nextItem), null);
  await desk.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS browser: deep links, history, locks, clean-session replay, duplicate completion, hash changes, failed-roll transaction, empty builds/bans, corrupt storage, malformed links, language, mobile, offline PWA, cache isolation; no page errors.',
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
