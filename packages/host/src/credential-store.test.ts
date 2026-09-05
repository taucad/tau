import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
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
    expect(credentialStat.mode % 0o1000).toBe(0o600);
    expect(await readFile(hostCredentialPath(), 'utf8')).not.toContain('authorization');
    await removeHostCredential();
    expect(await readHostCredential()).toBeUndefined();
  });
});
