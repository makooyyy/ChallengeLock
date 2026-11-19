import js from '@eslint/js';
import globals from 'globals';

// Shared correctness rules. Formatting is owned by Prettier, so this config
// deliberately contains no stylistic/format rules.
const coreRules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-implicit-globals': 'error',
  'no-var': 'error',
};

export default [
  {
    // Generated/installed content is not linted.
    ignores: ['node_modules/', 'data/', 'assets/', 'desktop/dist/', 'desktop/web/'],
  },
  js.configs.recommended,
  {
    // Browser ES modules.
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: coreRules,
  },
  {
    // Classic script loaded from index.html before the module graph.
    files: ['js/theme-boot.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: coreRules,
  },
  {
    // Node tooling: catalog sync/check scripts and tests.
    files: ['scripts/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.js', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: coreRules,
  },
  {
    // Playwright checks: the callbacks passed to page.evaluate() run in the
    // browser context, so browser globals are legitimate here.
    files: ['tests/browser.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: coreRules,
  },
  {
    // Electron desktop helpers are CommonJS.
    files: ['desktop/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.commonjs },
    },
    rules: coreRules,
  },
  {
    // Service worker.
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
    rules: coreRules,
  },
];
