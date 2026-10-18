import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAuthService } from '#main/auth-service.js';
import { configureDesktopProfile } from '#main/profile.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const profile = (
  explicitUserData = '',
): { application: Parameters<typeof configureDesktopProfile>[0]; paths: Map<string, string> } => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-profile-'));
  directories.push(directory);
  const paths = new Map([
    ['appData', directory],
    ['userData', join(directory, 'Tau')],
    ['sessionData', join(directory, 'Tau')],
  ]);
  return {
    paths,
    application: {
      commandLine: { getSwitchValue: vi.fn((name: string) => (name === 'user-data-dir' ? explicitUserData : '')) },
      getPath: (name) => paths.get(name)!,
      setPath: (name, path) => {
        paths.set(name, path);
      },
      setName: vi.fn(),
    },
  };
};

describe('desktop channel profile', () => {
  it('should preserve production state paths', () => {
    const { application, paths } = profile();
    const previous = new Map(paths);
    configureDesktopProfile(application, 'production');
    expect(paths).toEqual(previous);
    expect(application.setName).toHaveBeenCalledWith('Tau');
  });

  it('should isolate staging sessions and the single-instance profile from production', () => {
    const { application, paths } = profile();
    const production = application.getPath('userData');
    configureDesktopProfile(application, 'staging');
    const staging = application.getPath('userData');
    expect(staging).toBe(join(application.getPath('appData'), 'Tau Staging'));
    expect(staging).not.toBe(production);
    expect(paths.get('sessionData')).toBe(staging);
    expect(existsSync(staging)).toBe(true);
    expect(application.setName).toHaveBeenCalledWith('Tau Staging');
    configureDesktopProfile(application, 'staging');
    expect(application.getPath('userData')).toBe(staging);
  });

  it('should honor an explicit Electron user data directory for staging', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-explicit-profile-'));
    directories.push(directory);
    const explicitUserData = join(directory, 'preview');
    const { application, paths } = profile(explicitUserData);
    const defaultStaging = join(application.getPath('appData'), 'Tau Staging');
    configureDesktopProfile(application, 'staging');
    expect(paths.get('userData')).toBe(explicitUserData);
    expect(paths.get('sessionData')).toBe(explicitUserData);
    expect(existsSync(explicitUserData)).toBe(true);
    expect(existsSync(defaultStaging)).toBe(false);
    expect(application.setName).toHaveBeenCalledWith('Tau Staging');
  });

  it('should retain production credentials when a staging session expires or rotates', async () => {
    const { application } = profile();
    const productionAuth = join(application.getPath('userData'), 'auth');
    mkdirSync(productionAuth, { recursive: true });
    const productionCredential = join(productionAuth, 'session.bin');
    writeFileSync(productionCredential, 'production-secret');
    configureDesktopProfile(application, 'staging');
    const stagingAuth = join(application.getPath('userData'), 'auth');
    mkdirSync(stagingAuth, { recursive: true });
    const stagingCredential = join(stagingAuth, 'session.bin');
    writeFileSync(stagingCredential, 'staging-secret');
    const responses = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: { id: 'staging-account' } }), {
          headers: { 'set-auth-token': 'staging-rotated' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const auth = createAuthService({
      apiUrl: 'https://api.taucad.dev',
      frontendUrl: 'https://taucad.dev',
      userDataPath: application.getPath('userData'),
      packaged: true,
      openExternal: async () => undefined,
      fetch: responses,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString(),
      },
    });
    try {
      await auth.restore();
      expect(auth.token()).toBe('staging-secret');
      await auth.refresh();
      expect(readFileSync(stagingCredential, 'utf8')).toBe('staging-rotated');
      expect(readFileSync(productionCredential, 'utf8')).toBe('production-secret');
      await auth.refresh();
      expect(auth.token()).toBeUndefined();
      expect(existsSync(stagingCredential)).toBe(false);
      expect(readFileSync(productionCredential, 'utf8')).toBe('production-secret');
    } finally {
      auth.dispose();
    }
  });
});
