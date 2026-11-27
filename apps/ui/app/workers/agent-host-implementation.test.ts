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

  it('keeps a warm load that failed, since this worker can never load the module again (FP10)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const failure = new TypeError('Failed to fetch dynamically imported module: /assets/agent-host.impl-1.js');
      const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(failure).mockResolvedValueOnce('impl');
      const loader = createImplementationLoader(load);

      loader.warm();
      /* The failed warm is settled without an unhandled rejection. */
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledWith('[agent-host worker] early implementation load failed', failure);
      });
      await expect(loader.get()).rejects.toBe(failure);
      expect(load).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it('reports a failed load to every use, and never loads again in the same worker', async () => {
    const failure = new Error('load failed');
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(failure).mockResolvedValueOnce('impl');
    const loader = createImplementationLoader(load);

    await expect(loader.get()).rejects.toBe(failure);
    await expect(loader.get()).rejects.toBe(failure);
    expect(load).toHaveBeenCalledOnce();
  });
});
