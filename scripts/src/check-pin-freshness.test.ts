import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkPinFreshness, freshnessReport } from '#check-pin-freshness.js';

const integrity = (algorithm: 'sha256' | 'sha512', text: string) =>
  `${algorithm}-${createHash(algorithm).update(text).digest('base64')}`;
const hex = (algorithm: 'sha256' | 'sha512', text: string) => createHash(algorithm).update(text).digest('hex');

const wheelUrl = 'https://files.pythonhosted.org/packages/7b/98/abc/demo_pkg-2.13.0-py3-none-any.whl';
const pbsUrl =
  'https://github.com/astral-sh/python-build-standalone/releases/download/20260901/cpython-3.13.15%2B20260901-aarch64-apple-darwin-install_only_stripped.tar.gz';
const pbsName = 'cpython-3.13.15+20260901-aarch64-apple-darwin-install_only_stripped.tar.gz';
const dotnetUrl = 'https://builds.dotnet.microsoft.com/dotnet/Runtime/10.0.11/dotnet-runtime-10.0.11-osx-arm64.tar.gz';
const layerUrl = 'https://cdn.tau.new/blobs/sha256/abc';

const byteLengths: Readonly<Record<string, number>> = {
  python: 6,
  'demo-pkg': 5,
  dotnet: 6,
  worker: 5,
  placeholder: 0,
};

const payload = (name: string, pin: string, urls: readonly string[]) => ({
  name,
  integrity: pin,
  byteLength: byteLengths[name],
  format: 'tar.gz',
  origin: { kind: 'url', urls },
  destination: name,
});

const manifest = {
  schemaVersion: 1,
  kernels: { demo: { requires: ['engine'], extensions: ['py'] } },
  dependencies: {
    engine: [
      {
        target: { runtime: 'native', os: 'darwin', arch: 'arm64' },
        payloads: [
          payload('python', integrity('sha256', 'python'), [pbsUrl]),
          payload('demo-pkg', integrity('sha256', 'wheel'), [wheelUrl]),
          payload('dotnet', integrity('sha512', 'dotnet'), [dotnetUrl]),
          payload('worker', integrity('sha256', 'layer'), [layerUrl, `${layerUrl}-mirror`]),
          // The fail-closed placeholder: never checked.
          payload('placeholder', `sha256-${createHash('sha256').digest('base64')}`, ['https://cdn.tau.new/none']),
        ],
      },
      {
        target: { runtime: 'native', os: 'darwin', arch: 'x64' },
        payloads: [payload('demo-pkg', integrity('sha256', 'wheel'), [wheelUrl])],
      },
    ],
  },
};

type Answer = { readonly status?: number; readonly body?: string; readonly headers?: Record<string, string> };

const transportOf = (answers: Readonly<Record<string, Answer>>, calls: string[]): typeof fetch =>
  (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const { url } = new Request(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const answer = answers[`${init?.method ?? 'GET'} ${url}`];
    if (answer === undefined) {
      throw new Error(`unrouted ${url}`);
    }
    return new Response(answer.body ?? null, { status: answer.status ?? 200, headers: answer.headers ?? {} });
  }) as typeof fetch;

const fresh: Record<string, Answer> = {
  [`HEAD ${pbsUrl}`]: { headers: { 'content-length': '6' } },
  [`HEAD ${wheelUrl}`]: { headers: { 'content-length': '5' } },
  [`HEAD ${dotnetUrl}`]: { headers: { 'content-length': '6' } },
  [`HEAD ${layerUrl}`]: { headers: { 'content-length': '5' } },
  [`HEAD ${layerUrl}-mirror`]: { headers: { 'content-length': '5' } },
  'GET https://pypi.org/pypi/demo-pkg/2.13.0/json': {
    body: JSON.stringify({
      urls: [
        { filename: 'demo_pkg-2.13.0.tar.gz', yanked: false, digests: { sha256: '0' } },
        { filename: 'demo_pkg-2.13.0-py3-none-any.whl', yanked: false, digests: { sha256: hex('sha256', 'wheel') } },
      ],
    }),
  },
  'GET https://github.com/astral-sh/python-build-standalone/releases/download/20260901/SHA256SUMS': {
    body: `${hex('sha256', 'other')}  cpython-3.12.0.tar.gz\n${hex('sha256', 'python')}  ${pbsName}\n`,
  },
  'GET https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json': {
    body: JSON.stringify({
      releases: [
        {
          runtime: {
            files: [
              { url: dotnetUrl.replace('osx-arm64', 'linux-x64'), hash: 'ff' },
              { url: dotnetUrl, hash: hex('sha512', 'dotnet').toUpperCase() },
            ],
          },
        },
      ],
    }),
  },
};

describe('check-pin-freshness', () => {
  let directory = '';
  let path = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pin-freshness-'));
    path = join(directory, 'tau-plugin.json');
    await writeFile(path, JSON.stringify(manifest));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('should report every pin fresh from HEAD and publisher metadata, without a GET of any payload', async () => {
    const calls: string[] = [];

    const rows = await checkPinFreshness([path], transportOf(fresh, calls));

    expect(rows.filter(({ status }) => status === 'drift')).toEqual([]);
    expect(rows.map(({ check }) => check).toSorted()).toEqual([
      'content-length',
      'content-length',
      'content-length',
      'content-length',
      'content-length',
      'content-length',
      'dotnet-releases',
      'pbs-sha256sums',
      'pypi',
    ]);
    expect(calls.filter((call) => call.startsWith('GET') && !/json|SHA256SUMS/u.test(call))).toEqual([]);
    expect(calls.some((call) => call.includes('/none'))).toBe(false);
    expect(freshnessReport(rows)).toContain('Every pin is fresh. No pin was changed');
  });

  it('should report a size change, a yanked wheel, a changed checksum and an unlisted runtime as drift', async () => {
    const drifted: Record<string, Answer> = {
      ...fresh,
      [`HEAD ${layerUrl}`]: { headers: { 'content-length': '9' } },
      [`GET ${layerUrl}`]: { status: 206, headers: { 'content-range': 'bytes 0-0/9' } },
      [`HEAD ${layerUrl}-mirror`]: { status: 404 },
      // A CDN that answers HEAD with a placeholder length: the ranged GET settles it.
      [`HEAD ${dotnetUrl}`]: { headers: { 'content-length': '20' } },
      [`GET ${dotnetUrl}`]: { status: 206, headers: { 'content-range': 'bytes 0-0/6' } },
      'GET https://pypi.org/pypi/demo-pkg/2.13.0/json': {
        body: JSON.stringify({
          // eslint-disable-next-line @typescript-eslint/naming-convention -- PyPI's own snake_case field
          urls: [{ filename: 'demo_pkg-2.13.0-py3-none-any.whl', yanked: true, yanked_reason: 'broken' }],
        }),
      },
      'GET https://github.com/astral-sh/python-build-standalone/releases/download/20260901/SHA256SUMS': {
        body: `${hex('sha256', 'replaced')}  ${pbsName}\n`,
      },
      'GET https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json': {
        body: JSON.stringify({ releases: [] }),
      },
    };

    const rows = await checkPinFreshness([path], transportOf(drifted, []));
    const drift = rows
      .filter(({ status }) => status === 'drift')
      .map(({ payload, check, detail }) => ({
        payload,
        check,
        detail,
      }));

    expect(drift).toEqual(
      expect.arrayContaining([
        { payload: 'engine/worker', check: 'content-length', detail: 'Content-Length 9, Content-Range 9, pinned 5' },
        { payload: 'engine/worker', check: 'content-length', detail: 'HEAD answered HTTP 404' },
        { payload: 'engine/demo-pkg', check: 'pypi', detail: 'yanked: broken' },
        {
          payload: 'engine/python',
          check: 'pbs-sha256sums',
          detail: `published ${hex('sha256', 'replaced')}, pinned ${hex('sha256', 'python')}`,
        },
        {
          payload: 'engine/dotnet',
          check: 'dotnet-releases',
          detail: 'releases.json for 10.0 does not list dotnet-runtime-10.0.11-osx-arm64.tar.gz',
        },
      ]),
    );
    expect(drift).toHaveLength(5);
    expect(rows).toContainEqual(
      expect.objectContaining({
        payload: 'engine/dotnet',
        check: 'content-length',
        status: 'fresh',
        detail: '6 bytes (Content-Range)',
      }),
    );
    expect(freshnessReport(rows)).toContain('**5 drifted pin checks.** No pin was changed');
  });

  it('should report unreachable publishers and transports as drift rather than passing them', async () => {
    const rows = await checkPinFreshness(
      [path],
      transportOf(
        {
          ...fresh,
          [`HEAD ${pbsUrl}`]: { status: 500 },
          [`HEAD ${wheelUrl}`]: {},
          [`GET ${wheelUrl}`]: { status: 200 },
          'GET https://pypi.org/pypi/demo-pkg/2.13.0/json': { status: 404 },
          'GET https://github.com/astral-sh/python-build-standalone/releases/download/20260901/SHA256SUMS': {
            status: 403,
          },
        },
        [],
      ),
    );
    const failing = await checkPinFreshness([path], transportOf({}, []));

    expect(rows.filter(({ status }) => status === 'drift').map(({ detail }) => detail)).toEqual(
      expect.arrayContaining([
        'HEAD answered HTTP 500',
        'Content-Length absent, Content-Range absent, pinned 5',
        'PyPI answered HTTP 404',
        'SHA256SUMS answered HTTP 403',
      ]),
    );
    expect(failing.every(({ status }) => status === 'drift')).toBe(true);
    expect(failing.map(({ detail }) => detail)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^HEAD failed: unrouted/u),
        expect.stringMatching(/^PyPI metadata unreadable/u),
        expect.stringMatching(/^SHA256SUMS unreadable/u),
        expect.stringMatching(/^releases.json unreadable/u),
      ]),
    );
  });
});
