import { link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ShellExecutable } from '@taucad/sandbox/shell/identity';

import {
  adoptPowerShellModuleCache,
  builtPowerShellModuleCache,
  powerShellModuleCacheLocation,
} from '#shell/shell-module-cache.js';

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
      directory: join(store, 'v1-ab12'),
      file: join(store, 'v1-ab12', 'ModuleAnalysisCache'),
    });
    expect(
      powerShellModuleCacheLocation(store, {
        ...executable,
        digest: 'sha256:cd34',
      }).directory,
    ).not.toBe(join(store, 'v1-ab12'));
  });

  it('copies what the build wrote into a file of its own, leaving no staging folder', async () => {
    const cache = powerShellModuleCacheLocation(store, executable);
    await writeFile(written, 'analysis');
    await expect(builtPowerShellModuleCache(cache)).resolves.toBe(false);

    await expect(adoptPowerShellModuleCache(written, cache)).resolves.toBe(true);

    await expect(readFile(cache.file, 'utf8')).resolves.toBe('analysis');
    await expect(builtPowerShellModuleCache(cache)).resolves.toBe(true);
    await expect(readdir(store)).resolves.toStrictEqual(['v1-ab12']);
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
    await expect(readdir(store)).resolves.toStrictEqual(['v1-ab12']);
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
