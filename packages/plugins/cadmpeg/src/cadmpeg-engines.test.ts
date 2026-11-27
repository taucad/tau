import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CadmpegError } from 'cadmpeg-ts/core';

import { CadmpegEngineError, createEngineLocator, engineIssue } from '#cadmpeg-engines.js';
import type { CadmpegEngineIssueDetails, EngineDigests } from '#cadmpeg-engines.js';

// A stand-in module: the WebAssembly magic, version 1, and enough body for gzip to matter.
const wasm = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00,
  ...Array.from({ length: 4096 }, (_, i) => i % 7),
]);
const gzip: Uint8Array<ArrayBuffer> = new Uint8Array(gzipSync(wasm));
const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const file = (bytes: Uint8Array<ArrayBuffer>) => ({ sha256: sha256(bytes), byteLength: bytes.byteLength });
const digests: EngineDigests = { sldprt: { wasm: file(wasm), gzip: file(gzip) } };

const base = 'https://dependencies.example.test/';
const blobUrl = `${base}blobs/sha256/${digests['sldprt']!.gzip.sha256}`;
const packageUrl = `${base}sldprt_bg.wasm`;

const fetchMock = vi.fn<typeof fetch>();
const serve = (body: Uint8Array<ArrayBuffer>, init?: ResponseInit): Response =>
  new Response(new Uint8Array(body), init);
const flipped = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(bytes);
  const middle = Math.floor(copy.length / 2);
  copy[middle] = 255 - copy[middle]!;
  return copy;
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The refusal of one load, with its issue's details. */
const refusal = async (promise: Promise<unknown>): Promise<CadmpegEngineIssueDetails & { code: string }> => {
  const error = await promise.then(
    () => expect.unreachable('the engine was admitted'),
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(CadmpegEngineError);
  const [issue] = (error as CadmpegEngineError).issues;
  expect(issue).toMatchObject({ type: 'kernel', severity: 'error' });
  expect(issue.message).toContain('sldprt');
  expect(issue.message).toContain('dependencies.example.test');
  return { code: issue.code, ...(issue.details as CadmpegEngineIssueDetails) };
};

describe.each([
  { layout: 'digest', url: blobUrl, served: gzip, file: 'gzip' },
  { layout: 'package', url: packageUrl, served: wasm, file: 'wasm' },
] as const)('createEngineLocator, $layout layout', ({ layout, url, served, file: servedFile }) => {
  const locate = (): ((id: string) => Promise<Response>) =>
    createEngineLocator({ engines: { baseUrl: base, layout }, digests });

  it('fetches one URL without following redirects and hands over the verified module', async () => {
    fetchMock.mockResolvedValueOnce(serve(served));
    const response = await locate()('sldprt');
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(url, { redirect: 'error' });
    expect(response.headers.get('Content-Type')).toBe('application/wasm');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(wasm);
  });

  it('refuses a flipped byte as a digest mismatch', async () => {
    fetchMock.mockResolvedValueOnce(serve(flipped(served)));
    await expect(refusal(locate()('sldprt'))).resolves.toMatchObject({
      code: 'KERNEL_BINDING_FAILED',
      engineFailure: 'integrity',
      check: 'sha256',
      file: servedFile,
      format: 'sldprt',
      host: 'dependencies.example.test',
      url,
    });
  });

  it('refuses a short body as a length mismatch', async () => {
    fetchMock.mockResolvedValueOnce(serve(served.subarray(0, -1)));
    await expect(refusal(locate()('sldprt'))).resolves.toMatchObject({
      engineFailure: 'integrity',
      check: 'byteLength',
      file: servedFile,
    });
  });

  it('refuses a redirect, whether fetch rejects it or a response reports it', async () => {
    fetchMock.mockRejectedValueOnce(
      new TypeError('fetch failed', { cause: new Error('redirect mode is set to error') }),
    );
    await expect(refusal(locate()('sldprt'))).resolves.toMatchObject({ engineFailure: 'redirect' });
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: new Headers([['Location', 'https://elsewhere.test/']]) }),
    );
    await expect(refusal(locate()('sldprt'))).resolves.toMatchObject({ engineFailure: 'redirect', status: 302 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses a 404 with its status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    await expect(refusal(locate()('sldprt'))).resolves.toMatchObject({ engineFailure: 'status', status: 404 });
  });

  it('reports an unreachable host and succeeds on the next attempt without a new locator', async () => {
    const locator = locate();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') }));
    await expect(refusal(locator('sldprt'))).resolves.toMatchObject({ engineFailure: 'unreachable' });
    fetchMock.mockResolvedValueOnce(serve(served));
    const response = await locator('sldprt');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(wasm);
  });

  it('refuses a module the digest map does not name', async () => {
    await expect(locate()('nx')).rejects.toMatchObject({ issues: [{ code: 'KERNEL_NOT_PREPARED' }] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createEngineLocator, digest layout after decompression', () => {
  it('refuses gzip bytes that match their digest but decompress to another module', async () => {
    const other: EngineDigests = { sldprt: { wasm: file(flipped(wasm)), gzip: file(gzip) } };
    fetchMock.mockResolvedValueOnce(serve(gzip));
    const locate = createEngineLocator({ engines: { baseUrl: base, layout: 'digest' }, digests: other });
    await expect(refusal(locate('sldprt'))).resolves.toMatchObject({
      engineFailure: 'integrity',
      check: 'sha256',
      file: 'wasm',
    });
  });

  it('refuses bytes that are not gzip at all', async () => {
    const notGzip = new Uint8Array(64).fill(7);
    const other: EngineDigests = { sldprt: { wasm: file(wasm), gzip: file(notGzip) } };
    fetchMock.mockResolvedValueOnce(serve(notGzip));
    const locate = createEngineLocator({ engines: { baseUrl: base, layout: 'digest' }, digests: other });
    await expect(refusal(locate('sldprt'))).resolves.toMatchObject({ engineFailure: 'integrity', check: 'gunzip' });
  });
});

describe('engine base URL', () => {
  it('resolves a relative base against the page', async () => {
    vi.stubGlobal('location', new URL('https://app.example.test/w/project?tab=1'));
    fetchMock.mockResolvedValueOnce(serve(wasm));
    await createEngineLocator({ engines: { baseUrl: '/cadmpeg-ts/', layout: 'package' }, digests })('sldprt');
    expect(fetchMock).toHaveBeenCalledWith('https://app.example.test/cadmpeg-ts/sldprt_bg.wasm', { redirect: 'error' });
  });

  it.each([
    'file:///engines/',
    'https://user:pw@dependencies.example.test/',
    'https://d.example.test/?v=1/',
    'https://d.example.test/x',
  ])('refuses %s as not prepared', (baseUrl) => {
    expect(() => createEngineLocator({ engines: { baseUrl, layout: 'package' }, digests })).toThrow(
      expect.objectContaining({ issues: [expect.objectContaining({ code: 'KERNEL_NOT_PREPARED' })] }),
    );
  });
});

describe('engineIssue', () => {
  it('finds a refusal through cadmpeg-ts’s wrapper and gives it the role’s code', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const refused = await createEngineLocator({ engines: { baseUrl: base, layout: 'digest' }, digests })(
      'sldprt',
    ).catch((error: unknown) => error);
    const wrapped = new CadmpegError('BACKEND_UNAVAILABLE', 'could not load the sldprt WebAssembly module', {
      cause: refused,
    });
    expect(engineIssue(wrapped, 'TRANSCODER_EXECUTION_FAILED')).toMatchObject({
      code: 'TRANSCODER_EXECUTION_FAILED',
      details: { producer: 'cadmpeg', engineFailure: 'status', status: 503, format: 'sldprt' },
    });
    expect(engineIssue(new CadmpegError('REFUSED', 'no'), 'KERNEL_BINDING_FAILED')).toBeUndefined();
  });
});
