import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'examples/**',
        'benchmarks/**',
        'dist/**',
        '**/*.d.ts',
        'tsup.config.ts',
        'eslint.config.mjs',
        'tests/**',
      ],
    },
  },
});
