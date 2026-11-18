# Contributing to Deadlock Challenge Roulette

Thanks for your interest! Contributions are welcome.

## Development

Requirements: Node.js >= 22.

```bash
npm test
```

The app is static HTML/CSS/JS (ES modules). Run a local server (ES modules and `fetch` do not work over `file://`):

```bash
python3 -m http.server
# or
npx serve .
```

## Pull requests

1. Fork the repo and create a feature branch.
2. Keep changes focused; add/update tests where relevant.
3. Ensure `npm test` passes.
4. Open a PR using the provided template.

## Data changes

Catalog data is synced via `scripts/sync-catalog.mjs`. Run `npm run check:catalog` before committing data changes.

## Code style

- Vanilla JS, ES modules, no build step.
- Keep functions small and testable; logic lives in `js/`, UI in `*ui.js`.
