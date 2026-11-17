import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { admitOtaProbe, prepareOtaProbe } from '#main/ota-probe.js';

const roots: string[] = [];
const fixture = (channel: 'staging' | 'production' = 'staging') => {
  const profile = mkdtempSync(join(tmpdir(), 'tau-ota-test-'));
  roots.push(profile);
  return {
    profile,
    channel,
    appPath: '/tmp/Tau.app',
    version: '1.0.1',
    packaged: true,
    arguments: [`--tau-ota-probe=${channel === 'staging' ? 'desktop-staging@0.1.0-staging.2' : 'desktop@1.0.2'}`],
  };
};
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('OTA probe', () => {
  it.each(['staging', 'production'] as const)(
    'should observe a retained sentinel after a different process relaunches %s',
    (channel) => {
      const options = fixture(channel);
      const original = prepareOtaProbe(options);
      original?.complete();
      const pending = join(options.profile, 'ota-probe.pending.json');
      const receipt = z.looseObject({ sourcePid: z.number() }).parse(JSON.parse(readFileSync(pending, 'utf8')));
      writeFileSync(pending, JSON.stringify({ ...receipt, sourcePid: process.pid + 1 }));
      const updated = prepareOtaProbe({ ...options, arguments: [], version: '1.0.2' });
      updated?.complete();
      const result = z
        .looseObject({ version: z.string(), pid: z.number(), sentinel: z.string() })
        .parse(JSON.parse(readFileSync(join(options.profile, 'ota-probe.result.json'), 'utf8')));
      expect(result.version).toBe('1.0.2');
      expect(result.pid).toBe(process.pid);
      expect(readFileSync(join(options.profile, 'ota-probe-retained.txt'), 'utf8')).toBe(result.sentinel);
    },
  );

  it('should refuse existing user data and leave it unchanged', () => {
    const options = fixture();
    writeFileSync(join(options.profile, 'project'), 'unsaved work');
    expect(() => prepareOtaProbe(options)).toThrow(
      new Error('OTA probes require an empty default profile in a disposable runner account'),
    );
    expect(readFileSync(join(options.profile, 'project'), 'utf8')).toBe('unsaved work');
  });

  it('should reject cross-channel and unpackaged invocations', () => {
    const options = fixture();
    expect(() => prepareOtaProbe({ ...options, channel: 'production' })).toThrow(
      new Error('OTA probe candidate must belong to the installed channel'),
    );
    expect(() => prepareOtaProbe({ ...options, packaged: false })).toThrow(
      new Error('OTA probes require a packaged application'),
    );
  });

  it('should reject a changed candidate or expired receipt', () => {
    const options = fixture();
    prepareOtaProbe(options);
    expect(() =>
      prepareOtaProbe({ ...options, arguments: ['--tau-ota-probe=desktop-staging@0.1.0-staging.3'] }),
    ).toThrow(new Error('OTA probe argument disagrees with the pending candidate'));
    const pending = join(options.profile, 'ota-probe.pending.json');
    const receipt = z.looseObject({ startedAt: z.number() }).parse(JSON.parse(readFileSync(pending, 'utf8')));
    writeFileSync(pending, JSON.stringify({ ...receipt, startedAt: Date.now() - 31 * 60 * 1000 }));
    expect(() => prepareOtaProbe({ ...options, arguments: [] })).toThrow(
      new Error('OTA probe installation identity or expiry is invalid'),
    );
  });
});

describe('leftover OTA receipt on an ordinary launch', () => {
  /* A receipt left by a probe run whose target never relaunched, then aged or damaged another way. */
  const leftover = (rewrite: (receipt: Record<string, unknown>, pending: string) => void) => {
    const options = fixture();
    prepareOtaProbe(options);
    const pending = join(options.profile, 'ota-probe.pending.json');
    rewrite(z.looseObject({}).parse(JSON.parse(readFileSync(pending, 'utf8'))), pending);
    return options;
  };
  const damages: ReadonlyArray<readonly [string, (receipt: Record<string, unknown>, pending: string) => void]> = [
    [
      '31 minutes old',
      (receipt, pending) => {
        writeFileSync(pending, JSON.stringify({ ...receipt, startedAt: Date.now() - 31 * 60 * 1000 }));
      },
    ],
    [
      'not JSON',
      (_receipt, pending) => {
        writeFileSync(pending, 'not json');
      },
    ],
    [
      'from another app path',
      (receipt, pending) => {
        writeFileSync(pending, JSON.stringify({ ...receipt, appPath: '/Applications/Other.app' }));
      },
    ],
  ];

  it.each(damages)('should boot as no probe and report once for a receipt %s', (_name, rewrite) => {
    const options = leftover(rewrite);
    const ignored = vi.fn();
    expect(admitOtaProbe({ ...options, arguments: [] }, ignored)).toBeUndefined();
    expect(ignored).toHaveBeenCalledOnce();
    expect(ignored.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it.each(damages)('should stay strict for a receipt %s when the probe argument is present', (_name, rewrite) => {
    const options = leftover(rewrite);
    const ignored = vi.fn();
    expect(() => admitOtaProbe(options, ignored)).toThrow();
    expect(ignored).not.toHaveBeenCalled();
  });
});
