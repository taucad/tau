import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('compute reuse preference', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      clear: () => {
        values.clear();
      },
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    globalThis.localStorage.clear();
    vi.resetModules();
  });

  it('defaults invalid persistence to bypass and revises once per change', async () => {
    globalThis.localStorage.setItem('tau-compute-reuse-mode', 'invalid');
    const preference = await import('./compute-reuse-preference.js');
    expect(preference.getComputeReuseMode()).toBe('off');
    expect(preference.getComputeReuseRevision()).toBe(0);
    preference.setComputeReuseMode('durable');
    preference.setComputeReuseMode('durable');
    expect(preference.getComputeReuseMode()).toBe('durable');
    expect(preference.getComputeReuseRevision()).toBe(1);
    expect(globalThis.localStorage.getItem('tau-compute-reuse-mode')).toBe('durable');
  });

  // Charter D3: reuse is opt-in. An unset preference — a first visit, or a
  // profile where storage throws — must bypass the durable store.
  it('defaults an unset preference to bypass', async () => {
    const preference = await import('./compute-reuse-preference.js');
    expect(preference.getComputeReuseMode()).toBe('off');
  });

  it('defaults to bypass when storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
    });
    const preference = await import('./compute-reuse-preference.js');
    expect(preference.getComputeReuseMode()).toBe('off');
  });
});
