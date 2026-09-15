import * as Cookies from 'es-cookie';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { store } from '#hooks/use-cookie.js';

const names = [
  'tau-test-write',
  'tau-test-read',
  'tau-test-remove',
  'tau-test-migrate',
  'tau-test-malformed',
  'tau-test-unavailable',
];

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  });
});

afterEach(() => {
  for (const name of names) {
    store.remove(name);
    Cookies.remove(name);
  }
  vi.unstubAllGlobals();
});

it('writes ordinary preferences to localStorage without adding a request cookie', () => {
  store.update('tau-test-write', false);

  expect(globalThis.localStorage.getItem('tau-test-write')).toBe('false');
  expect(Cookies.get('tau-test-write')).toBeUndefined();
  expect(store.get('tau-test-write')).toBe(false);
});

it('reads and removes a local preference', () => {
  globalThis.localStorage.setItem('tau-test-read', '"tau-replay"');
  store.update('tau-test-remove', true);

  expect(store.get('tau-test-read')).toBe('tau-replay');
  store.remove('tau-test-remove');
  expect(globalThis.localStorage.getItem('tau-test-remove')).toBeNull();
  expect(store.get('tau-test-remove')).toBeUndefined();
});

it('migrates a valid legacy preference cookie once', () => {
  Cookies.set('tau-test-migrate', '"openscad"');

  expect(store.get('tau-test-migrate')).toBe('openscad');
  expect(globalThis.localStorage.getItem('tau-test-migrate')).toBe('"openscad"');
  expect(Cookies.get('tau-test-migrate')).toBeUndefined();
});

it('deletes malformed storage and falls back safely', () => {
  globalThis.localStorage.setItem('tau-test-malformed', '{broken');

  expect(store.get('tau-test-malformed')).toBeUndefined();
  expect(globalThis.localStorage.getItem('tau-test-malformed')).toBeNull();
});

it('does not crash when localStorage is unavailable', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  });

  expect(store.get('tau-test-unavailable')).toBeUndefined();
  expect(() => {
    store.update('tau-test-unavailable', true);
  }).not.toThrow();
  expect(() => {
    store.remove('tau-test-unavailable');
  }).not.toThrow();
});
