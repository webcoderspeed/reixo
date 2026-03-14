import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/graphql.ts', 'src/ws.ts', 'src/sse.ts', 'src/mock.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
