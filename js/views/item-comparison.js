export function purchaseQuote(item, catalog, purchased) {
  const credit = [];
  const seen = new Set();
  function visit(id) {
    if (seen.has(id)) return;
    seen.add(id);
    const part = catalog.get(id);
    if (!part) return;
    if (purchased.has(id)) credit.push(part);
    else part.components.forEach(visit);
  }
  visit(item.id);
  return {
    owned: purchased.has(item.id),
    credit,
    remaining: Math.max(0, item.cost - credit.reduce((sum, c) => sum + c.cost, 0)),
  };
}

let pair = ['', ''];
export function setupComparison(container, items, dictionary, lang, getBuild, escape) {
  const l = (ru, en) => (lang === 'en' ? en : ru),
    catalog = new Map(items.map((x) => [x.id, x]));
  const details = document.createElement('details');
  details.className = 'guide-sheet purchase-comparison';
  details.innerHTML =
    '<summary>' +
    l('Сравнить две покупки', 'Compare two purchases') +
    '</summary><div data-content></div>';
  container.prepend(details);
  const draw = () => {
    const build = getBuild(),
      purchased = new Set(build?.purchased || []);
    const selected = pair.map((id) => catalog.get(id));
    const quote = selected.map((x) => x && purchaseQuote(x, catalog, purchased));
    const localized = selected.map((x) => x && dictionary[x.id][lang]);
    const names = items.map((x) => [x.id, escape(x.name)]);
    const money = (n) => n.toLocaleString(lang) + ' ' + l('душ', 'souls');
    const renderRow = (label, values) =>
      '<tr><th scope="row">' +
      escape(label) +
      '</th>' +
      values.map((v) => '<td>' + (v || '—') + '</td>').join('') +
      '</tr>';
    const rows = [
      renderRow(
        l('Цена в магазине', 'Shop price'),
        selected.map((x) => x && money(x.cost)),
      ),
      renderRow(
        l('Осталось заплатить', 'Still to pay'),
        quote.map((q) => q && (q.owned ? l('Уже куплено', 'Already owned') : money(q.remaining))),
      ),
      renderRow(
        l('Зачтено из билда', 'Credit from build'),
        quote.map((q) => q?.credit.map((x) => escape(x.name)).join(', ')),
      ),
      renderRow(
        l('Рецепт', 'Recipe'),
        selected.map((x) =>
          x?.components.map((id) => escape(catalog.get(id)?.name || id)).join(', '),
        ),
      ),
    ];
    const sections = ['innate', 'passive', 'active'];
    for (const kind of sections) {
      const blocks = localized.map(
        (d) => d?.sections.filter((s) => s.kind === kind).flatMap((s) => s.blocks) || [],
      );
      if (!blocks.some((b) => b.length)) continue;
      const title = {
        innate: l('Характеристики', 'Attributes'),
        passive: l('Пассивное', 'Passive'),
        active: l('Активное', 'Active'),
      }[kind];
      rows.push('<tr><th class="compare-section" colspan="3">' + title + '</th></tr>');
      const desc = blocks.map((list) =>
        list
          .filter((b) => b.desc)
          .map((b) => escape(b.desc))
          .join('<br>'),
      );
      if (desc.some(Boolean)) rows.push(renderRow(l('Эффект', 'Effect'), desc));
      const stats = blocks.map((list) => list.flatMap((b) => b.stats));
      for (const label of new Set(stats.flat().map(([name]) => name))) {
        rows.push(
          renderRow(
            label,
            stats.map((list) =>
              list
                .filter(([name]) => name === label)
                .map(([, v]) => escape(v))
                .join(' / '),
            ),
          ),
        );
      }
    }
    const diff = quote.every(Boolean) ? quote[1].remaining - quote[0].remaining : null;
    const delta =
      diff === null
        ? ''
        : diff === 0
          ? l('Доплата одинакова', 'Same remaining cost')
          : escape(selected[diff > 0 ? 0 : 1].name) +
            ' · ' +
            l('дешевле на ', 'cheaper by ') +
            money(Math.abs(diff));
    details.querySelector('[data-content]').innerHTML =
      '<p>' +
      l(
        'В доплате учтены компоненты, отмеченные купленными в текущем билде.',
        'Remaining cost credits components marked as purchased in your current build.',
      ) +
      '</p><div class="compare-selects">' +
      pair
        .map(
          (id, i) =>
            '<label>' +
            l('Предмет ', 'Item ') +
            (i + 1) +
            '<select data-side="' +
            i +
            '"><option value="">' +
            l('Выбери предмет', 'Choose item') +
            '</option>' +
            names
              .map(
                ([value, name]) =>
                  '<option value="' +
                  value +
                  '" ' +
                  (id === value ? 'selected' : '') +
                  ' ' +
                  (pair[1 - i] === value ? 'disabled' : '') +
                  '>' +
                  name +
                  '</option>',
              )
              .join('') +
            '</select></label>',
        )
        .join('') +
      '</div>' +
      (selected.some(Boolean)
        ? '<p aria-live="polite">' +
          delta +
          '</p><table><thead><tr><th></th>' +
          selected
            .map(
              (x) =>
                '<th scope="col">' +
                (x
                  ? '<img src="assets/guide-items/' + x.id + '.webp" alt="">' + escape(x.name)
                  : '—') +
                '</th>',
            )
            .join('') +
          '</tr></thead><tbody>' +
          rows.join('') +
          '</tbody></table>'
        : '');
  };
  details.onchange = (e) => {
    const i = Number(e.target.dataset.side);
    pair[i] = e.target.value;
    draw();
    details.querySelector('[data-side="' + i + '"]').focus();
  };
  details.ontoggle = () => {
    if (details.open) draw();
  };
  draw();
  return (id) => {
    if (!pair.includes(id)) pair[pair[0] ? 1 : 0] = id;
    details.open = true;
    draw();
    details.scrollIntoView({ block: 'start' });
    details.querySelector('[data-side="' + (pair.indexOf(id) === 0 ? 1 : 0) + '"]').focus();
  };
}
