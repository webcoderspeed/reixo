import pluginJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  // ── Ignore patterns ────────────────────────────────────────────
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'playground/', // dev playground, not library code
      'examples/', // demo scripts — intentionally loose code
      'benchmarks/', // perf scripts — not production code
    ],
  },

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
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],
      // Non-null assertions are intentional in library code — used after
      // Map.get(), optional checks, and other guarded patterns.
      '@typescript-eslint/no-non-null-assertion': 'off',

      // ── Import ordering ────────────────────────────────────────
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // ── SonarJS overrides (library-specific) ───────────────────
      // Threshold raised to match real complexity of core HTTP/polling
      // utilities (highest observed: http.ts = 69).
      'sonarjs/cognitive-complexity': ['warn', 75],
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
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      // SonarJS rules that fire on valid test patterns
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-hardcoded-credentials': 'off',
      'sonarjs/assertions-in-tests': 'off', // some tests assert via throws/rejects
      'sonarjs/no-identical-functions': 'off', // duplicate setup helpers are intentional
      'sonarjs/constructor-for-side-effects': 'off', // new X() to trigger constructor behaviour
      'sonarjs/public-static-readonly': 'off', // mock/stub classes use mutable statics
      'unicorn/prefer-node-protocol': 'off',
    },
  },

  // ── Internal modules that legitimately use console ─────────────
  {
    files: ['src/utils/internal-log.ts', 'src/utils/logger.ts'],
    rules: { 'no-console': 'off' },
  },
];
