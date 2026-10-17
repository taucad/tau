/* eslint-disable @typescript-eslint/naming-convention -- Process environment names keep their wire spelling. */
import { win32 } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { resolveTauCli } from '#resolve-tau-cli.js';
import type { ResolveTauCliInput } from '#resolve-tau-cli.js';

const pluginRoot = '/plugins/tau';
const pluginVersion = '1.2.3-beta.4';
const pluginManifest = { [`${pluginRoot}/package.json`]: JSON.stringify({ version: pluginVersion }) };
const workspaceArgv = ['/ws/node_modules/tsx/dist/cli.mjs', '/ws/packages/cli/src/bin.ts'];
const workspacePointer = {
  [`${pluginRoot}/.dev/cli.json`]: JSON.stringify({ argv: workspaceArgv }),
  [workspaceArgv[0]!]: '',
};
const npx = { command: 'npx', args: ['--yes', `--package=@taucad/cli@${pluginVersion}`, 'tau', 'mcp'] };

/**
 * A launching process on macOS whose filesystem holds exactly `files`, and whose installed CLIs print the
 * `versions` given for their paths; any other `--version` fails.
 */
const host = (
  files: Readonly<Record<string, string>>,
  input: Partial<ResolveTauCliInput> = {},
  versions: Readonly<Record<string, string>> = {},
): ResolveTauCliInput => ({
  env: {},
  platform: 'darwin',
  pluginRoot,
  execPath: '/usr/local/bin/node',
  fileExists: (path) => Object.hasOwn(files, path),
  readFile: (path) => {
    const text = files[path];
    if (text === undefined) {
      throw new Error(`ENOENT: no such file, open '${path}'`);
    }
    return text;
  },
  versionOf: (path) => versions[path],
  ...input,
});

describe('resolveTauCli', () => {
  describe('TAU_CLI', () => {
    it('should run the TAU_CLI executable whatever its version, before every other source', () => {
      const files = { ...pluginManifest, ...workspacePointer, '/usr/bin/tau': '' };
      const versions = { '/opt/tau/bin/tau': '1.2.3-beta.1', '/usr/bin/tau': pluginVersion };
      const cli = resolveTauCli(host(files, { env: { TAU_CLI: '/opt/tau/bin/tau', PATH: '/usr/bin' } }, versions));

      expect(cli).toEqual({
        command: '/opt/tau/bin/tau',
        args: ['mcp'],
        source: 'explicit',
        path: '/opt/tau/bin/tau',
        cliVersion: '1.2.3-beta.1',
        pluginVersion,
        skipped: [],
      });
    });

    it('should still run a TAU_CLI that prints no version', () => {
      const cli = resolveTauCli(host(pluginManifest, { env: { TAU_CLI: '/opt/tau/bin/tau' } }));

      expect(cli).toMatchObject({ command: '/opt/tau/bin/tau', source: 'explicit', cliVersion: undefined });
    });

    it('should ignore an empty TAU_CLI', () => {
      const cli = resolveTauCli(
        host(
          { ...pluginManifest, '/usr/bin/tau': '' },
          { env: { TAU_CLI: '', PATH: '/usr/bin' } },
          { '/usr/bin/tau': pluginVersion },
        ),
      );

      expect(cli).toMatchObject({ command: '/usr/bin/tau', source: 'installed' });
    });
  });

  describe('workspace pointer', () => {
    it('should run the workspace CLI with the launching Node.js without probing an installed tau', () => {
      const versionOf = vi.fn<ResolveTauCliInput['versionOf']>(() => pluginVersion);
      const files = { ...pluginManifest, ...workspacePointer, '/usr/bin/tau': '' };
      const cli = resolveTauCli(host(files, { env: { PATH: '/usr/bin' }, versionOf }));

      expect(cli).toEqual({
        command: '/usr/local/bin/node',
        args: [...workspaceArgv, 'mcp'],
        source: 'workspace',
        pluginVersion,
        skipped: [],
      });
      expect(versionOf).not.toHaveBeenCalled();
    });

    it('should skip a pointer into a worktree that no longer exists', () => {
      const files = { ...pluginManifest, [`${pluginRoot}/.dev/cli.json`]: JSON.stringify({ argv: workspaceArgv }) };

      expect(resolveTauCli(host(files))).toMatchObject({ ...npx, source: 'npx' });
    });

    it.each([
      ['malformed JSON', '{ "argv": ['],
      ['no argv', '{}'],
      ['an empty argv', '{ "argv": [] }'],
      ['a non-string argument', '{ "argv": [42] }'],
    ])('should skip a pointer with %s', (_case, pointer) => {
      const files = { ...pluginManifest, [`${pluginRoot}/.dev/cli.json`]: pointer, '/usr/bin/tau': '' };

      expect(
        resolveTauCli(host(files, { env: { PATH: '/usr/bin' } }, { '/usr/bin/tau': pluginVersion })),
      ).toMatchObject({ command: '/usr/bin/tau', args: ['mcp'], source: 'installed' });
    });
  });

  describe('installed tau', () => {
    it('should run a tau on PATH whose version equals the plugin version', () => {
      const files = { ...pluginManifest, '/home/me/.npm-global/bin/tau': '' };
      const cli = resolveTauCli(
        host(
          files,
          { env: { PATH: '/home/me/bin::/home/me/.npm-global/bin:/usr/bin' } },
          { '/home/me/.npm-global/bin/tau': pluginVersion },
        ),
      );

      expect(cli).toEqual({
        command: '/home/me/.npm-global/bin/tau',
        args: ['mcp'],
        source: 'installed',
        path: '/home/me/.npm-global/bin/tau',
        cliVersion: pluginVersion,
        pluginVersion,
        skipped: [],
      });
    });

    it('should skip an older tau and fetch the plugin version with npx', () => {
      const files = { ...pluginManifest, '/usr/local/bin/tau': '' };
      const cli = resolveTauCli(
        host(files, { env: { PATH: '/usr/local/bin' } }, { '/usr/local/bin/tau': '1.2.3-beta.2' }),
      );

      expect(cli).toEqual({
        ...npx,
        source: 'npx',
        cliVersion: pluginVersion,
        pluginVersion,
        skipped: [{ path: '/usr/local/bin/tau', version: '1.2.3-beta.2' }],
      });
    });

    it('should skip a newer tau too, since only the release made with the plugin matches it', () => {
      const files = { ...pluginManifest, '/usr/local/bin/tau': '' };
      const cli = resolveTauCli(host(files, { env: { PATH: '/usr/local/bin' } }, { '/usr/local/bin/tau': '1.2.4' }));

      expect(cli).toMatchObject({ source: 'npx', skipped: [{ path: '/usr/local/bin/tau', version: '1.2.4' }] });
    });

    it('should take the matching tau when two are on PATH and only the second matches', () => {
      const files = { ...pluginManifest, '/home/me/.nvm/v22/bin/tau': '', '/home/me/.nvm/v24/bin/tau': '' };
      const versions = { '/home/me/.nvm/v22/bin/tau': '1.2.3-beta.2', '/home/me/.nvm/v24/bin/tau': pluginVersion };
      const cli = resolveTauCli(
        host(files, { env: { PATH: '/home/me/.nvm/v22/bin:/home/me/.nvm/v24/bin' } }, versions),
      );

      expect(cli).toMatchObject({
        command: '/home/me/.nvm/v24/bin/tau',
        source: 'installed',
        cliVersion: pluginVersion,
        skipped: [{ path: '/home/me/.nvm/v22/bin/tau', version: '1.2.3-beta.2' }],
      });
    });

    it('should skip a tau whose --version fails or does not answer, and record no version for it', () => {
      const files = { ...pluginManifest, '/usr/bin/tau': '', '/home/me/bin/tau': '' };
      const cli = resolveTauCli(
        host(files, { env: { PATH: '/usr/bin:/home/me/bin' } }, { '/home/me/bin/tau': pluginVersion }),
      );

      expect(cli).toMatchObject({ command: '/home/me/bin/tau', skipped: [{ path: '/usr/bin/tau' }] });
      expect(cli.skipped[0]?.version).toBeUndefined();
    });

    it('should probe each folder once when PATH repeats one or names a usual install folder', () => {
      const versionOf = vi.fn<ResolveTauCliInput['versionOf']>(() => '1.2.3-beta.2');
      const files = { ...pluginManifest, '/usr/local/bin/tau': '' };
      const cli = resolveTauCli(host(files, { env: { PATH: '/usr/local/bin:/usr/bin:/usr/local/bin' }, versionOf }));

      expect(versionOf.mock.calls).toEqual([['/usr/local/bin/tau']]);
      expect(cli.skipped).toEqual([{ path: '/usr/local/bin/tau', version: '1.2.3-beta.2' }]);
    });

    it('should probe a folder once when PATH names it with and without a trailing slash', () => {
      const versionOf = vi.fn<ResolveTauCliInput['versionOf']>(() => '1.2.3-beta.2');
      const files = { ...pluginManifest, '/home/me/bin/tau': '', '/usr/local/bin/tau': '' };
      const cli = resolveTauCli(
        host(files, { env: { PATH: '/home/me/bin:/home/me/bin/:/usr/local/bin/' }, versionOf }),
      );

      expect(versionOf.mock.calls).toEqual([['/home/me/bin/tau'], ['/usr/local/bin/tau']]);
      expect(cli.skipped).toEqual([
        { path: '/home/me/bin/tau', version: '1.2.3-beta.2' },
        { path: '/usr/local/bin/tau', version: '1.2.3-beta.2' },
      ]);
    });

    it('should look in Homebrew, then /usr/local/bin, when PATH has no matching tau', () => {
      const both = { ...pluginManifest, '/opt/homebrew/bin/tau': '', '/usr/local/bin/tau': '' };
      const usrLocal = { ...pluginManifest, '/usr/local/bin/tau': '' };
      const matching = { '/opt/homebrew/bin/tau': pluginVersion, '/usr/local/bin/tau': pluginVersion };

      expect(resolveTauCli(host(both, { env: { PATH: '/usr/bin' } }, matching)).command).toBe('/opt/homebrew/bin/tau');
      expect(resolveTauCli(host(usrLocal, {}, matching)).command).toBe('/usr/local/bin/tau');
    });
  });

  describe('npx', () => {
    it('should fetch the @taucad/cli version this plugin was released with', () => {
      expect(resolveTauCli(host(pluginManifest, { env: { PATH: '/usr/bin' } }))).toEqual({
        ...npx,
        source: 'npx',
        cliVersion: pluginVersion,
        pluginVersion,
        skipped: [],
      });
    });

    it('should throw when the plugin package.json names no version', () => {
      const files = { [`${pluginRoot}/package.json`]: JSON.stringify({ name: '@taucad/agent-plugin' }) };

      expect(() => resolveTauCli(host(files))).toThrow(
        new Error('/plugins/tau/package.json names no version, so the matching @taucad/cli is unknown'),
      );
    });
  });

  describe('Windows', () => {
    const windowsRoot = String.raw`C:\Users\me\.codex\plugins\cache\tau-dev\tau\1.2.3-beta.4`;
    const windowsManifest = { [String.raw`${windowsRoot}\package.json`]: JSON.stringify({ version: pluginVersion }) };
    const npmShim = String.raw`C:\Users\me\AppData\Roaming\npm\tau.cmd`;
    const windows = (
      files: Readonly<Record<string, string>>,
      env: ResolveTauCliInput['env'],
      versions: Readonly<Record<string, string>> = {},
    ): ResolveTauCliInput =>
      host(
        files,
        { env, platform: 'win32', pluginRoot: windowsRoot, execPath: String.raw`C:\Program Files\nodejs\node.exe` },
        versions,
      );

    it('should run a matching npm tau.cmd shim found on a semicolon-separated PATH', () => {
      const files = { ...windowsManifest, [npmShim]: '' };
      const cli = resolveTauCli(
        windows(
          files,
          { PATH: String.raw`C:\Windows\System32;C:\Users\me\AppData\Roaming\npm` },
          { [npmShim]: pluginVersion },
        ),
      );

      expect(cli).toMatchObject({ command: npmShim, args: ['mcp'], source: 'installed', path: npmShim });
    });

    it('should skip an older tau.cmd and fetch the CLI with npx.cmd, never probing Unix install folders', () => {
      const versionOf = vi.fn<ResolveTauCliInput['versionOf']>(() => '1.2.3-beta.2');
      const files = { ...windowsManifest, [npmShim]: '', '/opt/homebrew/bin/tau': '', '/usr/local/bin/tau': '' };
      const cli = resolveTauCli({
        ...windows(files, { PATH: String.raw`C:\Users\me\AppData\Roaming\npm` }),
        versionOf,
      });

      expect(cli).toEqual({
        ...npx,
        command: 'npx.cmd',
        source: 'npx',
        cliVersion: pluginVersion,
        pluginVersion,
        skipped: [{ path: npmShim, version: '1.2.3-beta.2' }],
      });
      expect(versionOf.mock.calls).toEqual([[npmShim]]);
    });

    it('should probe a tau.cmd once when PATH names its folder with and without a trailing backslash', () => {
      const versionOf = vi.fn<ResolveTauCliInput['versionOf']>(() => '1.2.3-beta.2');
      const folder = win32.dirname(npmShim);
      const files = { ...windowsManifest, [npmShim]: '' };
      resolveTauCli({
        ...windows(files, { PATH: [folder, `${folder}${win32.sep}`].join(win32.delimiter) }),
        versionOf,
      });

      expect(versionOf.mock.calls).toEqual([[npmShim]]);
    });
  });
});
