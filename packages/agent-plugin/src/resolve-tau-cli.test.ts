/* eslint-disable @typescript-eslint/naming-convention -- Process environment names keep their wire spelling. */
import { describe, expect, it } from 'vitest';

import { resolveTauCli } from '#resolve-tau-cli.js';
import type { ResolveTauCliInput } from '#resolve-tau-cli.js';

const pluginRoot = '/plugins/tau';
const pluginManifest = { [`${pluginRoot}/package.json`]: JSON.stringify({ version: '1.2.3-beta.4' }) };
const workspaceArgv = ['/ws/node_modules/tsx/dist/cli.mjs', '/ws/packages/cli/src/bin.ts'];
const workspacePointer = {
  [`${pluginRoot}/.dev/cli.json`]: JSON.stringify({ argv: workspaceArgv }),
  [workspaceArgv[0]!]: '',
};

/** A launching process on macOS whose filesystem holds exactly `files`. */
const host = (
  files: Readonly<Record<string, string>>,
  input: Partial<ResolveTauCliInput> = {},
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
  ...input,
});

describe('resolveTauCli', () => {
  describe('TAU_CLI', () => {
    it('should run the TAU_CLI executable before every other source', () => {
      const files = { ...pluginManifest, ...workspacePointer, '/usr/bin/tau': '' };
      const cli = resolveTauCli(host(files, { env: { TAU_CLI: '/opt/tau/bin/tau', PATH: '/usr/bin' } }));

      expect(cli).toEqual({ command: '/opt/tau/bin/tau', args: ['mcp'] });
    });

    it('should ignore an empty TAU_CLI', () => {
      const cli = resolveTauCli(
        host({ ...pluginManifest, '/usr/bin/tau': '' }, { env: { TAU_CLI: '', PATH: '/usr/bin' } }),
      );

      expect(cli).toEqual({ command: '/usr/bin/tau', args: ['mcp'] });
    });
  });

  describe('workspace pointer', () => {
    it('should run the workspace CLI with the launching Node.js when .dev/cli.json points at it', () => {
      const cli = resolveTauCli(
        host({ ...pluginManifest, ...workspacePointer, '/usr/bin/tau': '' }, { env: { PATH: '/usr/bin' } }),
      );

      expect(cli).toEqual({ command: '/usr/local/bin/node', args: [...workspaceArgv, 'mcp'] });
    });

    it('should skip a pointer into a worktree that no longer exists', () => {
      const files = { ...pluginManifest, [`${pluginRoot}/.dev/cli.json`]: JSON.stringify({ argv: workspaceArgv }) };

      expect(resolveTauCli(host(files))).toEqual({
        command: 'npx',
        args: ['--yes', '--package=@taucad/cli@1.2.3-beta.4', 'tau', 'mcp'],
      });
    });

    it.each([
      ['malformed JSON', '{ "argv": ['],
      ['no argv', '{}'],
      ['an empty argv', '{ "argv": [] }'],
      ['a non-string argument', '{ "argv": [42] }'],
    ])('should skip a pointer with %s', (_case, pointer) => {
      const files = { ...pluginManifest, [`${pluginRoot}/.dev/cli.json`]: pointer, '/usr/bin/tau': '' };

      expect(resolveTauCli(host(files, { env: { PATH: '/usr/bin' } }))).toEqual({
        command: '/usr/bin/tau',
        args: ['mcp'],
      });
    });
  });

  describe('installed tau', () => {
    it('should run the first tau on PATH', () => {
      const files = { ...pluginManifest, '/home/me/.npm-global/bin/tau': '', '/usr/bin/tau': '' };
      const cli = resolveTauCli(host(files, { env: { PATH: '/home/me/bin::/home/me/.npm-global/bin:/usr/bin' } }));

      expect(cli).toEqual({ command: '/home/me/.npm-global/bin/tau', args: ['mcp'] });
    });

    it('should look in Homebrew, then /usr/local/bin, when PATH has no tau', () => {
      const both = { ...pluginManifest, '/opt/homebrew/bin/tau': '', '/usr/local/bin/tau': '' };
      const usrLocal = { ...pluginManifest, '/usr/local/bin/tau': '' };

      expect(resolveTauCli(host(both, { env: { PATH: '/usr/bin' } })).command).toBe('/opt/homebrew/bin/tau');
      expect(resolveTauCli(host(usrLocal)).command).toBe('/usr/local/bin/tau');
    });
  });

  describe('npx', () => {
    it('should fetch the @taucad/cli version this plugin was released with', () => {
      expect(resolveTauCli(host(pluginManifest, { env: { PATH: '/usr/bin' } }))).toEqual({
        command: 'npx',
        args: ['--yes', '--package=@taucad/cli@1.2.3-beta.4', 'tau', 'mcp'],
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
    const windowsManifest = { [String.raw`${windowsRoot}\package.json`]: JSON.stringify({ version: '1.2.3-beta.4' }) };
    const windows = (files: Readonly<Record<string, string>>, env: ResolveTauCliInput['env']): ResolveTauCliInput =>
      host(files, {
        env,
        platform: 'win32',
        pluginRoot: windowsRoot,
        execPath: String.raw`C:\Program Files\nodejs\node.exe`,
      });

    it('should run the npm tau.cmd shim found on a semicolon-separated PATH', () => {
      const files = { ...windowsManifest, [String.raw`C:\Users\me\AppData\Roaming\npm\tau.cmd`]: '' };
      const cli = resolveTauCli(
        windows(files, { PATH: String.raw`C:\Windows\System32;C:\Users\me\AppData\Roaming\npm` }),
      );

      expect(cli).toEqual({ command: String.raw`C:\Users\me\AppData\Roaming\npm\tau.cmd`, args: ['mcp'] });
    });

    it('should fetch the CLI with npx.cmd and never probe Unix install folders', () => {
      const files = { ...windowsManifest, '/opt/homebrew/bin/tau': '', '/usr/local/bin/tau': '' };

      expect(resolveTauCli(windows(files, { PATH: String.raw`C:\Windows\System32` }))).toEqual({
        command: 'npx.cmd',
        args: ['--yes', '--package=@taucad/cli@1.2.3-beta.4', 'tau', 'mcp'],
      });
    });
  });
});
