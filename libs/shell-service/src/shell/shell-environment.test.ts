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

  it('lets a Terminal read the real store without an optional lock or the system config, and points it at no view', () => {
    const environment = shellEnvironment({ ...options, terminal: true });
    expect(environment).toMatchObject({ GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1' });
    expect(environment).not.toHaveProperty('GIT_DIR');
    expect(environment).not.toHaveProperty('GIT_WORK_TREE');
    const pipe = shellEnvironment({ ...options, terminal: false });
    expect(pipe).not.toHaveProperty('GIT_OPTIONAL_LOCKS');
    expect(pipe).not.toHaveProperty('GIT_CONFIG_NOSYSTEM');
  });

  it('lets a Terminal that writes the store take optional locks again, still without the system config', () => {
    const environment = shellEnvironment({ ...options, terminal: true, terminalGit: 'write' });
    expect(environment).toMatchObject({ GIT_CONFIG_NOSYSTEM: '1' });
    expect(environment).not.toHaveProperty('GIT_OPTIONAL_LOCKS');
    expect(shellEnvironment({ ...options, terminal: true, terminalGit: 'read' })).toMatchObject({
      GIT_OPTIONAL_LOCKS: '0',
    });
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

describe('shellEnvironment on Windows', () => {
  const windows = {
    ...options,
    platform: 'win32',
    executablePath: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
    home: String.raw`C:\Temp\tau-shell-1\home`,
    temporary: String.raw`C:\Temp\tau-shell-1\tmp`,
    host: {
      SystemRoot: String.raw`C:\WINDOWS`,
      USERNAME: 'me',
      APPDATA: String.raw`C:\Users\me\AppData\Roaming`,
    },
    terminal: false,
  } as const;

  it("keeps per-user application data inside the private home, never the host's", () => {
    expect(shellEnvironment(windows)).toMatchObject({
      USERPROFILE: String.raw`C:\Temp\tau-shell-1\home`,
      APPDATA: String.raw`C:\Temp\tau-shell-1\home\AppData\Roaming`,
      LOCALAPPDATA: String.raw`C:\Temp\tau-shell-1\home\AppData\Local`,
      TEMP: String.raw`C:\Temp\tau-shell-1\tmp`,
    });
  });

  it("gives PowerShell 7 its own modules first, then Windows PowerShell's", () => {
    expect(
      shellEnvironment({
        ...windows,
        executablePath: String.raw`C:\Program Files\PowerShell\7\pwsh.exe`,
      })['PSModulePath'],
    ).toBe(String.raw`C:\Program Files\PowerShell\7\Modules;C:\WINDOWS\System32\WindowsPowerShell\v1.0\Modules`);
  });

  it("gives Windows PowerShell 5.1 its own modules before the machine's, so no machine module folder hides them", () => {
    /* Named after its home, the machine folder is one 5.1 does not insert again before it. */
    expect(
      shellEnvironment({
        ...windows,
        executablePath: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
        host: { ...windows.host, ProgramW6432: String.raw`D:\Programs` },
      })['PSModulePath'],
    ).toBe(String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\Modules;D:\Programs\WindowsPowerShell\Modules`);
    expect(
      shellEnvironment({
        ...windows,
        executablePath: String.raw`C:\WINDOWS\system32\windowspowershell\v1.0\powershell.exe`,
        host: { SystemRoot: String.raw`C:\Windows` },
      })['PSModulePath'],
    ).toBe(String.raw`C:\WINDOWS\system32\windowspowershell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`);
  });

  it('points PowerShell at a module analysis cache only when the launch has one', () => {
    expect(shellEnvironment(windows)).not.toHaveProperty('PSModuleAnalysisCachePath');
    const file = String.raw`C:\Temp\tau-powershell-cache\v1-ab\ModuleAnalysisCache`;
    expect(shellEnvironment({ ...windows, powerShellModuleCache: file })['PSModuleAnalysisCachePath']).toBe(file);
  });

  it('builds only environments the sandbox provider admits', () => {
    const environment = shellEnvironment({
      ...windows,
      powerShellModuleCache: String.raw`C:\Temp\tau-powershell-cache\v1-ab\ModuleAnalysisCache`,
    });
    expect(refusedShellEnvironment(environment)).toStrictEqual([]);
  });
});
