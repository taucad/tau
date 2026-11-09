/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
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
});
