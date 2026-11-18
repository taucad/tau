import { describe, expect, it, vi } from 'vitest';
import { createImplementationLoader } from '#workers/agent-host-implementation.js';

describe('createImplementationLoader', () => {
  it('loads once when warmed before the first use', async () => {
    const module = { name: 'impl' };
    const load = vi.fn(async () => module);
    const loader = createImplementationLoader(load);

    loader.warm();
    expect(load).toHaveBeenCalledTimes(1);
    await expect(loader.get()).resolves.toBe(module);
    await expect(loader.get()).resolves.toBe(module);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads on first use when nothing warmed it', async () => {
    const load = vi.fn(async () => 'impl');
    const loader = createImplementationLoader(load);

    expect(load).not.toHaveBeenCalled();
    await expect(loader.get()).resolves.toBe('impl');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a warm load that failed, so the first use loads again and can succeed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const load = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce('impl');
      const loader = createImplementationLoader(load);

      loader.warm();
      /* The failed warm is settled without an unhandled rejection. */
      await vi.waitFor(() => {
        expect(load).toHaveBeenCalledTimes(1);
      });
      await Promise.resolve();
      await expect(loader.get()).resolves.toBe('impl');
      expect(load).toHaveBeenCalledTimes(2);
      /* The early failure nobody waited on is logged, not silent. */
      expect(warn).toHaveBeenCalledWith('[agent-host worker] early implementation load failed', expect.any(Error));
    } finally {
      warn.mockRestore();
    }
  });

  it('reports a failed use to its caller, and the next use loads again', async () => {
    const failure = new Error('load failed');
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(failure).mockResolvedValueOnce('impl');
    const loader = createImplementationLoader(load);

    await expect(loader.get()).rejects.toBe(failure);
    await expect(loader.get()).resolves.toBe('impl');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
