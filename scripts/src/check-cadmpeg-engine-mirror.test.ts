import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkEngineMirror,
  installedEngines,
  mirrorDispatch,
  resolvedVersions,
  run,
} from '#check-cadmpeg-engine-mirror.js';
import type { EngineDigests } from '#check-cadmpeg-engine-mirror.js';

const gzip = new TextEncoder().encode('sldprt engine, gzipped');
const digestOf = (bytes: Uint8Array<ArrayBuffer>) => ({
  sha256: createHash('sha256').update(bytes).digest('hex'),
  byteLength: bytes.byteLength,
});
const digests: EngineDigests = { sldprt: { wasm: { sha256: 'a'.repeat(64), byteLength: 1 }, gzip: digestOf(gzip) } };
const hosts = ['https://production.test/', 'https://staging.test/'];
const blob = (host: string) => `${host}blobs/sha256/${digests['sldprt']!.gzip.sha256}`;
const immediately = async (): Promise<void> => {
  await Promise.resolve();
};
const noRetry = { attempts: 1, wait: immediately };

type Route = Uint8Array<ArrayBuffer> | number | 'throw' | 'redirect';
const serve =
  (routes: Readonly<Record<string, Route>>, seen: string[] = []): typeof fetch =>
  async (input, init) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    seen.push(url);
    expect(init?.redirect).toBe('error');
    const route = routes[url];
    if (route === undefined || route === 'throw') {
      throw new TypeError('fetch failed');
    }
    if (route === 'redirect') {
      throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') });
    }
    return typeof route === 'number' ? new Response(undefined, { status: route }) : new Response(route);
  };

const lockfile = (versions: Readonly<Record<string, string>>) =>
  [
    "lockfileVersion: '9.0'",
    'importers:',
    '  .:',
    '    dependencies:',
    '      zod:',
    '        specifier: 4.1.0',
    '        version: 4.1.0',
    ...Object.entries(versions).flatMap(([importer, version]) => [
      `  ${importer}:`,
      '    dependencies:',
      '      cadmpeg-ts:',
      `        specifier: ${version}`,
      `        version: ${version}`,
    ]),
    '',
  ].join('\n');

let directory: string | undefined;
afterEach(async () => {
  if (directory !== undefined) {
    await rm(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

const capture = () => {
  const out: string[] = [];
  const errors: string[] = [];
  return { out, errors, io: { out: (line: string) => out.push(line), err: (line: string) => errors.push(line) } };
};

describe('cadmpeg engine mirror check', () => {
  it('should read every resolved cadmpeg-ts version with the projects that install it', () => {
    expect(
      resolvedVersions(
        lockfile({
          'packages/plugins/cadmpeg': '0.1.0-beta.5',
          'apps/desktop': '0.1.0-beta.5',
          other: '0.1.0-beta.6(zod@4.1.0)',
        }),
      ),
    ).toEqual([
      { version: '0.1.0-beta.5', importers: ['apps/desktop', 'packages/plugins/cadmpeg'] },
      { version: '0.1.0-beta.6', importers: ['other'] },
    ]);
    expect(() => resolvedVersions('packages: {}')).toThrow('Not a pnpm lockfile');
  });

  it('should pass when both hosts serve every gzip engine whole with its digest', async () => {
    const seen: string[] = [];
    const transport = serve({ [blob(hosts[0]!)]: gzip, [blob(hosts[1]!)]: gzip }, seen);
    expect(await checkEngineMirror({ digests, hosts, transport, retry: noRetry })).toEqual([]);
    expect(seen.sort()).toEqual([blob(hosts[0]!), blob(hosts[1]!)]);
  });

  it('should name each engine a host does not serve, serves short, serves different or redirects', async () => {
    const wrong = new Uint8Array(gzip);
    wrong[0] = 0;
    const longer = new Uint8Array([...gzip, 1]);
    const cases: ReadonlyArray<readonly [Route, string]> = [
      [404, 'answered HTTP 404'],
      [gzip.slice(1), `served ${String(gzip.byteLength - 1)} bytes, not ${String(gzip.byteLength)}`],
      [longer, `served more than bytes, not ${String(gzip.byteLength)}`],
      [wrong, `does not hash to ${digests['sldprt']!.gzip.sha256}`],
      ['redirect', 'could not be fetched: fetch failed'],
    ];
    for (const [route, reason] of cases) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const failures = await checkEngineMirror({
        digests,
        hosts,
        transport: serve({ [blob(hosts[0]!)]: gzip, [blob(hosts[1]!)]: route }),
        retry: noRetry,
      });
      expect(failures).toEqual([`sldprt: ${blob(hosts[1]!)} ${reason}`]);
    }
  });

  it('should retry a blob that is not served yet, and not one with other bytes', async () => {
    let calls = 0;
    const transport: typeof fetch = async () => {
      calls++;
      return calls === 1 ? new Response(undefined, { status: 404 }) : new Response(gzip);
    };
    expect(
      await checkEngineMirror({ digests, hosts: [hosts[0]!], transport, retry: { attempts: 3, wait: immediately } }),
    ).toEqual([]);
    expect(calls).toBe(2);

    const wrong = new Uint8Array(gzip);
    wrong[0] = 0;
    calls = 0;
    const tampered: typeof fetch = async () => {
      calls++;
      return new Response(wrong);
    };
    await checkEngineMirror({
      digests,
      hosts: [hosts[0]!],
      transport: tampered,
      retry: { attempts: 3, wait: immediately },
    });
    expect(calls).toBe(1);
  });

  it('should prove nothing when the resolved versions equal the base', async () => {
    directory = await mkdtemp(join(tmpdir(), 'cadmpeg-mirror-'));
    const base = join(directory, 'base.yaml');
    await writeFile(base, lockfile({ 'packages/plugins/cadmpeg': '0.1.0-beta.5' }));
    const { out, io } = capture();
    const code = await run(['--base-lockfile', base], io, {
      transport: serve({}),
      retry: noRetry,
      hosts,
      lockfile: async () => lockfile({ 'packages/plugins/cadmpeg': '0.1.0-beta.5' }),
      installed: async () => {
        throw new Error('not read');
      },
    });
    expect(code).toBe(0);
    expect(out).toEqual(['cadmpeg-ts resolves to 0.1.0-beta.5, as on the base; no engine to prove.']);
  });

  it('should fail a bump to an unmirrored version and name the dispatch to run', async () => {
    directory = await mkdtemp(join(tmpdir(), 'cadmpeg-mirror-'));
    const base = join(directory, 'base.yaml');
    await writeFile(base, lockfile({ 'packages/plugins/cadmpeg': '0.1.0-beta.5' }));
    const { out, errors, io } = capture();
    const code = await run(['--base-lockfile', base], io, {
      transport: serve({ [blob(hosts[0]!)]: gzip }),
      retry: noRetry,
      hosts,
      lockfile: async () => lockfile({ 'packages/plugins/cadmpeg': '0.1.0-beta.6' }),
      installed: async () => ({ version: '0.1.0-beta.6', digests }),
    });
    expect(code).toBe(1);
    expect(out).toEqual(['cadmpeg-ts changes from 0.1.0-beta.5 to 0.1.0-beta.6.']);
    expect(errors.join('\n')).toContain(`sldprt: ${blob(hosts[1]!)} could not be fetched`);
    expect(errors.join('\n')).toContain(mirrorDispatch('0.1.0-beta.6'));
    expect(mirrorDispatch('0.1.0-beta.6')).toBe(
      'gh workflow run dependency-files-publish.yml --ref main -f cadmpeg-version=0.1.0-beta.6',
    );
  });

  it('should pass a bump to a version both hosts serve', async () => {
    const { out, io } = capture();
    const code = await run([], io, {
      transport: serve({ [blob(hosts[0]!)]: gzip, [blob(hosts[1]!)]: gzip }),
      retry: noRetry,
      hosts,
      lockfile: async () => lockfile({ 'packages/plugins/cadmpeg': '0.1.0-beta.6' }),
      installed: async () => ({ version: '0.1.0-beta.6', digests }),
    });
    expect(code).toBe(0);
    expect(out).toEqual(['cadmpeg-ts 0.1.0-beta.6: both hosts serve all 1 gzip engines with their digests.']);
  });

  it('should refuse an install that differs from the lockfile', async () => {
    const { errors, io } = capture();
    const code = await run([], io, {
      transport: serve({}),
      retry: noRetry,
      hosts,
      lockfile: async () => lockfile({ 'packages/plugins/cadmpeg': '0.1.0-beta.6' }),
      installed: async () => ({ version: '0.1.0-beta.5', digests }),
    });
    expect(code).toBe(1);
    expect(errors).toEqual([
      'packages/plugins/cadmpeg installs cadmpeg-ts 0.1.0-beta.5, but the lockfile resolves 0.1.0-beta.6; run pnpm install.',
    ]);
  });

  it('should refuse unknown arguments', async () => {
    const { errors, io } = capture();
    expect(await run(['--base'], io)).toBe(2);
    expect(errors[0]).toContain('Usage:');
  });

  it('should read the 13 engines of the cadmpeg-ts the plugin installs', async () => {
    const installed = await installedEngines('packages/plugins/cadmpeg');
    expect(installed.version).toMatch(/^\d+\.\d+\.\d+/u);
    expect(Object.keys(installed.digests)).toHaveLength(13);
  });
});
