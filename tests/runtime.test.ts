import { describe, it, expect } from 'vitest';
import {
  detectRuntime,
  getRuntimeCapabilities,
  isBrowser,
  isNode,
  isEdgeRuntime,
} from '../src/utils/runtime';

describe('runtime detection', () => {
  describe('detectRuntime()', () => {
    it('returns a known runtime name', () => {
      const valid = new Set([
        'browser',
        'node',
        'bun',
        'deno',
        'workerd',
        'edge-light',
        'fastly',
        'unknown',
      ]);
      expect(valid.has(detectRuntime())).toBe(true);
    });

    it('detects Node.js in the test environment', () => {
      // Vitest runs in Node, so this should be "node" (unless Bun/Deno is used)
      const runtime = detectRuntime();
      // Bun sets process.versions.bun; Deno sets globalThis.Deno
      // In a standard Node/Vitest environment, expect 'node'
      expect(['node', 'bun', 'deno']).toContain(runtime);
    });
  });

  describe('getRuntimeCapabilities()', () => {
    it('returns a capabilities object with the expected shape', () => {
      const caps = getRuntimeCapabilities();
      expect(typeof caps.name).toBe('string');
      expect(typeof caps.hasFetch).toBe('boolean');
      expect(typeof caps.hasStreams).toBe('boolean');
      expect(typeof caps.hasCrypto).toBe('boolean');
      expect(typeof caps.hasXHR).toBe('boolean');
      expect(typeof caps.hasNodeErrorCodes).toBe('boolean');
      expect(typeof caps.hasHTTP2).toBe('boolean');
    });

    it('hasFetch is true in Node 18+ / Bun / Deno test environments', () => {
      const caps = getRuntimeCapabilities();
      // Node 18+ ships fetch natively; vitest test env should have it
      expect(caps.hasFetch).toBe(true);
    });
  });

  describe('isBrowser() / isNode() / isEdgeRuntime()', () => {
    it('isBrowser returns a boolean', () => {
      expect(typeof isBrowser()).toBe('boolean');
    });

    it('isNode returns a boolean', () => {
      expect(typeof isNode()).toBe('boolean');
    });

    it('isEdgeRuntime returns a boolean', () => {
      expect(typeof isEdgeRuntime()).toBe('boolean');
    });

    it('isNode is true in a Node.js/Bun/Vitest environment', () => {
      // We are running inside Node or Bun during CI / local tests
      expect(isNode() || detectRuntime() === 'bun').toBe(true);
    });

    it('isBrowser and isNode are mutually exclusive', () => {
      // Cannot be both browser and Node at the same time
      expect(isBrowser() && isNode()).toBe(false);
    });
  });
});
