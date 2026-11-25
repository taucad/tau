import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { createFakeShellProvider } from '@taucad/native-process-core/shell';

import { createDesktopShell } from '#services-host-shell.js';

const fixture = fileURLToPath(new URL('desktop-shell-gc.fixture.ts', import.meta.url));

/*
 * A probe that leaves no shell drops its provider, and the next probe makes a new one. The dropped provider's custody
 * (a lock file per execution it holds) is released at once: from Node 26 a file handle left to garbage collection is an
 * uncaught `ERR_INVALID_STATE` (DEP0137 on Node 24).
 */
describe('createDesktopShell provider ownership', () => {
  it('closes the provider of a probe that leaves no shell, and keeps an available one open', async () => {
    const base = await mkdtemp(join(tmpdir(), 'tau-desktop-shell-close-'));
    try {
      const failing = createFakeShellProvider(() => ({ status: 'sandbox-unavailable', message: 'bwrap is missing' }));
      const closeFailing = vi.fn(async () => undefined);
      const unavailable = createDesktopShell({
        appDataRoots: [join(base, 'app-data')],
        provider: { ...failing, close: closeFailing },
        home: base,
      });
      await expect(unavailable.probe()).resolves.toMatchObject({ status: 'unavailable' });
      expect(closeFailing).toHaveBeenCalledTimes(1);

      const working = createFakeShellProvider((launch) =>
        launch.arguments.at(-1)?.includes('BASH_VERSION') === true
          ? { status: 'started', stdout: '5.2.21(1)-release\n', exit: { exitCode: 0 } }
          : { status: 'started', stdout: 'ok\n', exit: { exitCode: 0 } },
      );
      const closeWorking = vi.fn(async () => undefined);
      const available = createDesktopShell({
        appDataRoots: [join(base, 'app-data')],
        provider: { ...working, close: closeWorking },
        home: base,
      });
      const probed = await available.probe();
      expect(probed.status, JSON.stringify(probed)).toBe('available');
      expect(closeWorking).not.toHaveBeenCalled();
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'linux' || process.platform === 'darwin')(
    'leaves no lock file to garbage collection when it drops a provider that holds custody',
    async () => {
      const base = await mkdtemp(join(tmpdir(), 'tau-desktop-shell-gc-'));
      try {
        const run = spawnSync(process.execPath, ['--expose-gc', fixture, base], { encoding: 'utf8' });

        expect(run.stdout.trim().split('\n').at(-1), run.stderr).toBe('unavailable');
        expect(run.stderr).not.toMatch(/garbage collection/u);
        expect(run.status, run.stderr).toBe(0);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    },
  );
});
