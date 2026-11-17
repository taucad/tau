import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultConfigDirectory,
  defaultDependencyStore,
  hostCredentialPath,
  readHostCredential,
  removeHostCredential,
  writeHostCredential,
} from '#credential-store.js';
import type { HostCredential } from '#credential-store.js';

let temporaryDirectory: string | undefined;

afterEach(async () => {
  delete process.env['TAU_CONFIG_DIR'];
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true });
    temporaryDirectory = undefined;
  }
});

describe('host credential store', () => {
  it('atomically persists only the typed credential with user-only permissions', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-credential-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    const credential: HostCredential = { v: 1, deviceId: 'host_test', credential: 'x'.repeat(32) };

    await writeHostCredential(credential);

    expect(await readHostCredential()).toEqual(credential);
    const credentialStat = await stat(hostCredentialPath());
    /* Windows has no POSIX mode bits: Node reports any writable file as 0o666 there, and the credential is private
     * because it lives in the user's own profile (the APPDATA test below). */
    expect(credentialStat.mode % 0o1000).toBe(process.platform === 'win32' ? 0o666 : 0o600);
    expect(await readFile(hostCredentialPath(), 'utf8')).not.toContain('authorization');
    await removeHostCredential();
    expect(await readHostCredential()).toBeUndefined();
  });
});

describe('defaultConfigDirectory', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.runIf(process.platform === 'win32')(
    "should keep the credential in the user's own roaming profile on Windows, whose ACL admits only that user",
    () => {
      vi.stubEnv('TAU_CONFIG_DIR', '');
      vi.stubEnv('APPDATA', String.raw`C:\Users\ada\AppData\Roaming`);

      expect(hostCredentialPath()).toBe(String.raw`C:\Users\ada\AppData\Roaming\tau\host.json`);
    },
  );
});

describe('defaultDependencyStore', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should be <TAU_CONFIG_DIR>/dependencies when the one override is set', () => {
    vi.stubEnv('TAU_CONFIG_DIR', '/srv/tau-config');

    expect(defaultDependencyStore()).toBe(join('/srv/tau-config', 'dependencies'));
  });

  it.runIf(process.platform === 'linux')('should live under the XDG data root, never the config root, on Linux', () => {
    vi.stubEnv('TAU_CONFIG_DIR', '');
    vi.stubEnv('XDG_CONFIG_HOME', '/home/user/.config');
    vi.stubEnv('XDG_DATA_HOME', '/home/user/.local/share');

    expect(defaultDependencyStore()).toBe('/home/user/.local/share/tau/dependencies');
    expect(defaultDependencyStore().startsWith(defaultConfigDirectory())).toBe(false);
  });
});
