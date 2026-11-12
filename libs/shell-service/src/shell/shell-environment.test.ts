/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
import { refusedShellEnvironment } from '@taucad/sandbox/shell/environment';
import { describe, expect, it } from 'vitest';
import { shellEnvironment } from '#shell/shell-environment.js';

const options = {
  platform: 'darwin',
  executablePath: '/bin/zsh',
  home: '/private/home',
  temporary: '/private/tmp',
  toolchainBins: [],
  host: {},
} as const;

describe('shellEnvironment', () => {
  it('asks a Terminal for colour, including BSD ls', () => {
    const environment = shellEnvironment({ ...options, terminal: true });
    expect(environment).toMatchObject({ TERM: 'xterm-256color', COLORTERM: 'truecolor', CLICOLOR: '1' });
  });

  it('keeps a pipe launch plain', () => {
    const environment = shellEnvironment({ ...options, terminal: false });
    expect(environment['TERM']).toBe('dumb');
    expect(environment).not.toHaveProperty('COLORTERM');
    expect(environment).not.toHaveProperty('CLICOLOR');
  });

  it('points git at a read-only view when the launch has one', () => {
    const environment = shellEnvironment({
      ...options,
      terminal: false,
      git: { directory: '/private/root/git', objects: '/project/.git/objects', workTree: '/project' },
    });
    expect(environment).toMatchObject({
      GIT_DIR: '/private/root/git',
      GIT_WORK_TREE: '/project',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_CONFIG_NOSYSTEM: '1',
    });
    expect(shellEnvironment({ ...options, terminal: false })).not.toHaveProperty('GIT_DIR');
  });

  it('builds only environments the sandbox provider admits', () => {
    const git = { directory: '/private/root/git', objects: '/project/.git/objects', workTree: '/project' };
    for (const platform of ['darwin', 'linux'] as const) {
      for (const terminal of [true, false]) {
        expect(refusedShellEnvironment(shellEnvironment({ ...options, platform, terminal, git }))).toStrictEqual([]);
      }
    }
  });
});
