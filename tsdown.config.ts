import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/graphql.ts', 'src/ws.ts', 'src/sse.ts', 'src/mock.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
});
