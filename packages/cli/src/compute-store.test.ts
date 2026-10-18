import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createComputeStoreHost } from '#compute-store.js';
import type { ComputeStoreHost } from '#compute-store.js';

describe('createComputeStoreHost', () => {
  let directory: string | undefined;
  let host: ComputeStoreHost | undefined;

  afterEach(async () => {
    await host?.close();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should start no worker until a project connects, then keep one connection per project', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-cli-compute-host-'));
    const onError = vi.fn();
    host = createComputeStoreHost({ directory: join(directory, 'compute'), onError });

    await expect(readdir(directory)).resolves.toEqual([]);

    const first = host.connect('/projects/a');
    expect(host.connect('/projects/a')).toBe(first);
    const other = host.connect('/projects/b');
    expect(other).not.toBe(first);

    const [a, b] = await Promise.all([first.control.inspect({}), other.control.inspect({})]);
    expect(a.generation).toBe(b.generation);
    await expect(readdir(join(directory, 'compute'))).resolves.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.sqlite$/u)]),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('should keep a project store across a restart of the process that holds it', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-cli-compute-host-'));
    const options = { directory: join(directory, 'compute'), onError: vi.fn() };
    host = createComputeStoreHost(options);
    const cleared = await host.connect('/projects/a').control.clear({});
    await host.close();

    host = createComputeStoreHost(options);
    const reopened = await host.connect('/projects/a').control.inspect({});

    expect(reopened.generation).toBe(cleared.generation);
  });

  it('should replace a stopped worker on the next connection', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-cli-compute-host-'));
    host = createComputeStoreHost({ directory: join(directory, 'compute'), onError: vi.fn() });
    const before = host.connect('/projects/a');
    await before.control.inspect({});
    await host.close();

    const after = host.connect('/projects/a');

    expect(after).not.toBe(before);
    await expect(after.control.inspect({})).resolves.toHaveProperty('generation');
  });
});
