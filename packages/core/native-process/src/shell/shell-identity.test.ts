/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  resolveShellExecutable,
  resolveTerminalZsh,
  shellCommandArguments,
  shellInteractiveArguments,
  terminalZshArguments,
  shellVersionCommand,
} from '#shell/shell-identity.js';

describe.runIf(process.platform === 'linux' || process.platform === 'darwin')('resolveShellExecutable', () => {
  it('should resolve /bin/bash and bind its digest', async () => {
    const real = realpathSync('/bin/bash');

    expect(await resolveShellExecutable({ platform: process.platform, environment: {} })).toStrictEqual({
      kind: 'bash',
      path: '/bin/bash',
      realPath: real,
      digest: `sha256:${createHash('sha256').update(readFileSync(real)).digest('hex')}`,
    });
  });
});

describe('resolveShellExecutable refusals', () => {
  it('should refuse a platform with no supported shell', async () => {
    expect(await resolveShellExecutable({ platform: 'freebsd', environment: {} })).toStrictEqual({
      status: 'shell-missing',
      message: 'freebsd has no supported shell.',
    });
  });

  it('should refuse Windows when neither fixed PowerShell path exists', async () => {
    expect(
      await resolveShellExecutable({ platform: 'win32', environment: { ProgramFiles: '/nonexistent-pf' } }),
    ).toMatchObject({ status: 'shell-missing' });
  });
});

describe('shell arguments', () => {
  it('should run Bash without startup files and PowerShell without a profile or policy override', () => {
    expect({
      bash: shellCommandArguments('bash', 'echo "$HOME"'),
      powershell: shellCommandArguments('powershell', 'Get-Date'),
      bashInteractive: shellInteractiveArguments('bash'),
      powershellInteractive: shellInteractiveArguments('powershell'),
      version: [shellVersionCommand('bash'), shellVersionCommand('powershell')],
    }).toStrictEqual({
      bash: ['--noprofile', '--norc', '-c', 'echo "$HOME"'],
      powershell: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Get-Date'],
      bashInteractive: ['--noprofile', '--norc', '-i'],
      powershellInteractive: ['-NoLogo', '-NoProfile'],
      version: ['printf %s "$BASH_VERSION"', '$PSVersionTable.PSVersion.ToString()'],
    });
  });
});

describe('resolveTerminalZsh', () => {
  it('should refuse every platform but macOS', async () => {
    expect(await resolveTerminalZsh('linux')).toStrictEqual({
      status: 'shell-missing',
      message: 'The Terminal runs the system Zsh only on macOS.',
    });
  });

  it.runIf(process.platform === 'darwin')('should bind /bin/zsh to its bytes on macOS', async () => {
    const zsh = await resolveTerminalZsh('darwin');
    if ('status' in zsh) {
      throw new Error(zsh.message);
    }

    expect(zsh.path).toBe('/bin/zsh');
    expect(zsh.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it('should start the Terminal Zsh as an interactive login shell', () => {
    expect(terminalZshArguments).toStrictEqual(['-l', '-i']);
  });
});
