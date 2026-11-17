/**
 * The locator on any runner (ACP agent policy rules 2 and 4): the file probe is
 * injected, so the Windows cases run on Linux and macOS too.
 */

import { posix, win32 } from 'node:path';

import { describe, expect, it } from 'vitest';

import { locateAcpCli, resolveAcpAdapterExecutable } from '#acp/locate.js';
import type { AcpExecutableFileSystem } from '#acp/locate.js';
import { acpAgentProfiles } from '#acp/registry.js';
import type { AcpAdapter } from '#acp/registry.js';

/**
 * A file system holding exactly the given executable files.
 *
 * @param files - Absolute paths, written with the platform's own separators.
 * @param path - `path.win32` or `path.posix`, matching how the files are written.
 * @returns The probe the locator reads.
 */
const virtualFileSystem = (files: readonly string[], path: typeof posix): AcpExecutableFileSystem => {
  /* Windows file names match case-insensitively. */
  const key = (file: string): string => (path === win32 ? path.normalize(file).toLowerCase() : path.normalize(file));
  const normalized = new Set(files.map((file) => key(file)));
  return {
    isExecutableFile: (candidate) => normalized.has(key(candidate)),
    listDirectory: (directory) => {
      const prefix = key(`${directory}${path.sep}`);
      return [
        ...new Set(
          [...normalized]
            .filter((file) => file.startsWith(prefix))
            .map((file) => file.slice(prefix.length).split(path.sep)[0] ?? ''),
        ),
      ];
    },
  };
};

const windowsHome = String.raw`C:\Users\tau`;

/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
const windowsEnvironment = { USERPROFILE: windowsHome, Path: String.raw`C:\Windows\system32;C:\npm` };
/* eslint-enable @typescript-eslint/naming-convention -- end of wire-named environments. */

describe('locateAcpCli on win32', () => {
  describe.each(acpAgentProfiles)('the $id profile', (profile) => {
    it.each(profile.fallbackExecutables.win32)('should resolve the win32 fallback %s', (entry) => {
      const file = win32.join(windowsHome, entry.slice(2));
      const location = locateAcpCli(profile, {
        platform: 'win32',
        environment: windowsEnvironment,
        home: windowsHome,
        ...virtualFileSystem([file], win32),
      });

      expect(location).toEqual({ found: true, executablePath: file, executableSource: 'fallback' });
    });
  });

  const claude = acpAgentProfiles.find((profile) => profile.id === 'claude');
  if (claude === undefined) {
    throw new Error('The reviewed set has no claude profile');
  }

  it('should skip a .cmd shim and name it in the refusal', () => {
    const shim = String.raw`C:\npm\claude.cmd`;
    const location = locateAcpCli(claude, {
      platform: 'win32',
      environment: windowsEnvironment,
      home: windowsHome,
      ...virtualFileSystem([shim, String.raw`C:\npm\claude.bat`], win32),
    });

    expect(location).toMatchObject({ found: false, skippedShims: [String.raw`C:\npm\claude.bat`, shim] });
    expect(location?.found === false ? location.message : '').toContain(shim);
  });

  it('should pick the .exe beside a shim, whatever PATHEXT lists first', () => {
    const location = locateAcpCli(claude, {
      platform: 'win32',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
      environment: { ...windowsEnvironment, PATHEXT: '.CMD;.BAT;.EXE' },
      home: windowsHome,
      ...virtualFileSystem([String.raw`C:\npm\claude.cmd`, String.raw`C:\npm\claude.exe`], win32),
    });

    expect(location).toEqual({ found: true, executablePath: String.raw`C:\npm\claude.exe`, executableSource: 'path' });
  });
});

describe('locateAcpCli with a versioned fallback', () => {
  const home = '/Users/tau';
  const bundled = (version: string): string =>
    `${home}/Library/Application Support/Claude/claude-code/${version}/485fdac4332e/claude.app/Contents/MacOS/claude`;
  const profile = {
    cli: 'claude',
    fallbackExecutables: {
      darwin: ['~/Library/Application Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude'],
    },
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
  const environment = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home };

  it('should order * expansions by descending version, with other names last', () => {
    const location = locateAcpCli(profile, {
      platform: 'darwin',
      environment,
      home,
      ...virtualFileSystem([bundled('latest'), bundled('2.1.99'), bundled('2.1.325')], posix),
    });

    expect(location).toEqual({ found: true, executablePath: bundled('2.1.325'), executableSource: 'fallback' });
  });

  it('should fall through to an older version when the newest directory holds no executable', () => {
    const fileSystem = virtualFileSystem([bundled('2.1.99'), bundled('latest')], posix);
    const location = locateAcpCli(profile, {
      platform: 'darwin',
      environment,
      home,
      isExecutableFile: fileSystem.isExecutableFile,
      listDirectory: (directory) =>
        directory.endsWith('claude-code') ? ['latest', '2.1.325', '2.1.99'] : fileSystem.listDirectory(directory),
    });

    expect(location).toMatchObject({ executablePath: bundled('2.1.99') });
  });

  it('should count the locations it searched when nothing is found', () => {
    const location = locateAcpCli(profile, { platform: 'darwin', environment, home, ...virtualFileSystem([], posix) });

    expect(location).toMatchObject({ found: false, skippedShims: [] });
    expect(location?.found === false ? location.message : '').toMatch(/PATH \(4 directories\).*1 declared location/u);
  });
});

describe('resolveAcpAdapterExecutable', () => {
  const home = '/Users/tau';
  const bundled = (version: string): string =>
    `${home}/Library/Application Support/Claude/claude-code/${version}/485fdac4332e/claude.app/Contents/MacOS/claude`;
  const adapter: AcpAdapter = {
    id: 'claude',
    displayName: 'Claude Code',
    cli: 'claude',
    args: [],
    configEnv: [],
    fallbackExecutables: {
      darwin: ['~/Library/Application Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude'],
    },
    executablePath: bundled('2.1.299'),
    executableSource: 'fallback',
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
  const environment = { PATH: '/usr/bin:/bin', HOME: home };

  it('should locate a * fallback again when its file is gone', () => {
    const relocated = resolveAcpAdapterExecutable(adapter, {
      environment,
      platform: 'darwin',
      fileSystem: virtualFileSystem([bundled('2.1.325')], posix),
    });

    expect(relocated).toMatchObject({ executablePath: bundled('2.1.325'), executableSource: 'fallback' });
  });

  it('should keep a fallback whose file is still there', () => {
    const fileSystem = virtualFileSystem([bundled('2.1.299'), bundled('2.1.325')], posix);

    expect(resolveAcpAdapterExecutable(adapter, { environment, platform: 'darwin', fileSystem })).toBe(adapter);
  });

  it('should leave a CLI found on PATH alone', () => {
    const onPath: AcpAdapter = { ...adapter, executablePath: '/usr/bin/claude', executableSource: 'path' };
    const fileSystem = virtualFileSystem([bundled('2.1.325')], posix);

    expect(resolveAcpAdapterExecutable(onPath, { environment, platform: 'darwin', fileSystem })).toBe(onPath);
  });

  it('should fail with CLI_NOT_FOUND when the fallback is gone and nothing replaces it', () => {
    let thrown: unknown;
    try {
      resolveAcpAdapterExecutable(adapter, {
        environment,
        platform: 'darwin',
        fileSystem: virtualFileSystem([], posix),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: 'CLI_NOT_FOUND' });
    expect(thrown instanceof Error ? thrown.message : '').toContain(bundled('2.1.299'));
  });
});
