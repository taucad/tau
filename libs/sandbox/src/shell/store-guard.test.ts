// @vitest-environment node
/**
 * The store guard's launch text and the start check's refusals that need no FUSE. The mounted guard itself is proven by
 * `store-guard/tests/acceptance.sh` and the Linux shell-conformance rows.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { probeStoreGuard, storeGuardBypass, storeGuardCheckRoot, storeGuardCommand } from '#shell/store-guard.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('storeGuardCommand', () => {
  it('should exec the outer bubblewrap, the guard launcher and the runtime command, every word quoted once', () => {
    const command = storeGuardCommand({
      guardPath: '/opt/tau/store guard/tau-store-guard',
      bwrapPath: '/opt/tau/sandbox/bwrap',
      guarded: { stores: ["/home/a/it's/.git", '/home/a/p/vendor/.git'], protect: ['config', 'hooks'] },
      command: "exec /opt/tau/sandbox/bwrap --die-with-parent -- /bin/bash -c 'echo hi'",
    });
    /* The shell's own word splitting, read back with printf: each argument arrives exactly as written. */
    const words = execFileSync('/bin/sh', ['-c', `set -- ${command.replace(/^exec /u, '')}; printf '%s\\n' "$@"`], {
      encoding: 'utf8',
    })
      .trimEnd()
      .split('\n');

    expect(command.startsWith('exec ')).toBe(true);
    expect(words).toStrictEqual([
      '/opt/tau/sandbox/bwrap',
      '--unshare-user',
      '--unshare-pid',
      '--die-with-parent',
      '--cap-add',
      'CAP_SYS_ADMIN',
      '--dev-bind',
      '/',
      '/',
      '--proc',
      '/proc',
      '--',
      '/opt/tau/store guard/tau-store-guard',
      'launch',
      '--protect',
      'config',
      '--protect',
      'hooks',
      '--store',
      "/home/a/it's/.git",
      '--store',
      '/home/a/p/vendor/.git',
      ...storeGuardBypass.flatMap((name) => ['--bypass', name]),
      '--',
      '/bin/sh',
      '-c',
      "exec /opt/tau/sandbox/bwrap --die-with-parent -- /bin/bash -c 'echo hi'",
    ]);
  });

  it('should bind only the bulk directories that hold no policy name past the guard', () => {
    expect(storeGuardBypass).toStrictEqual(['objects', 'refs', 'logs', 'lfs']);
  });
});

describe('probeStoreGuard', () => {
  it('should answer unavailable, with the reason, when the guard is not an executable file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-store-guard-probe-'));
    roots.push(root);
    const guardPath = join(root, 'tau-store-guard');
    writeFileSync(guardPath, '#!/bin/sh\n', { mode: 0o644 });

    const probe = await probeStoreGuard({ guardPath, bwrapPath: '/usr/bin/bwrap' });

    expect(probe).toStrictEqual({
      available: false,
      reason:
        process.platform === 'linux'
          ? `${guardPath} is not an executable file`
          : `${process.platform} has no store guard`,
    });
  });

  it.runIf(process.platform === 'linux')(
    "should remove the scratch store a killed host left behind, and keep a live process's",
    async () => {
      /* A process that has exited: its id names no process now, as a killed host's would. */
      const gone = spawnSync('/bin/sh', ['-c', 'echo $$'], { encoding: 'utf8' }).stdout.trim();
      const root = storeGuardCheckRoot();
      mkdirSync(root, { recursive: true, mode: 0o700 });
      const stale = join(root, `${gone}-leftover`);
      const live = join(root, `${String(process.pid)}-in-use`);
      mkdirSync(join(stale, 'project', '.git'), { recursive: true });
      mkdirSync(live, { recursive: true });
      roots.push(live);
      /* A root another user could write into is made private again before it is read. */
      chmodSync(root, 0o777);

      await probeStoreGuard({ guardPath: join(root, 'absent'), bwrapPath: '/usr/bin/bwrap' });

      expect(existsSync(stale)).toBe(false);
      expect(existsSync(live)).toBe(true);
      // oxlint-disable-next-line no-bitwise -- permission bits are a bit mask.
      expect(statSync(root).mode & 0o777).toBe(0o700);
    },
  );
});
