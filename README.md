# Deadlock Challenge Roulette

Фан-генератор челленджей для Deadlock: рулетка, случайный билд, запрет, свой набор, история. Чистые HTML/CSS/JS (ES modules), без сборки и бэкенда.
> Фан-проект, не связан с Valve. Deadlock — торговая марка Valve.

## Деплой на GitHub Pages
1. Создайте репозиторий. 2. Залейте содержимое папки `dlr/` в корень. 3. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`. 4. Откройте `https://<user>.github.io/<repo>/`.
Локально: `python3 -m http.server` (ES modules и fetch не работают с `file://`).

## Структура
`index.html`, `css/style.css`, `js/{rng,state,storage,i18n,roulette,builds,share,ui}.js`, `data/{heroes,items,challenges,i18n}.json`, `assets/`, `manifest.json`, `sw.js`.

## Данные и точность
Данные не сверены с API (сеть была недоступна). Всё, что не подтверждено, помечено `"verified": false` — это **список героев** и **предметы** (только T1/T2). Способности у героев хранятся как слоты 1–4 без выдуманных названий.
**Обновление после патча:** откройте `https://assets.deadlock-api.com` (раздел heroes/items), перенесите `id`, `name`, портрет (`icon`) в `data/heroes.json` и `data/items.json`, поставьте `"verified": true`. Поднимите версию `V` в `sw.js`.
Портреты не копируются в репозиторий: укажите URL в `icon`; при ошибке загрузки остаётся заглушка с инициалом.

## Как добавить челлендж
В `data/challenges.json` добавьте объект: `id`, `cat` (ab/it/gp/go/tm/ch), `difficulty` 1–5, `name{ru,en}`, `desc{ru,en}`, `tags`, `conflicts` (теги, с которыми он несовместим), `heroes` (`"all"` или массив id), `mult`, `mode` (`solo`/`team`).
Конфликт: A и B не выпадут вместе, если у одного в `conflicts` есть тег другого.

## Seed
`#seed=abc&d=mid&r=0&p=2` — seed, сложность, номер rerolla, игрок. Замки в ссылку не попадают: после ролла с замками ссылка воспроизводит результат только без них.

## Contributing
Fork → ветка → PR. Правьте JSON, не ломая схему; для новых данных ставьте `verified`.

## Лицензия
MIT (см. LICENSE).
