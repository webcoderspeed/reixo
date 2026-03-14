import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default [
  // ── Ignore patterns ────────────────────────────────────────────
  { ignores: ['dist/', 'node_modules/', 'coverage/', 'playground/dist/'] },

  // ── File patterns ──────────────────────────────────────────────
  { files: ['**/*.{js,mjs,cjs,ts}'] },

  // ── Language globals ───────────────────────────────────────────
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },

  // ── Base ESLint + TypeScript ───────────────────────────────────
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier, // disables rules that conflict with Prettier

  // ── SonarJS (code quality & bug detection) ─────────────────────
  sonarjs.configs.recommended,

  // ── Core rules ────────────────────────────────────────────────
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // ── Console: all src/ calls go through internalLog ─────────
      'no-console': 'error',

      // ── TypeScript ─────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // ── Import ordering ────────────────────────────────────────
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // ── SonarJS overrides (library-specific) ───────────────────
      // Cognitive complexity limit - keep public API methods simple
      'sonarjs/cognitive-complexity': ['warn', 20],
      // Allow TODO comments in source (tracked in todo files)
      'sonarjs/todo-tag': 'off',
    },
  },

  // ── Unicorn (modern JS best practices) ─────────────────────────
  {
    plugins: { unicorn },
    rules: {
      // Unicorn rules most valuable for library code:
      'unicorn/prefer-node-protocol': 'error', // Use node: prefix
      'unicorn/prefer-module': 'off', // tsup handles CJS/ESM
      'unicorn/no-array-for-each': 'error', // for-of is cleaner
      'unicorn/prefer-number-properties': 'error', // Number.isNaN() etc.
      'unicorn/no-instanceof-array': 'error', // Use Array.isArray
      'unicorn/prefer-optional-catch-binding': 'error', // catch without var
      'unicorn/no-useless-undefined': 'error', // Don't pass undefined explicitly
      'unicorn/prefer-string-slice': 'error', // slice over substring
      'unicorn/throw-new-error': 'error', // Always new Error()
      'unicorn/no-new-array': 'error', // Array.from instead of new Array
      'unicorn/error-message': 'error', // Error messages must be strings
      'unicorn/consistent-destructuring': 'warn', // DRY destructuring
    },
  },

  // ── Test file overrides ────────────────────────────────────────
  {
    files: [
      'tests/**/*.ts',
      '**/*.test.ts',
      '**/*.spec.ts',
      'examples/**/*.ts',
      'benchmarks/**/*.ts',
    ],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-hardcoded-credentials': 'off',
      'unicorn/prefer-node-protocol': 'off',
    },
  },

  // ── Internal modules that legitimately use console ─────────────
  {
    files: ['src/utils/internal-log.ts', 'src/utils/logger.ts'],
    rules: { 'no-console': 'off' },
  },
];
