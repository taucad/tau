import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { evidenceFixture } from '#api/agent-observability/evidence.test-fixture.js';
import { classifySendError, classifySendResponse, LangfuseClient } from '#api/agent-observability/langfuse-client.js';
import { langfuseObservation, pseudonymKey } from '#api/agent-observability/langfuse-observation.js';

const target = { baseUrl: 'https://langfuse.test.invalid', publicKey: 'pk-test', secretKey: 'sk-test' };
const span = async () =>
  langfuseObservation(
    await evidenceFixture(),
    { environment: 'test', receipt: 'evr_1', protection: 'free' },
    pseudonymKey(Uint8Array.from(randomBytes(32))),
  );

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const failure = (code: string): Error =>
  new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) });

describe('classifySendResponse', () => {
  it.each([
    [200, { name: 'otel-ingestion-job' }, { kind: 'accepted' }],
    [200, { partialSuccess: { rejectedSpans: 1 } }, { kind: 'rejected', reason: 'partial' }],
    [400, undefined, { kind: 'rejected', reason: 'http-400' }],
    [413, undefined, { kind: 'rejected', reason: 'http-413' }],
    [401, undefined, { kind: 'not-sent', reason: 'http-401' }],
    [403, undefined, { kind: 'not-sent', reason: 'http-403' }],
    /* T02 attempt 4: neither a 429 nor a 5xx proves the span was not stored. */
    [429, undefined, { kind: 'uncertain', reason: 'http-429' }],
    [500, undefined, { kind: 'uncertain', reason: 'http-500' }],
    [503, undefined, { kind: 'uncertain', reason: 'http-503' }],
  ])('should classify %i', (status, body, expected) => {
    expect(classifySendResponse(status, body)).toEqual(expected);
  });
});

describe('classifySendError', () => {
  it('should treat only a failure to connect as not sent', () => {
    expect(classifySendError(failure('ECONNREFUSED'))).toEqual({ kind: 'not-sent', reason: 'econnrefused' });
    expect(classifySendError(failure('ENOTFOUND'))).toEqual({ kind: 'not-sent', reason: 'enotfound' });
    expect(classifySendError(failure('ECONNRESET'))).toEqual({ kind: 'uncertain', reason: 'transport' });
    expect(classifySendError(new DOMException('late', 'TimeoutError'))).toEqual({
      kind: 'uncertain',
      reason: 'timeout',
    });
    expect(classifySendError(new DOMException('stop', 'AbortError'))).toEqual({ kind: 'uncertain', reason: 'timeout' });
  });
});

describe('LangfuseClient', () => {
  it('should send one span to the v4 endpoint with server-side credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(207, { name: 'otel-ingestion-job' }));
    const observation = await span();

    await expect(new LangfuseClient(target, 1000, fetcher).send(observation.span)).resolves.toEqual({
      kind: 'accepted',
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url instanceof URL ? url.href : url).toBe('https://langfuse.test.invalid/api/public/otel/v1/traces');
    expect(init?.headers).toMatchObject({
      authorization: `Basic ${Buffer.from('pk-test:sk-test').toString('base64')}`,
      'x-langfuse-ingestion-version': '4',
    });
    expect(init?.redirect).toBe('error');
  });

  it('should answer uncertain, never not-sent, when the request times out after connecting', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('late', 'TimeoutError'));

    const { span: observation } = await span();

    await expect(new LangfuseClient(target, 1000, fetcher).send(observation)).resolves.toEqual({
      kind: 'uncertain',
      reason: 'timeout',
    });
  });

  it('should find an observation across pages and tell absence from an unavailable read', async () => {
    const { identity } = await span();
    const from = new Date('2026-10-29T00:00:00.000Z');
    const paged = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(200, { data: [{ id: 'other' }], meta: { cursor: 'next' } }))
      .mockResolvedValueOnce(json(200, { data: [{ id: identity.spanId }], meta: {} }));
    const client = (fetcher: typeof fetch) => new LangfuseClient(target, 1000, fetcher);

    await expect(client(paged).lookup(identity, from)).resolves.toBe('present');
    const [next] = paged.mock.calls[1]!;
    expect(next instanceof URL && next.searchParams.get('cursor')).toBe('next');
    await expect(
      client(vi.fn<typeof fetch>().mockResolvedValue(json(200, { data: [], meta: {} }))).lookup(identity, from),
    ).resolves.toBe('absent');
    await expect(client(vi.fn<typeof fetch>().mockResolvedValue(json(503, {}))).lookup(identity, from)).resolves.toBe(
      'unavailable',
    );
    await expect(
      client(vi.fn<typeof fetch>().mockRejectedValue(failure('ECONNREFUSED'))).lookup(identity, from),
    ).resolves.toBe('unavailable');
  });

  it('should read only Tau observations and their metadata, and call a cut-short read partial', async () => {
    const window = { environment: 'synthetic', from: new Date(0), to: new Date(1000) };
    const tau = { id: 's1', name: 'tau.tool', startTime: '1970-01-01T00:00:00.000Z', metadata: { family: 'tool' } };
    const paged = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json(200, { data: [tau, { ...tau, id: 'other', name: 'checkout' }], meta: { cursor: 'next' } }),
      )
      .mockResolvedValueOnce(json(200, { data: [{ ...tau, id: 's2' }], meta: {} }));
    const client = (fetcher: typeof fetch) => new LangfuseClient(target, 1000, fetcher);

    await expect(client(paged).observations(window, 5)).resolves.toEqual({
      kind: 'complete',
      rows: ['s1', 's2'].map((id) => ({ id, startTime: tau.startTime, metadata: tau.metadata })),
    });
    const [first] = paged.mock.calls[0]!;
    expect(first instanceof URL && Object.fromEntries(first.searchParams)).toMatchObject({
      environment: 'synthetic',
      fields: 'core,basic,metadata',
    });
    const endless = vi.fn<typeof fetch>(async () => json(200, { data: [tau], meta: { cursor: 'more' } }));
    await expect(client(endless).observations(window, 2)).resolves.toMatchObject({ kind: 'partial' });
    expect(endless).toHaveBeenCalledTimes(2);
    await expect(
      client(vi.fn<typeof fetch>().mockResolvedValue(json(503, {}))).observations(window, 5),
    ).resolves.toEqual({ kind: 'partial', rows: [] });
  });

  it('should request a bulk trace deletion and retry anything but a 2xx', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(200, { message: 'queued' }));
    const client = (fetch: typeof globalThis.fetch) => new LangfuseClient(target, 1000, fetch);

    await expect(client(fetcher).deleteTraces(['t1', 't2'])).resolves.toEqual({ kind: 'requested' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url instanceof URL ? url.href : url).toBe('https://langfuse.test.invalid/api/public/traces');
    expect(init).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({ traceIds: ['t1', 't2'] }),
      redirect: 'error',
    });
    await expect(client(vi.fn<typeof fetch>().mockResolvedValue(json(429, {}))).deleteTraces(['t1'])).resolves.toEqual({
      kind: 'retry',
      reason: 'http-429',
    });
    await expect(
      client(vi.fn<typeof fetch>().mockRejectedValue(failure('ECONNREFUSED'))).deleteTraces(['t1']),
    ).resolves.toEqual({ kind: 'retry', reason: 'unreachable' });
  });

  it('should read a trace back as absent only on a 404', async () => {
    const client = (status: number) =>
      new LangfuseClient(target, 1000, vi.fn<typeof fetch>().mockResolvedValue(json(status, {})));

    await expect(client(200).traceExists('t1')).resolves.toBe('present');
    await expect(client(404).traceExists('t1')).resolves.toBe('absent');
    await expect(client(500).traceExists('t1')).resolves.toBe('unavailable');
    await expect(client(401).traceExists('t1')).resolves.toBe('unavailable');
  });
});
