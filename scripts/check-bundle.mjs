#!/usr/bin/env node
/**
 * Bundle guard for the optional `undici` peer dependency.
 *
 * Verifies the built `dist/` output never imports `undici` statically and only
 * reaches the proxy/dispatcher chunk through a lazy `import()` / `require()`,
 * so browser and edge bundles never include or resolve undici.
 *
 * Run after `npm run build`:  node scripts/check-bundle.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const files = readdirSync(dist).filter((f) => /\.(m?js)$/.test(f));
const problems = [];

const STATIC_UNDICI = [
  /\bfrom\s*["']undici["']/, // import x from 'undici'
  /\bimport\s*["']undici["']/, // import 'undici'
  /\brequire\(\s*["']undici["']\s*\)/, // require('undici')
  /\bimport\(\s*["']undici["']\s*\)/, // import('undici') with a literal — bundlers would resolve it
];

for (const file of files) {
  const code = readFileSync(join(dist, file), 'utf8');

  for (const pattern of STATIC_UNDICI) {
    if (pattern.test(code)) problems.push(`${file}: references undici statically (${pattern})`);
  }

  // The proxy-dispatch chunk must only be loaded lazily.
  if (/from\s*["']\.\/proxy-dispatch-/.test(code)) {
    problems.push(`${file}: statically imports the proxy-dispatch chunk`);
  }
  const eagerRequire = code
    .split('\n')
    .filter((line) => /require\(["']\.\/proxy-dispatch-/.test(line))
    .filter((line) => !/Promise\.resolve\(\)\.then\(\(\) => require\(/.test(line));
  if (eagerRequire.length > 0) {
    problems.push(`${file}: requires the proxy-dispatch chunk eagerly`);
  }
}

if (!files.some((f) => f.startsWith('proxy-dispatch-'))) {
  problems.push('no proxy-dispatch chunk found — was it inlined into the main bundle?');
}

if (problems.length > 0) {
  process.stderr.write(`Bundle check failed:\n  ${problems.join('\n  ')}\n`);
  process.exit(1);
}
process.stdout.write(
  `Bundle check passed (${files.length} files): undici is only loaded lazily.\n`
);
