/* eslint-disable @typescript-eslint/naming-convention -- environment names are SCREAMING_SNAKE */
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  compileCacheEnvironment,
  loginShellEnvironment,
  packagedEsbuildEnvironment,
  utilityEnvironment,
  utilityEnvironmentNames,
} from '#main/utility-environment.js';

describe('utilityEnvironment', () => {
  it('copies only the allowlisted names', () => {
    expect(
      utilityEnvironment({
        PATH: '/usr/bin',
        TMPDIR: '/tmp',
        LANG: 'en_NZ.UTF-8',
        NODE_ENV: 'production',
        TAU_DEBUG: 'true',
      }),
    ).toEqual({ PATH: '/usr/bin', TMPDIR: '/tmp', LANG: 'en_NZ.UTF-8', NODE_ENV: 'production', TAU_DEBUG: 'true' });
  });

  it('drops everything that changes what the child is, or leaks a secret into it', () => {
    const environment = utilityEnvironment({
      PATH: '/usr/bin',
      /* These two change the child's identity, not just its configuration. */
      NODE_OPTIONS: '--require ./evil.cjs',
      ELECTRON_RUN_AS_NODE: '1',
      OPENAI_API_KEY: 'sk-live-secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
      TAU_DESKTOP_TOKEN: 'session-token',
    });
    expect(environment).toEqual({ PATH: '/usr/bin' });
  });

  it('merges caller-named additions last', () => {
    expect(utilityEnvironment({ PATH: '/usr/bin' }, { TAU_PROJECT_ROOT: '/root' })).toEqual({
      PATH: '/usr/bin',
      TAU_PROJECT_ROOT: '/root',
    });
  });

  it('omits an allowlisted name that main itself does not have', () => {
    expect(utilityEnvironment({})).toEqual({});
  });
});

describe('compileCacheEnvironment', () => {
  /* A packaged macOS layout: the bundle is signed and read-only, the data root is not. */
  const bundle = '/Applications/Tau.app/Contents/Resources';
  const userData = '/Users/someone/Library/Application Support/Tau';

  it('should put the compile cache under the app data root', () => {
    expect(compileCacheEnvironment(userData)).toEqual({
      TAU_COMPILE_CACHE_DIR: '/Users/someone/Library/Application Support/Tau/compile-cache',
    });
  });

  it('should keep the compile cache out of the signed bundle', () => {
    const { TAU_COMPILE_CACHE_DIR: directory } = compileCacheEnvironment(userData);
    expect(directory.startsWith(`${userData}/`)).toBe(true);
    expect(directory.startsWith(bundle)).toBe(false);
    expect(directory).not.toContain('app.asar');
  });

  it('should never name the directory NODE_COMPILE_CACHE', () => {
    /* Electron's utility bootstrap reads that variable, reports the cache as
     * already enabled and then writes nothing, which disables the very cache it
     * names. Measured at 43.5.1; the fork entries pass the directory instead. */
    expect(Object.keys(compileCacheEnvironment(userData))).toEqual(['TAU_COMPILE_CACHE_DIR']);
    expect(utilityEnvironmentNames).not.toContain('NODE_COMPILE_CACHE');
  });

  it('should reach every utility fork through the allowlisted addition', () => {
    expect(utilityEnvironment({ PATH: '/usr/bin' }, compileCacheEnvironment(userData))).toEqual({
      PATH: '/usr/bin',
      TAU_COMPILE_CACHE_DIR: '/Users/someone/Library/Application Support/Tau/compile-cache',
    });
  });
});

describe('packagedEsbuildEnvironment', () => {
  it('should point packaged utilities at the executable staged outside the ASAR', () => {
    expect(
      packagedEsbuildEnvironment(true, '/Applications/Tau.app/Contents/Resources', {
        architecture: 'arm64',
        platform: 'darwin',
      }),
    ).toEqual({
      ESBUILD_BINARY_PATH:
        '/Applications/Tau.app/Contents/Resources/app.asar.unpacked/node_modules/@esbuild/darwin-arm64/bin/esbuild',
    });
  });

  it('should preserve normal workspace resolution outside a packaged app', () => {
    expect(packagedEsbuildEnvironment(false, '/unused', { architecture: 'arm64', platform: 'darwin' })).toEqual({});
  });

  it('should preserve normal resolution on packaged targets without a qualified staged executable', () => {
    expect(packagedEsbuildEnvironment(true, '/unused', { architecture: 'x64', platform: 'win32' })).toEqual({});
  });
});

describe('loginShellEnvironment', () => {
  const roots: string[] = [];
  afterAll(async () => {
    await Promise.all(roots.map(async (root) => rm(root, { recursive: true, force: true })));
  });
  /** A stand-in login shell: prints rc noise, then the sentinel-wrapped environment it "has". */
  const fakeShell = async (path: string): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'tau-login-shell-'));
    roots.push(root);
    const shell = join(root, 'sh');
    await writeFile(
      shell,
      [
        '#!/bin/sh',
        String.raw`printf 'motd from an rc file\n'`,
        `PATH='${path}'`,
        "CODEX_HOME='/Users/me/.codex-custom'",
        "MULTI='one\ntwo'",
        'export PATH CODEX_HOME MULTI',
        String.raw`printf '\n__TAU_PATH__'`,
        '/usr/bin/env SHLVL=9 PWD=/tmp/fake OLDPWD=/ TERM=xterm-256color _=/usr/bin/env /usr/bin/env -0',
        "printf '__TAU_PATH__'",
        '',
      ].join('\n'),
    );
    await chmod(shell, 0o755);
    return shell;
  };

  it.skipIf(process.platform === 'win32')(
    'applies the login shell variables and puts its PATH entries first, once each',
    async () => {
      const shell = await fakeShell('/opt/homebrew/bin:/usr/bin:/Users/me/.local/bin');
      const target: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
      const result = await loginShellEnvironment({ target, shell });
      expect(target['PATH']).toBe('/opt/homebrew/bin:/usr/bin:/Users/me/.local/bin:/bin:/usr/sbin:/sbin');
      expect(target['CODEX_HOME']).toBe('/Users/me/.codex-custom');
      /* A value spanning lines survives: the block, not one line, is the capture. */
      expect(target['MULTI']).toBe('one\ntwo');
      expect(result.added).toBe(2);
      expect(result.applied).toBeGreaterThan(0);
    },
  );

  it.skipIf(process.platform === 'win32')('never overrides a variable the launcher already set', async () => {
    const shell = await fakeShell('/opt/homebrew/bin');
    const target: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', CODEX_HOME: '/launcher/codex' };
    await loginShellEnvironment({ target, shell });
    expect(target['CODEX_HOME']).toBe('/launcher/codex');
  });

  it.skipIf(process.platform === 'win32')('skips shell bookkeeping', async () => {
    const shell = await fakeShell('/opt/homebrew/bin');
    const target: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin' };
    await loginShellEnvironment({ target, shell });
    for (const name of ['SHLVL', 'PWD', 'OLDPWD', '_', 'TERM']) {
      expect(target[name]).toBeUndefined();
    }
  });

  it.skipIf(process.platform === 'win32')('applies nothing under the e2e opt-out', async () => {
    const shell = await fakeShell('/opt/homebrew/bin');
    const target: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', TAU_E2E_KEEP_PATH: '1' };
    await expect(loginShellEnvironment({ target, shell })).resolves.toEqual({ added: 0, applied: 0, elapsed: 0 });
    expect(target).toEqual({ PATH: '/usr/bin:/bin', TAU_E2E_KEEP_PATH: '1' });
  });

  it.skipIf(process.platform === 'win32')('keeps the environment when the shell prints no sentinel', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-login-shell-'));
    roots.push(root);
    const shell = join(root, 'sh');
    await writeFile(shell, `#!/bin/sh\nprintf 'only rc noise\\n'\n`);
    await chmod(shell, 0o755);
    const target: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin' };
    const result = await loginShellEnvironment({ target, shell });
    expect(target).toEqual({ PATH: '/usr/bin:/bin' });
    expect(result.applied).toBe(0);
  });

  it.skipIf(process.platform === 'win32')('gives up on a shell that ignores SIGTERM inside the budget', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-login-shell-'));
    roots.push(root);
    const shell = join(root, 'sh');
    /* An interactive zsh survives SIGTERM; an rc file that prompts holds it open. */
    await writeFile(shell, `#!/bin/sh\ntrap '' TERM\nsleep 30\n`);
    await chmod(shell, 0o755);
    const target: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin' };
    const started = Date.now();
    await loginShellEnvironment({ target, shell, shellTimeout: 300 });
    expect(target).toEqual({ PATH: '/usr/bin:/bin' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it.skipIf(process.platform === 'win32')('keeps the environment when the shell does not answer', async () => {
    const target: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin' };
    await loginShellEnvironment({ target, shell: '/usr/bin/false' });
    await loginShellEnvironment({ target, shell: join(tmpdir(), 'no-such-shell') });
    expect(target).toEqual({ PATH: '/usr/bin:/bin' });
  });
});
