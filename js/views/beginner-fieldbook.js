const glossary = [
  [
    'Души / Souls',
    'Souls',
    'Валюта для покупки предметов. Перед возвращением на линию реши, какую покупку делаешь следующей.',
    'Currency used in the shop. Choose your next purchase before returning to lane.',
  ],
  [
    'Дэнай / Deny',
    'Deny',
    'Выстрел по доступной вражеской сфере душ. Следи, где появился шар после гибели крипа.',
    'Shoot an eligible enemy soul orb. Watch where the orb appears after a trooper dies.',
  ],
  [
    'Парирование / Parry',
    'Parry',
    'Ответ на удар ближнего боя. Тренируйся реагировать на замах и учитывай перезарядку после промаха.',
    'A defense against melee. Practice reacting to the wind-up and respect the cooldown after a miss.',
  ],
  [
    'Зиплайн / Zipline',
    'Zipline',
    'Транспорт между базой и линией. Проверь место высадки, пока ещё можешь выбрать укрытие.',
    'Transit between base and lane. Check your landing area while approaching.',
  ],
  [
    'Подтягивание / Mantle',
    'Mantle',
    'Подъём за край выступа. Ищи уступы, чтобы сменить высоту и разорвать линию огня.',
    'Climb a ledge to gain elevation and break line of sight.',
  ],
  [
    'Урна / Soul Urn',
    'Soul Urn',
    'Переносимая командная цель. До подбора проверь точку доставки и кто прикроет путь.',
    'A team objective you carry. Check the delivery point and arrange an escort before picking it up.',
  ],
  [
    'Страж / Guardian',
    'Guardian',
    'Первая оборонительная постройка линии. Подходи вместе со своей волной.',
    'The first defensive structure on a lane. Approach behind your own wave.',
  ],
  [
    'Шагоход / Walker',
    'Walker',
    'Постройка за Стражем. Проверь соседние линии перед долгой осадой.',
    'The structure behind a Guardian. Check adjacent lanes before a long siege.',
  ],
  [
    'Покровитель / Patron',
    'Patron',
    'Главная цель на базе. Прежде чем зайти, дождись союзников и волны.',
    'The main base objective. Wait for allies and a wave before pushing in.',
  ],
];
const checklist = [
  [
    'До выхода',
    'Before leaving',
    'Выбери первую покупку и найди на миникарте свою линию.',
    'Choose your first purchase and locate your lane on the minimap.',
  ],
  [
    '0–2 мин',
    '0–2 min',
    'Держи укрытие рядом, добей крипа и проследи за сферой душ.',
    'Stay near cover, finish a trooper and track its soul orb.',
  ],
  [
    '2–5 мин',
    '2–5 min',
    'После волны проверь здоровье и магазин. Покупай, когда союзник может удержать линию.',
    'After a wave, check health and shop. Buy when your ally can hold the lane.',
  ],
  [
    '5–8 мин',
    '5–8 min',
    'Проверь соседнюю линию. Перед уходом протолкни свою волну и обозначь маршрут пингом.',
    'Check the neighboring lane. Push your wave and ping your route before leaving.',
  ],
  [
    '8–10 мин',
    '8–10 min',
    'Открой таймлайн, выбери ближайшую цель и проверь, кто из союзников успевает к ней.',
    'Open the timeline, pick a nearby objective and see which allies can reach it.',
  ],
];
const lessons = [
  [
    'Движение',
    'Movement',
    'На спуске попробуй скольжение. После рывка перейди в скольжение и сравни дистанцию. Потренируй прыжок от стены и подъём на уступ. Оставляй выносливость на отход.',
    'Try sliding downhill. Slide after a dash and compare the distance. Practice a wall jump and a ledge climb. Keep stamina for the escape.',
  ],
  [
    'Как читать экран',
    'Reading the HUD',
    'Перед атакой проверь здоровье, выносливость и готовность способности. На миникарте найди ближайшего союзника, свою волну и последний известный путь соперника.',
    'Before attacking, check health, stamina and ability readiness. Locate your nearest ally, wave and the enemy’s last known path on the minimap.',
  ],
  [
    'Типичные ошибки',
    'Common mistakes',
    'Погнался за соперником и потерял волну? Сначала зачисти линию. Потратил все рывки на вход? Выбери укрытие для выхода до атаки. Повторно погиб от одного эффекта? Открой сводку урона и подбери контрпредмет.',
    'Lost a wave chasing someone? Clear first. Used every dash to engage? Pick escape cover beforehand. Died to the same effect twice? Check the damage recap and find a counter item.',
  ],
];
const quiz = [
  [
    ['Что проверить до подбора урны?', 'What should you check before picking up the urn?'],
    [
      ['Точку доставки и прикрытие', 'Delivery point and escort'],
      ['Только свои души', 'Only your souls'],
    ],
    0,
  ],
  [
    ['Что помогает против замаха в ближнем бою?', 'What helps against a melee wind-up?'],
    [
      ['Перезарядка оружия', 'Reloading'],
      ['Парирование', 'Parrying'],
    ],
    1,
  ],
  [
    [
      'Волна подошла к твоему Стражу. С чего начать?',
      'Your Guardian faces an incoming wave. What comes first?',
    ],
    [
      ['Оценить волну и защиту линии', 'Assess the wave and lane defense'],
      ['Сразу уйти за урной', 'Leave immediately for the urn'],
    ],
    0,
  ],
];
export function renderBeginner(root, lang) {
  const i = Number(lang === 'en'),
    l = (ru, en) => (i ? en : ru);
  const key = 'challengelock.guide.beginner.v1';
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    /* Storage is optional. */
  }
  const checks = new Set(Array.isArray(saved.checks) ? saved.checks : []);
  function persist() {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ checks: [...checks], badge: saved.badge === true }),
      );
    } catch {
      /* Keep progress for this visit. */
    }
  }
  root.innerHTML =
    '<div class="field-lessons"><section class="guide-sheet"><h2>' +
    l('Первые 10 минут', 'First 10 minutes') +
    '</h2>' +
    checklist
      .map(
        (row, n) =>
          '<label class="rookie-step"><input type="checkbox" data-step="' +
          n +
          '" ' +
          (checks.has(n) ? 'checked' : '') +
          '><span><b>' +
          row[i] +
          '</b><br>' +
          row[i + 2] +
          '</span></label>',
      )
      .join('') +
    '</section><section class="guide-sheet"><h2>' +
    l('Тренировка и интерфейс', 'Practice and interface') +
    '</h2>' +
    lessons
      .map((row) => '<details><summary>' + row[i] + '</summary><p>' + row[i + 2] + '</p></details>')
      .join('') +
    '</section><section class="guide-sheet"><h2>' +
    l('Глоссарий', 'Glossary') +
    '</h2>' +
    glossary
      .map((row) => '<details><summary>' + row[i] + '</summary><p>' + row[i + 2] + '</p></details>')
      .join('') +
    '</section><section class="guide-sheet"><h2>' +
    l('Мини-викторина', 'Quick quiz') +
    '</h2><form data-quiz>' +
    quiz
      .map(
        ([q, options], n) =>
          '<fieldset><legend>' +
          q[i] +
          '</legend>' +
          options
            .map(
              (o, j) =>
                '<label class="rookie-step"><input required type="radio" name="q' +
                n +
                '" value="' +
                j +
                '"><span>' +
                o[i] +
                '</span></label>',
            )
            .join('') +
          '</fieldset>',
      )
      .join('') +
    '<button>' +
    l('Проверить ответы', 'Check answers') +
    '</button></form><p role="status"></p></section></div>';
  const badge = l('Знак «Первый выход» получен.', 'First Deployment badge earned.');
  const feedback = root.querySelector('[role=status]');
  if (saved.badge) feedback.textContent = badge;
  root.onchange = (e) => {
    if (e.target.matches('[data-step]')) {
      const n = Number(e.target.dataset.step);
      if (e.target.checked) checks.add(n);
      else checks.delete(n);
      persist();
    }
  };
  root.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const answers = new FormData(e.target);
    const missed = quiz.filter((q, n) => answers.get('q' + n) !== String(q[2]));
    if (!missed.length) {
      saved.badge = true;
      persist();
      feedback.textContent = badge;
    } else
      feedback.textContent =
        l('Повтори вопрос: ', 'Review: ') + missed.map((q) => q[0][i]).join(' ');
  };
}
