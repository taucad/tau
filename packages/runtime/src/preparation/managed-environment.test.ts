/* eslint-disable @typescript-eslint/naming-convention -- environment variable names are SCREAMING_SNAKE_CASE. */
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { describeEffectiveProfile, readManagedPreparation } from '#preparation/managed-environment.js';
import type { ClosureDescription, PreparationHost } from '#preparation/preparation-host.types.js';

import { linuxHost } from '#preparation/preparation.fixture.js';

describe('readManagedPreparation', () => {
  it('should default to the open profile with no mirror, seed or override', () => {
    expect(readManagedPreparation({})).toEqual({ profile: 'open', selection: {}, offline: false });
  });

  it('should make locked imply no-fallback through the mirror', () => {
    expect(
      readManagedPreparation({ TAU_ACQUISITION: 'locked', TAU_PAYLOAD_MIRROR: 'https://mirror.corp.example/tau/' }),
    ).toEqual({
      profile: 'locked',
      mirror: { baseUrl: 'https://mirror.corp.example/tau/', noFallback: true },
      selection: {},
      offline: false,
    });
  });

  it('should make locked without a mirror use the store and seed only', () => {
    expect(readManagedPreparation({ TAU_ACQUISITION: 'locked', TAU_PAYLOAD_DIR: '/opt/tau-seed' })).toEqual({
      profile: 'locked',
      seed: '/opt/tau-seed',
      selection: {},
      offline: true,
    });
  });

  it('should read the target override and the emulation switch', () => {
    expect(
      readManagedPreparation({
        TAU_PAYLOAD_TARGET: 'darwin-x64',
        TAU_PAYLOAD_EMULATION: '0',
        TAU_PAYLOAD_MIRROR: 'file:///srv/mirror/',
        TAU_PAYLOAD_MIRROR_NO_FALLBACK: '1',
      }),
    ).toEqual({
      profile: 'open',
      mirror: { baseUrl: 'file:///srv/mirror/', noFallback: true },
      selection: { target: 'darwin-x64', emulation: false },
      offline: false,
    });
  });

  it.each([
    [{ TAU_ACQUISITION: 'closed' }, 'TAU_ACQUISITION is "closed"; set it to "open" or "locked", or unset it.'],
    [
      { TAU_PAYLOAD_MIRROR: 'ftp://mirror.example/' },
      'TAU_PAYLOAD_MIRROR is "ftp://mirror.example/"; set it to an https://, http:// or file:// base URL whose blobs/sha256/<hex> serves each payload.',
    ],
    [
      { TAU_PAYLOAD_EMULATION: 'off' },
      'TAU_PAYLOAD_EMULATION is "off"; set it to "0" to disable the emulation fallback.',
    ],
  ])('should refuse %j with an actionable TypeError', (environment, message) => {
    expect(() => readManagedPreparation(environment)).toThrow(new TypeError(message));
  });
});

describe('describeEffectiveProfile', () => {
  const closures: readonly ClosureDescription[] = [
    { package: '@taucad/build123d', dependency: 'engine', state: 'absent', byteLength: 112_000_000 },
  ];
  const host = mock<PreparationHost>({ describe: async () => closures });

  it('should report env-proxy only when Node is told to use it and a proxy is set', async () => {
    const managed = readManagedPreparation({});
    const withoutFlag = await describeEffectiveProfile({
      host,
      store: '/data/tau/payloads',
      indicators: linuxHost,
      managed,
      environment: { HTTPS_PROXY: 'http://proxy.corp.example:3128' },
      execArgv: [],
    });
    const withFlag = await describeEffectiveProfile({
      host,
      store: '/data/tau/payloads',
      indicators: linuxHost,
      managed,
      environment: { HTTPS_PROXY: 'http://proxy.corp.example:3128', NODE_OPTIONS: '--use-env-proxy' },
      execArgv: [],
    });

    expect(withoutFlag.proxy).toBe('none');
    expect(withFlag.proxy).toBe('env-proxy');
  });

  it('should assemble the profile an auditor reads', async () => {
    const profile = await describeEffectiveProfile({
      host,
      store: '/data/tau/payloads',
      indicators: linuxHost,
      managed: readManagedPreparation({
        TAU_ACQUISITION: 'locked',
        TAU_PAYLOAD_MIRROR: 'https://mirror.corp.example/',
      }),
      environment: {
        NODE_EXTRA_CA_CERTS: '/etc/corp-ca.pem',
        HTTPS_PROXY: 'http://user:secret@proxy.corp.example:3128',
        TAU_ACQUISITION: 'locked',
        TAU_PAYLOAD_MIRROR: 'https://mirror.corp.example/',
        TAU_PAYLOAD_DIR: ' ',
        UNRELATED: 'value',
      },
      execArgv: ['--use-system-ca'],
    });

    expect(profile).toEqual({
      profile: 'locked',
      store: '/data/tau/payloads',
      host: linuxHost,
      mirror: 'https://mirror.corp.example/',
      noFallback: true,
      emulation: true,
      proxy: 'none',
      ca: 'system',
      variables: ['TAU_ACQUISITION', 'TAU_PAYLOAD_MIRROR', 'HTTPS_PROXY', 'NODE_EXTRA_CA_CERTS'],
      closures,
    });
    expect(JSON.stringify(profile)).not.toContain('secret');
  });
});
