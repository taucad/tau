import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* oxlint-disable no-restricted-imports -- `pnpm plugin:dev` runs this script by path; the `#` import map covers only src/. */
import {
  connect,
  desktopConfigPath,
  desktopServerName,
  missingBuiltFiles,
  previewUrl,
  withDesktopServer,
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
    const installed = present(['dist/launch.mjs', 'dist-app/app.html', 'skills/tau/SKILL.md']);

    expect(missingBuiltFiles(root, false, installed)).toEqual([]);
    expect(missingBuiltFiles(root, true, installed)).toEqual(['.dev/cli.json']);
  });

  it('names every missing file of an installed folder', () => {
    expect(missingBuiltFiles(root, false, present(['skills/tau/SKILL.md']))).toEqual([
      'dist/launch.mjs',
      'dist-app/app.html',
    ]);
  });
});

describe('connect', () => {
  it('fails a request the server never answers, with its stderr', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-plugin-silent-'));
    mkdirSync(join(root, 'dist'));
    /* A server that started, said something and then answers nothing. */
    writeFileSync(join(root, 'dist', 'launch.mjs'), "process.stderr.write('listening\\n');\nprocess.stdin.resume();\n");
    const { child, request } = connect(root, [], 2000);
    try {
      await expect(request('initialize', {})).rejects.toThrow('initialize got no answer in 2 s:\nlistening');
    } finally {
      child.kill('SIGKILL');
      rmSync(root, { recursive: true, force: true });
    }
  });
});
