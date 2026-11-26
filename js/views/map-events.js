export const objects = [
  {
    id: 'crates',
    name: ['Коробки', 'Crates'],
    first: 180,
    delay: [180],
    url: 'Crate',
    hint: [
      'Обычные точки на карте. Выбери отдельную зону для исключений.',
      'Standard map locations. Select a special area for exceptions.',
    ],
  },
  {
    id: 'boss',
    name: ['Мид-босс', 'Mid Boss'],
    first: 0,
    delay: [420, 360, 300],
    url: 'Midboss',
    hint: [
      'На карте с начала матча. Повторный отсчёт начинается после убийства.',
      'Present from match start. The next timer starts on the kill.',
    ],
  },
  {
    id: 'medium',
    name: ['Средний лагерь', 'Medium camp'],
    first: 300,
    delay: [290],
    url: 'Haunt',
    hint: ['Считай от полной зачистки лагеря.', 'Count from clearing the entire camp.'],
  },
  {
    id: 'sinner',
    name: ['Sinner’s Sacrifice', 'Sinner’s Sacrifice'],
    first: 480,
    delay: [300],
    url: 'Sinner%27s_Sacrifice',
    hint: [
      'Для одиночного автомата считай от разрушения; для смешанного лагеря — от полной зачистки.',
      'Count from machine destruction at a solo site, or the full clear at a hybrid camp.',
    ],
  },
  {
    id: 'boss-crates',
    name: ['Коробки над боссом', 'Crates above Mid Boss'],
    first: 600,
    delay: [180],
    url: 'Crate',
    hint: [
      'Комната под Times Squares над ямой босса.',
      'The room below Times Squares above the pit.',
    ],
  },
  {
    id: 'plaza',
    name: ['Башня и площадь', 'Tower and plaza'],
    first: 300,
    delay: [180],
    url: 'Crate',
    hint: ['Верх колокольни и Sunken Plaza.', 'Top of the Bell Tower and Sunken Plaza.'],
  },
  {
    id: 'tunnels',
    name: ['Коробки в тоннелях', 'Tunnel crates'],
    first: 300,
    delay: [300],
    url: 'Crate',
    hint: [
      'В тоннелях интервал дольше, чем у обычных коробок.',
      'Tunnel crates take longer than regular crates.',
    ],
  },
];
