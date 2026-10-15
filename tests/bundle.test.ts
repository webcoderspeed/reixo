/**
 * Guards that `undici` (optional peer dependency) never ends up in browser /
 * edge bundles: it must only be reachable through a lazy, non-literal import.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const srcFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return srcFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });

describe('bundle: undici stays optional', () => {
  const sources = srcFiles(join(root, 'src')).map((file) => ({
    file,
    code: readFileSync(file, 'utf8'),
  }));

  it('no source file imports undici statically or with a literal specifier', () => {
    for (const { file, code } of sources) {
      expect(code, file).not.toMatch(/from\s+['"]undici['"]/);
      expect(code, file).not.toMatch(/require\(\s*['"]undici['"]\s*\)/);
      expect(code, file).not.toMatch(/import\(\s*['"]undici['"]\s*\)/);
    }
  });

  it('the proxy-dispatch module is only loaded lazily (or for types)', () => {
    for (const { file, code } of sources) {
      for (const line of code.split('\n')) {
        if (!line.includes("'./proxy-dispatch'") && !line.includes("'../utils/proxy-dispatch'")) {
          continue;
        }
        expect(line, file).toMatch(/import type|import\(|typeof import\(/);
      }
    }
  });

  it.skipIf(!existsSync(join(root, 'dist')))('built dist passes scripts/check-bundle.mjs', () => {
    expect(() =>
      execFileSync(process.execPath, [join(root, 'scripts/check-bundle.mjs')], { stdio: 'pipe' })
    ).not.toThrow();
  });
});
