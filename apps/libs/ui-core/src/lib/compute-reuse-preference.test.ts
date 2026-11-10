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

  it('defaults invalid persistence to durable and revises once per change', async () => {
    globalThis.localStorage.setItem('tau-compute-reuse-mode', 'invalid');
    const preference = await import('./compute-reuse-preference.js');
    expect(preference.getComputeReuseMode()).toBe('durable');
    expect(preference.getComputeReuseRevision()).toBe(0);
    preference.setComputeReuseMode('off');
    preference.setComputeReuseMode('off');
    expect(preference.getComputeReuseMode()).toBe('off');
    expect(preference.getComputeReuseRevision()).toBe(1);
    expect(globalThis.localStorage.getItem('tau-compute-reuse-mode')).toBe('off');
  });

  it('defaults an unset preference to durable', async () => {
    const preference = await import('./compute-reuse-preference.js');
    expect(preference.getComputeReuseMode()).toBe('durable');
  });

  it.each(['off', 'memory'] as const)('keeps an explicit %s preference', async (mode) => {
    globalThis.localStorage.setItem('tau-compute-reuse-mode', mode);
    const preference = await import('./compute-reuse-preference.js');
    expect(preference.getComputeReuseMode()).toBe(mode);
  });

  it('defaults to durable when storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
    });
    const preference = await import('./compute-reuse-preference.js');
    expect(preference.getComputeReuseMode()).toBe('durable');
  });
});
