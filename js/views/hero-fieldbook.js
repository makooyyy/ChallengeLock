// Editorial learning paths. Difficulty describes executing this plan, not a win-rate ranking.
const styles = {
  engage: {
    title: ['Инициатор', 'Initiator'],
    advantage: [
      'Начинает бой, пока союзники могут быстро подойти.',
      'Starts fights within follow-up range of allies.',
    ],
    risk: [
      'Если команда далеко, после входа придётся выживать в одиночку.',
      'An engage away from allies leaves you isolated.',
    ],
    rival: 'vindicta',
    matchup: [
      'Используй укрытия, чтобы сократить дистанцию до её огневой позиции. На открытой линии преимущество у Vindicta.',
      'Close on her firing position through cover. An open lane favors Vindicta.',
    ],
    picks: ['extra-stamina', 'reactive-barrier', 'warp-stone'],
  },
  gun: {
    title: ['Стрелок', 'Gunner'],
    advantage: ['Держит цель под непрерывным огнём.', 'Keeps sustained fire on an exposed target.'],
    risk: [
      'Укрытия и принудительное перемещение обрывают серию попаданий.',
      'Cover and forced movement break sustained hits.',
    ],
    rival: 'bebop',
    matchup: [
      'Стреляй из-за края укрытия. После промаха крюком можно дольше удерживать угол.',
      'Shoot from the edge of cover. A missed hook gives you longer to hold the angle.',
    ],
    picks: ['basic-magazine', 'bullet-lifesteal', 'intensifying-magazine'],
  },
  caster: {
    title: ['Контроль зоны', 'Zone control'],
    advantage: [
      'Заранее занимает проход и ограничивает подход к цели.',
      'Claims choke points before an objective fight.',
    ],
    risk: [
      'Если потратить способности на волну, соперник получает окно для входа.',
      'Spending abilities on a wave leaves an opening for a dive.',
    ],
    rival: 'lash',
    matchup: [
      'Проверь крыши перед боем. Сохрани выносливость, чтобы уйти с места приземления Lash.',
      'Check rooftops before committing. Save stamina to move out of Lash’s landing zone.',
    ],
    picks: ['extra-spirit', 'compress-cooldown', 'superior-cooldown'],
  },
  support: {
    title: ['Поддержка', 'Support'],
    advantage: [
      'Помогает союзнику пережить вход и вернуться в бой.',
      'Helps an ally survive an engage and rejoin the fight.',
    ],
    risk: [
      'Слишком большая дистанция до союзника лишает его помощи.',
      'An isolated ally is outside your protection.',
    ],
    rival: 'haze',
    matchup: [
      'Сохрани защиту для союзника, которого Haze застала отдельно. Подходи из укрытия.',
      'Save protection for the ally Haze isolates. Approach from cover.',
    ],
    picks: ['extra-regen', 'healing-booster', 'divine-barrier'],
  },
  flank: {
    title: ['Фланкер', 'Flanker'],
    advantage: [
      'Заходит сбоку, когда цель уже отвлечена союзником.',
      'Attacks from the side once an ally draws attention.',
    ],
    risk: [
      'Без пути отхода первый контроль часто заканчивает атаку.',
      'Without an escape route, the first disable can end the attack.',
    ],
    rival: 'mo-krill',
    matchup: [
      'Дождись, пока Mo & Krill потратят Combo, или атакуй с другого направления.',
      'Wait out Mo & Krill’s Combo or attack from another direction.',
    ],
    picks: ['extra-stamina', 'slowing-hex', 'warp-stone'],
  },
};
const damage = {
  gun: ['Оружие', 'Weapon'],
  spirit: ['Спиритизм', 'Spirit'],
  mixed: ['Смешанный', 'Mixed'],
};
const difficulty = [
  ['Доступная', 'Approachable'],
  ['Средняя', 'Intermediate'],
  ['Высокая', 'Advanced'],
];
// Hero ID, play style, execution difficulty, damage focus and signature ability (1–4).
const profiles = [
  ['abrams', 'engage', 0, 'mixed', 2],
  ['apollo', 'flank', 2, 'mixed', 2],
  ['bebop', 'engage', 1, 'spirit', 3],
  ['billy', 'engage', 1, 'mixed', 4],
  ['calico', 'flank', 2, 'spirit', 2],
  ['celeste', 'caster', 1, 'spirit', 3],
  ['deadman-danny', 'gun', 1, 'mixed', 1],
  ['drifter', 'flank', 2, 'mixed', 2],
  ['dynamo', 'support', 1, 'spirit', 4],
  ['graves', 'caster', 1, 'spirit', 2],
  ['grey-talon', 'gun', 1, 'mixed', 1],
  ['haze', 'gun', 1, 'gun', 1],
  ['holliday', 'engage', 2, 'mixed', 4],
  ['infernus', 'gun', 0, 'mixed', 3],
  ['ivy', 'support', 1, 'mixed', 2],
  ['kelvin', 'support', 0, 'spirit', 4],
  ['lady-geist', 'caster', 1, 'spirit', 4],
  ['lash', 'engage', 2, 'spirit', 1],
  ['mcginnis', 'caster', 0, 'mixed', 3],
  ['mina', 'flank', 2, 'mixed', 2],
  ['mirage', 'gun', 1, 'mixed', 3],
  ['mo-krill', 'engage', 0, 'mixed', 4],
  ['nurse-harrow', 'support', 1, 'spirit', 3],
  ['paige', 'support', 1, 'spirit', 2],
  ['paradox', 'engage', 2, 'mixed', 3],
  ['pocket', 'flank', 2, 'spirit', 2],
  ['rat-king', 'caster', 1, 'spirit', 2],
  ['rem', 'support', 1, 'spirit', 2],
  ['seven', 'caster', 0, 'spirit', 2],
  ['shiv', 'flank', 2, 'mixed', 4],
  ['silver', 'engage', 1, 'mixed', 3],
  ['sinclair', 'caster', 2, 'spirit', 3],
  ['solomon', 'caster', 2, 'spirit', 3],
  ['the-doorman', 'engage', 2, 'spirit', 2],
  ['venator', 'gun', 1, 'mixed', 3],
  ['victor', 'engage', 0, 'spirit', 3],
  ['vindicta', 'gun', 1, 'mixed', 4],
  ['viscous', 'support', 2, 'spirit', 2],
  ['vyper', 'gun', 2, 'gun', 3],
  ['warden', 'engage', 0, 'mixed', 3],
  ['wraith', 'gun', 0, 'gun', 4],
  ['yamato', 'flank', 2, 'mixed', 2],
];
const drills = {
  apollo: [
    'Отработай Riposte против предсказуемого удара. После успешного ответа проверь дистанцию для Flawless Advance.',
    'Practice Riposte against a predictable hit, then check your reach with Flawless Advance.',
  ],
  billy: [
    'Перед Chain Gang найди двух противников рядом и проверь, сможет ли союзник сразу открыть огонь.',
    'Before Chain Gang, find two nearby opponents and check that an ally can shoot immediately.',
  ],
  calico: [
    'Начни с Gloom Bombs из укрытия. Перед Leaping Slash выбери, куда отойдёшь после удара.',
    'Throw Gloom Bombs from cover. Before Leaping Slash, choose where to retreat after the hit.',
  ],
  celeste: [
    'Бросай Radiant Daggers сначала с места, затем в движении. Сравни попадания на краю дистанции.',
    'Try Radiant Daggers standing still and while strafing. Compare hits at the edge of your range.',
  ],
  'deadman-danny': [
    'Выпусти Strix Salvo по движущейся цели. Повтори с возвышения и сравни, сколько снарядов попало.',
    'Use Strix Salvo on a moving target. Repeat from high ground and compare how many shots connect.',
  ],
  drifter: [
    "Отметь изолированную цель через Stalker's Mark. Прежде чем преследовать её, проверь ближайший выход с линии.",
    "Mark an isolated target with Stalker's Mark. Check the nearest exit before committing to the chase.",
  ],
  dynamo: [
    'Договорись, кто откроет огонь во время Singularity. Потренируй вход так, чтобы цель оставалась видна союзнику.',
    'Pick an ally to follow up on Singularity. Practice engaging where that ally can see the target.',
  ],
  graves: [
    'Поставь Grasping Hands в узком проходе. Сравни с применением на открытой линии, где цель может обойти зону.',
    'Place Grasping Hands in a choke. Compare it with an open lane where the opponent can walk around it.',
  ],
  'grey-talon': [
    'Размести Spirit Snare на пути отхода соперника и прицелься Charged Shot в этот проход.',
    'Place Spirit Snare on an escape route and aim Charged Shot down that path.',
  ],
  holliday: [
    'До Spirit Lasso выбери конечную точку рядом с союзниками. Пройди маршрут с Bounce Pad в песочнице.',
    'Before Spirit Lasso, choose an endpoint near allies. Rehearse the route with Bounce Pad in the Sandbox.',
  ],
  infernus: [
    'Удерживай огонь до срабатывания Afterburn. Когда цель уходит за угол, реши, хватит ли Flame Dash и для выхода.',
    'Keep firing until Afterburn triggers. When the target turns a corner, consider your escape before spending Flame Dash.',
  ],
  ivy: [
    'Перед Kudzu Connection выбери союзника, за которым сможешь двигаться под прикрытием. Проследи, когда связь обрывается.',
    'Before Kudzu Connection, pick an ally you can follow behind cover. Observe when the link breaks.',
  ],
  kelvin: [
    'До Frozen Shelter реши, кого оставить внутри. Потренируй установку на краю боя, чтобы сохранить союзнику путь к укрытию.',
    'Decide who belongs inside Frozen Shelter. Practice placing it at the edge of a fight with cover available to an ally.',
  ],
  'lady-geist': [
    'Перед Soul Exchange сравни своё здоровье со здоровьем цели и проверь дистанцию в песочнице.',
    'Compare your health with the target’s before Soul Exchange and practice the cast distance in the Sandbox.',
  ],
  mcginnis: [
    'Поставь Spectral Wall за целью. Проверь со стороны союзника, что стена не закрыла ему линию огня.',
    'Place Spectral Wall behind the target. Check from an ally’s perspective that it leaves the firing line open.',
  ],
  mina: [
    'Потренируй короткий выход с Rake и возврат через Sanguine Retreat. Проверь место, где закончится отступление.',
    'Practice a short trade with Rake and escape using Sanguine Retreat. Check where the retreat ends.',
  ],
  mirage: [
    "Следи за отметкой Djinn's Mark во время перестрелки. Сравни раннее применение и более длинную серию попаданий.",
    "Watch Djinn's Mark during a trade. Compare activating early with landing a longer string of shots.",
  ],
  'mo-krill': [
    'Подойди через Burrow и дождись, пока союзник увидит цель, прежде чем применять Combo.',
    'Approach with Burrow and wait until an ally has line of sight before using Combo.',
  ],
  'nurse-harrow': [
    'Попробуй Healing Needles на союзнике в движении. Найди угол, откуда видна его следующая позиция.',
    'Practice Healing Needles on a moving ally. Find an angle covering their next position.',
  ],
  paige: [
    'Дай Plot Armor союзнику перед ожидаемым входом. Сравни с поздним применением после первого попадания.',
    'Give an ally Plot Armor before an expected engage. Compare with casting after the first hit.',
  ],
  pocket: [
    "Отправь Flying Cloak к укрытию до входа в драку. Отработай возврат через плащ после Enchanter's Satchel.",
    "Send Flying Cloak toward cover before engaging. Practice escaping to it after Enchanter's Satchel.",
  ],
  'rat-king': [
    'Направь Rat Swarm туда, куда движется цель, и сравни результат с атакой по её исходной позиции.',
    'Aim Rat Swarm along the target’s path and compare with aiming at its starting position.',
  ],
  rem: [
    'Выбери носителя для Tag Along и проверь, где окажешься после выхода, если союзник сменит высоту.',
    'Choose a carrier for Tag Along and check your exit position if your ally changes elevation.',
  ],
  shiv: [
    'После Serrated Knives следи за здоровьем цели. Перед Killing Blow проверь индикатор добивания.',
    'Track the target’s health after Serrated Knives. Check the execute indicator before using Killing Blow.',
  ],
  silver: [
    'Попади Entangling Bola по движущейся цели. Сравни подход сбоку и выстрел вдоль узкого прохода.',
    'Land Entangling Bola on a moving target. Compare a side angle with aiming down a choke.',
  ],
  sinclair: [
    'После Rabbit Hex прицелься Vexing Bolt. Попробуй повторить с бокового угла через Spectral Assistant.',
    'Follow Rabbit Hex with an aimed Vexing Bolt. Try again from a side angle using Spectral Assistant.',
  ],
  solomon: [
    'Проверь, какие выходы перекрывает Rook Battery. Повтори расстановку у другого прохода и сравни свободные пути.',
    'Check which exits Rook Battery covers. Try another choke and compare the paths left open.',
  ],
  'the-doorman': [
    'До Doorway выбери вход и выход за укрытием. Проверь маршрут в обе стороны, прежде чем звать союзника.',
    'Choose a sheltered entrance and exit for Doorway. Test the route in both directions before inviting an ally.',
  ],
  venator: [
    'Поставь Hex-Lined Snap Trap на путь к укрытию и заранее выбери позицию для стрельбы по пойманной цели.',
    'Place Hex-Lined Snap Trap on the route to cover and choose a firing angle on the trapped target.',
  ],
  victor: [
    'Пройди рядом с движущейся целью с Aura of Suffering. Отметь, на каком расстоянии контакт теряется.',
    'Follow a moving target with Aura of Suffering and note the distance at which it loses contact.',
  ],
  viscous: [
    'Договорись с союзником о The Cube. Попробуй защитить его после вражеского входа и прикрой место выхода.',
    'Coordinate The Cube with an ally. Protect them during an enemy engage and cover their exit position.',
  ],
  vyper: [
    'Пройди одну линию огня с обычным движением, затем со Slither. Сравни, сколько попаданий удерживаешь в скольжении.',
    'Strafe across a firing lane, then repeat with Slither. Compare how many shots stay on target while sliding.',
  ],
  warden: [
    'Направь Binding Word на соперника рядом с укрытием. Следи, куда он отходит, и перекрой этот путь с союзником.',
    'Apply Binding Word near cover. Watch the escape direction and cut it off with an ally.',
  ],
  yamato: [
    'Проверь дальность Flying Slash, затем отработай Crimson Slash после сближения. Выбери путь отхода до входа.',
    'Test the range of Flying Slash and follow up with Crimson Slash. Choose an escape route before committing.',
  ],
  abrams: [
    'Направь Shoulder Charge в стену, затем подойди для Siphon Life.',
    'Aim Shoulder Charge into a wall, then move close for Siphon Life.',
  ],
  bebop: [
    'Попади Grapple Arm, прикрепи Sticky Bomb и выбери направление Exploding Uppercut.',
    'Land Grapple Arm, attach Sticky Bomb and aim Exploding Uppercut.',
  ],
  haze: [
    'После Sleep Dagger займи угол для стрельбы до первого выстрела по спящей цели.',
    'After Sleep Dagger, reposition for sustained fire before waking the target.',
  ],
  lash: [
    'Набери высоту с Grapple, выбери место приземления Ground Strike и оставь путь отхода.',
    'Gain height with Grapple, aim Ground Strike and keep an escape route.',
  ],
  paradox: [
    'Заряди Kinetic Carbine, поставь Time Wall между собой и целью, затем прицелься для Paradoxical Swap.',
    'Charge Kinetic Carbine, place Time Wall between you and the target, then aim Paradoxical Swap.',
  ],
  seven: [
    'Отметь цель Static Charge и направь Lightning Ball туда, где её застанет оглушение.',
    'Mark with Static Charge and send Lightning Ball where the stun will catch the target.',
  ],
  vindicta: [
    'Ограничь движение через Stake и подготовь линию видимости для Assassinate.',
    'Restrict movement with Stake and line up Assassinate.',
  ],
  wraith: [
    'Подготовь Card Trick до входа, дождись подъёма от Telekinesis и сосредоточь огонь.',
    'Prepare Card Trick, wait for the Telekinesis lift, then focus fire.',
  ],
};
let chosen = 'abrams';
export function renderHeroes(root, heroes, items, lang, esc, tile) {
  const i = Number(lang === 'en'),
    l = (ru, en) => (i ? en : ru);
  const byId = new Map(heroes.map((h) => [h.id, h]));
  function select(label, key, entries) {
    return (
      '<label>' +
      label +
      '<select data-filter-hero="' +
      key +
      '"><option value="">' +
      l('Все', 'All') +
      '</option>' +
      entries.map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('') +
      '</select></label>'
    );
  }
  root.innerHTML =
    '<section class="guide-sheet"><h2>' +
    l('Досье героев', 'Hero dossiers') +
    '</h2><div class="field-filters">' +
    select(
      l('Роль', 'Role'),
      'role',
      Object.entries(styles).map(([k, v]) => [k, v.title[i]]),
    ) +
    select(
      l('Сложность', 'Difficulty'),
      'level',
      difficulty.map((v, k) => [k, v[i]]),
    ) +
    select(
      l('Фокус урона', 'Damage focus'),
      'damage',
      Object.entries(damage).map(([k, v]) => [k, v[i]]),
    ) +
    '</div></section><section class="guide-sheet hero-dossier"></section>';
  const content = root.querySelector('.hero-dossier');
  const filters = [...root.querySelectorAll('[data-filter-hero]')];
  function draw() {
    const available = profiles.filter(
      ([id, ...fields]) =>
        byId.has(id) && filters.every((s, k) => s.value === '' || String(fields[k]) === s.value),
    );
    if (!available.length) {
      content.textContent = l(
        'Нет героев с таким сочетанием. Измени любой фильтр.',
        'No matching heroes. Change a filter.',
      );
      return;
    }
    const [id, role, level, type, slot] =
      available.find((row) => row[0] === chosen) || available[0];
    chosen = id;
    const h = byId.get(id),
      style = styles[role],
      ability = h.abilityDetails[slot - 1].name;
    const headings = [
      l('На линии', 'Lane'),
      l('Середина игры', 'Mid game'),
      l('Поздняя игра', 'Late game'),
    ];
    const drill =
      drills[id]?.[i] ||
      l(
        'В песочнице проверь дистанцию ' +
          ability +
          '. Затем повтори приём на движущейся цели: выбери угол подхода, примени способность и вернись за укрытие.',
        'In the Sandbox, test the reach of ' +
          ability +
          '. Repeat against a moving target: choose an approach angle, use the ability and get back to cover.',
      );
    content.innerHTML =
      '<label>' +
      l('Герой', 'Hero') +
      '<select data-dossier>' +
      available
        .map(
          ([k]) =>
            '<option value="' +
            k +
            '" ' +
            (k === id ? 'selected' : '') +
            '>' +
            esc(byId.get(k).name) +
            '</option>',
        )
        .join('') +
      '</select></label><div class="field-match"><div class="guide-portrait"><div><small>' +
      style.title[i] +
      '</small><strong>' +
      esc(h.name) +
      '</strong></div><img src="assets/portraits/' +
      id +
      '.webp" alt=""></div><div><h3>' +
      difficulty[level][i] +
      ' · ' +
      damage[type][i] +
      '</h3><p>' +
      style.advantage[i] +
      '</p><p>' +
      style.risk[i] +
      '</p><h3>' +
      l('Против ', 'Against ') +
      esc(byId.get(style.rival)?.name || style.rival) +
      '</h3><p>' +
      style.matchup[i] +
      '</p></div></div><h3>' +
      l('Способности и тренировка', 'Abilities and practice') +
      '</h3><ol>' +
      h.abilityDetails.map((a) => '<li>' + esc(a.name) + '</li>').join('') +
      '</ol><p><b>' +
      esc(ability) +
      '</b> · ' +
      esc(drill) +
      '</p><h3>' +
      l('Пример покупок по этапам', 'Sample purchases by phase') +
      '</h3><div class="field-answers">' +
      style.picks
        .map((k, n) => '<article><h4>' + headings[n] + '</h4>' + tile(items.get(k)) + '</article>')
        .join('') +
      '</div><small>' +
      l(
        'Роль, сложность и покупки — ориентиры для этого плана игры.',
        'Role, difficulty and purchases describe this suggested playstyle.',
      ) +
      '</small>';
    content.querySelector('[data-dossier]').onchange = (e) => {
      chosen = e.target.value;
      draw();
      content.querySelector('select').focus();
    };
  }
  filters.forEach((s) => (s.onchange = draw));
  draw();
}
