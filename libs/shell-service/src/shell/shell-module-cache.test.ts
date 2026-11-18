import { link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShellExecutable } from '@taucad/sandbox/shell/identity';

import {
  adoptPowerShellModuleCache,
  builtPowerShellModuleCache,
  createPowerShellModuleCacheSchedule,
  powerShellModuleCacheLocation,
} from '#shell/shell-module-cache.js';
import type { PowerShellModuleCache } from '#shell/shell-module-cache.js';

const executable: ShellExecutable = {
  kind: 'powershell',
  path: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
  realPath: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
  digest: 'sha256:ab12',
};

let base = '';
let store = '';
let written = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tau-module-cache-')));
  store = join(base, 'store');
  await mkdir(join(base, 'session'));
  written = join(base, 'session', 'ModuleAnalysisCache');
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('PowerShell module analysis cache store', () => {
  it('keeps one folder per shell digest and store layout', () => {
    expect(powerShellModuleCacheLocation(store, executable)).toStrictEqual({
      directory: join(store, 'v2-ab12'),
      file: join(store, 'v2-ab12', 'ModuleAnalysisCache'),
    });
    expect(
      powerShellModuleCacheLocation(store, {
        ...executable,
        digest: 'sha256:cd34',
      }).directory,
    ).not.toBe(join(store, 'v2-ab12'));
  });

  it('copies what the build wrote into a file of its own, leaving no staging folder', async () => {
    const cache = powerShellModuleCacheLocation(store, executable);
    await writeFile(written, 'analysis');
    await expect(builtPowerShellModuleCache(cache)).resolves.toBe(false);

    await expect(adoptPowerShellModuleCache(written, cache)).resolves.toBe(true);

    await expect(readFile(cache.file, 'utf8')).resolves.toBe('analysis');
    await expect(builtPowerShellModuleCache(cache)).resolves.toBe(true);
    await expect(readdir(store)).resolves.toStrictEqual(['v2-ab12']);
    /* The copy is not the build's file: changing that one later changes nothing in the store. */
    await writeFile(written, 'changed');
    await expect(readFile(cache.file, 'utf8')).resolves.toBe('analysis');
  });

  it('keeps a complete cache another build put in place first', async () => {
    const cache = powerShellModuleCacheLocation(store, executable);
    await mkdir(cache.directory, { recursive: true });
    await writeFile(cache.file, 'first');
    await writeFile(written, 'second');

    await expect(adoptPowerShellModuleCache(written, cache)).resolves.toBe(true);

    await expect(readFile(cache.file, 'utf8')).resolves.toBe('first');
    await expect(readdir(store)).resolves.toStrictEqual(['v2-ab12']);
  });

  it('replaces a cache folder left without its file', async () => {
    const cache = powerShellModuleCacheLocation(store, executable);
    await mkdir(cache.directory, { recursive: true });
    await writeFile(written, 'analysis');

    await expect(adoptPowerShellModuleCache(written, cache)).resolves.toBe(true);

    await expect(readFile(cache.file, 'utf8')).resolves.toBe('analysis');
  });

  it('refuses an absent or empty file, a link and a second name for another file', async () => {
    const cache = powerShellModuleCacheLocation(store, executable);
    await expect(adoptPowerShellModuleCache(written, cache)).resolves.toBe(false);
    await writeFile(written, '');
    await expect(adoptPowerShellModuleCache(written, cache)).resolves.toBe(false);
    await rm(written);

    const elsewhere = join(base, 'secret.txt');
    await writeFile(elsewhere, 'secret');
    await symlink(elsewhere, written);
    await expect(adoptPowerShellModuleCache(written, cache)).resolves.toBe(false);
    await rm(written);
    await link(elsewhere, written);
    await expect(adoptPowerShellModuleCache(written, cache)).resolves.toBe(false);

    await expect(builtPowerShellModuleCache(cache)).resolves.toBe(false);
  });

  it('does not grant a store entry that is a link', async () => {
    const cache = powerShellModuleCacheLocation(store, executable);
    const elsewhere = join(base, 'elsewhere');
    await mkdir(elsewhere);
    await writeFile(join(elsewhere, 'ModuleAnalysisCache'), 'analysis');
    await mkdir(store);
    await symlink(elsewhere, cache.directory);

    await expect(builtPowerShellModuleCache(cache)).resolves.toBe(false);
  });
});

describe('PowerShell module analysis cache schedule', () => {
  const cache: PowerShellModuleCache = {
    directory: 'C:\\cache\\v2-ab12',
    file: 'C:\\cache\\v2-ab12\\ModuleAnalysisCache',
  };
  /** A build that settles only when told to, or with `undefined` when stopped. */
  const controlled = () => {
    const pending: Array<(value: PowerShellModuleCache | undefined) => void> = [];
    const signals: AbortSignal[] = [];
    const build = vi.fn(
      async (signal: AbortSignal): Promise<PowerShellModuleCache | undefined> =>
        new Promise((resolve) => {
          signals.push(signal);
          pending.push(resolve);
          signal.addEventListener('abort', () => {
            resolve(undefined);
          });
        }),
    );
    return { build, pending, signals };
  };

  it('builds nothing before start, nor when a cache is already in place', async () => {
    const { build } = controlled();
    const waiting = createPowerShellModuleCacheSchedule({ build, idleDelay: 0 });
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    expect(build).not.toHaveBeenCalled();
    const built = createPowerShellModuleCacheSchedule({ build, initial: cache, idleDelay: 0 });
    built.start();
    await built.settled();
    expect(built.current()).toBe(cache);
    expect(waiting.current()).toBeUndefined();
    expect(build).not.toHaveBeenCalled();
  });

  it('builds once started and grants the result', async () => {
    const { build, pending } = controlled();
    const schedule = createPowerShellModuleCacheSchedule({ build, idleDelay: 0 });
    schedule.start();
    await vi.waitFor(() => {
      expect(build).toHaveBeenCalledOnce();
    });
    expect(schedule.current()).toBeUndefined();
    pending[0]!(cache);
    await schedule.settled();
    expect(schedule.current()).toBe(cache);
  });

  it('stops a build for a launch, starts none while one runs, and builds again once all have ended', async () => {
    const { build, pending, signals } = controlled();
    const schedule = createPowerShellModuleCacheSchedule({ build, idleDelay: 0, attempts: 1 });
    schedule.start();
    await vi.waitFor(() => {
      expect(build).toHaveBeenCalledOnce();
    });
    const first = await schedule.claim();
    expect(signals[0]!.aborted).toBe(true);
    const second = await schedule.claim();
    first();
    first();
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    expect(build).toHaveBeenCalledOnce();
    second();
    /* A stopped build is not a failure: with one attempt allowed, it is still tried again. */
    await vi.waitFor(() => {
      expect(build).toHaveBeenCalledTimes(2);
    });
    pending[1]!(cache);
    await schedule.settled();
    expect(schedule.current()).toBe(cache);
  });

  it('stops trying after its failed attempts', async () => {
    const build = vi.fn(async (): Promise<PowerShellModuleCache | undefined> => undefined);
    const schedule = createPowerShellModuleCacheSchedule({ build, idleDelay: 0, attempts: 2 });
    schedule.start();
    await vi.waitFor(() => {
      expect(build).toHaveBeenCalledTimes(2);
    });
    const release = await schedule.claim();
    release();
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(build).toHaveBeenCalledTimes(2);
    expect(schedule.current()).toBeUndefined();
  });

  it('counts a build that throws as a failure', async () => {
    const build = vi.fn(async (): Promise<PowerShellModuleCache | undefined> => {
      throw new Error('no store');
    });
    const schedule = createPowerShellModuleCacheSchedule({ build, idleDelay: 0, attempts: 1 });
    schedule.start();
    await vi.waitFor(() => {
      expect(build).toHaveBeenCalledOnce();
    });
    await schedule.settled();
    expect(schedule.current()).toBeUndefined();
  });
});
