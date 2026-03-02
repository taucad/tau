import { describe, it, expect } from 'vitest';
import { getEnvironment, isNode, isBrowser, isWebWorker, resolveFileUrl, assertCrossOriginIsolated } from '#framework/environment.js';
import type { RuntimeEnvironment } from '#framework/environment.js';

describe('environment detection', () => {
  describe('getEnvironment', () => {
    it('returns a valid RuntimeEnvironment', () => {
      const env = getEnvironment();
      const validValues: RuntimeEnvironment[] = ['node', 'browser', 'worker'];
      expect(validValues).toContain(env);
    });

    it('detects Node.js in test runner', () => {
      expect(getEnvironment()).toBe('node');
    });

    it('returns consistent results across calls', () => {
      const first = getEnvironment();
      const second = getEnvironment();
      expect(first).toBe(second);
    });
  });

  describe('convenience helpers', () => {
    it('isNode returns true in test runner', () => {
      expect(isNode()).toBe(true);
    });

    it('isBrowser returns false in test runner', () => {
      expect(isBrowser()).toBe(false);
    });

    it('isWebWorker returns false in test runner', () => {
      expect(isWebWorker()).toBe(false);
    });

    it('exactly one convenience helper returns true', () => {
      const results = [isNode(), isBrowser(), isWebWorker()];
      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });

  describe('assertCrossOriginIsolated', () => {
    it('does not throw in Node.js (SharedArrayBuffer always available)', () => {
      expect(isNode()).toBe(true);
      expect(() => {
        assertCrossOriginIsolated();
      }).not.toThrow();
    });
  });

  describe('resolveFileUrl', () => {
    it('converts file:// URL to path in Node.js', async () => {
      const result = await resolveFileUrl('file:///tmp/test.wasm');
      expect(result).toBe('/tmp/test.wasm');
    });

    it('passes through http URLs unchanged', async () => {
      const url = 'https://example.com/test.wasm';
      const result = await resolveFileUrl(url);
      expect(result).toBe(url);
    });

    it('passes through blob URLs unchanged', async () => {
      const url = 'blob:http://localhost:3000/abc-123';
      const result = await resolveFileUrl(url);
      expect(result).toBe(url);
    });

    it('accepts URL objects', async () => {
      const url = new URL('https://example.com/test.wasm');
      const result = await resolveFileUrl(url);
      expect(result).toBe('https://example.com/test.wasm');
    });

    it('converts file:// URL object to path', async () => {
      const url = new URL('file:///tmp/test.wasm');
      const result = await resolveFileUrl(url);
      expect(result).toBe('/tmp/test.wasm');
    });
  });
});
