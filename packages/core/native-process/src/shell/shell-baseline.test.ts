/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { shellBaselineDenied, zshStartupFiles } from '#shell/shell-baseline.js';

describe('shellBaselineDenied', () => {
  it('should deny Linux credential stores, startup files and runtime sockets', () => {
    const denied = shellBaselineDenied({
      platform: 'linux',
      home: '/home/person',
      environment: { XDG_RUNTIME_DIR: '/run/user/1000' },
    });

    expect(denied).toStrictEqual(
      expect.arrayContaining([
        '/home/person/.ssh',
        '/home/person/.aws',
        '/home/person/.config/gh',
        '/home/person/.bashrc',
        '/run/user/1000',
        '/run/dbus',
        '/var/run/docker.sock',
      ]),
    );
    expect(new Set(denied).size).toBe(denied.length);
  });

  it('should deny macOS keychains and runtime sockets', () => {
    expect(shellBaselineDenied({ platform: 'darwin', home: '/Users/person', environment: {} })).toStrictEqual(
      expect.arrayContaining(['/Users/person/Library/Keychains', '/Library/Keychains', '/private/var/run']),
    );
  });

  it('should deny the Windows credential vault and PowerShell profiles', () => {
    expect(
      shellBaselineDenied({
        platform: 'win32',
        home: String.raw`C:\Users\person`,
        environment: { APPDATA: String.raw`C:\Users\person\AppData\Roaming` },
      }),
    ).toStrictEqual(
      expect.arrayContaining([
        String.raw`C:\Users\person\.ssh`,
        String.raw`C:\Users\person\Documents\PowerShell`,
        String.raw`C:\Users\person\AppData\Roaming\Microsoft\Credentials`,
        String.raw`C:\Users\person\AppData\Local\Microsoft\Vault`,
      ]),
    );
  });
});

describe('zshStartupFiles', () => {
  it('should name exactly the four Zsh startup files, each still in the baseline', () => {
    const files = zshStartupFiles('/Users/person');

    expect(files).toStrictEqual([
      '/Users/person/.zshenv',
      '/Users/person/.zprofile',
      '/Users/person/.zshrc',
      '/Users/person/.zlogin',
    ]);
    expect(shellBaselineDenied({ platform: 'darwin', home: '/Users/person', environment: {} })).toStrictEqual(
      expect.arrayContaining([...files]),
    );
  });
});
