import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* oxlint-disable no-restricted-imports -- `pnpm plugin:dev` runs this script by path; the `#` import map covers only src/. */
import {
  desktopConfigPath,
  desktopServerName,
  devPlugin,
  missingBuiltFiles,
  pluginRows,
  previewUrl,
  publishedPlugin,
  withDesktopServer,
  withoutDevPlugin,
} from './dev.js';
/* oxlint-enable no-restricted-imports */

describe('desktopConfigPath', () => {
  it("names Claude Desktop's config file on each platform", () => {
    expect(desktopConfigPath('darwin', '/Users/a', {})).toBe(
      join('/Users/a', 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    );
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Windows names the variable APPDATA.
    expect(desktopConfigPath('win32', 'C:/Users/a', { APPDATA: 'C:/Users/a/AppData/Roaming' })).toBe(
      join('C:/Users/a/AppData/Roaming', 'Claude', 'claude_desktop_config.json'),
    );
    expect(desktopConfigPath('linux', '/home/a', {})).toBe(
      join('/home/a', '.config', 'Claude', 'claude_desktop_config.json'),
    );
  });
});

describe('withDesktopServer', () => {
  const server = { command: '/usr/bin/node', args: ['/repo/packages/agent-plugin/dist/launch.mjs', '--project', '/p'] };

  it('adds the tau-dev server and keeps every other server and setting', () => {
    const config = { mcpServers: { tau: { command: 'node', args: ['launch.mjs'] } }, globalShortcut: 'Alt+Space' };

    expect(withDesktopServer(config, server)).toEqual({
      mcpServers: { tau: { command: 'node', args: ['launch.mjs'] }, [desktopServerName]: server },
      globalShortcut: 'Alt+Space',
    });
  });

  it('starts a config when there is none', () => {
    expect(withDesktopServer(undefined, server)).toEqual({ mcpServers: { [desktopServerName]: server } });
  });

  it('removes only the tau-dev server', () => {
    const config = { mcpServers: { tau: { command: 'node' }, [desktopServerName]: server } };

    expect(withDesktopServer(config, undefined)).toEqual({ mcpServers: { tau: { command: 'node' } } });
  });
});

describe('pluginRows', () => {
  it("reads Claude Code's per-scope rows", () => {
    const list = [
      { id: devPlugin, scope: 'project', enabled: true, installPath: '/cache' },
      { id: publishedPlugin, scope: 'user', enabled: false },
    ];

    expect(pluginRows(list)).toEqual([
      { id: devPlugin, scope: 'project', enabled: true },
      { id: publishedPlugin, scope: 'user', enabled: false },
    ]);
  });

  it("reads Codex's installed list", () => {
    expect(
      pluginRows({ installed: [{ pluginId: publishedPlugin, name: 'tau', enabled: true }], available: [] }),
    ).toEqual([{ id: publishedPlugin, enabled: true }]);
  });

  it('has no rows for output it does not recognise', () => {
    expect(pluginRows(undefined)).toEqual([]);
    expect(pluginRows({ plugins: [{ id: publishedPlugin, enabled: true }] })).toEqual([]);
    expect(pluginRows([null, { enabled: true }])).toEqual([]);
  });
});

describe('withoutDevPlugin', () => {
  it('removes only the tau-dev entry and keeps every other setting', () => {
    const settings = { hooks: {}, enabledPlugins: { [devPlugin]: true, [publishedPlugin]: true } };

    expect(withoutDevPlugin(settings)).toEqual({ hooks: {}, enabledPlugins: { [publishedPlugin]: true } });
  });

  it('drops the empty enabledPlugins an uninstall leaves', () => {
    expect(withoutDevPlugin({ hooks: {}, enabledPlugins: { [devPlugin]: true } })).toEqual({ hooks: {} });
    expect(withoutDevPlugin({ hooks: {}, enabledPlugins: {} })).toEqual({ hooks: {} });
  });

  it('leaves settings with nothing to remove alone', () => {
    expect(withoutDevPlugin({ hooks: {} })).toBeUndefined();
    expect(withoutDevPlugin({ enabledPlugins: { [publishedPlugin]: true } })).toBeUndefined();
  });
});

describe('previewUrl', () => {
  it('names the long-form pkg.pr.new tarball of a workspace package', () => {
    expect(previewUrl('@taucad/agent-plugin', 'abc1234')).toBe(
      'https://pkg.pr.new/taucad/tau/@taucad/agent-plugin@abc1234',
    );
  });
});

describe('missingBuiltFiles', () => {
  const root = join('/p', 'plugin');
  const present = (files: readonly string[]) => (path: string) => files.some((file) => join(root, file) === path);

  it('requires the .dev/cli.json pointer only in the workspace folder', () => {
    const installed = present(['dist/launch.mjs', 'dist/doctor.mjs', 'dist-app/app.html', 'skills/tau/SKILL.md']);

    expect(missingBuiltFiles(root, false, installed)).toEqual([]);
    expect(missingBuiltFiles(root, true, installed)).toEqual(['.dev/cli.json']);
  });

  it('names every missing file of an installed folder', () => {
    expect(missingBuiltFiles(root, false, present(['skills/tau/SKILL.md']))).toEqual([
      'dist/launch.mjs',
      'dist/doctor.mjs',
      'dist-app/app.html',
    ]);
  });
});
