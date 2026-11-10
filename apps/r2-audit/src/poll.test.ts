/* eslint-disable @typescript-eslint/naming-convention -- `token_ids` is the AUDIT_EXPECTED_WRITERS JSON key tau-cloud writes. */

import { describe, expect, it, vi } from 'vitest';
import { parseExpectedWriters } from '#environment.js';
import {
  checkDataAccessEvent,
  fetchDataAccessEvents,
  isForeignEvent,
  pollDataAccessLogs,
  pollQuery,
  pollWindowMilliseconds,
  readDataAccessEvent,
  seenTtlSeconds,
  unseenEvents,
} from '#poll.js';
import type { DataAccessEvent } from '#poll.js';
import { createFakeKv } from '#testing/fake-kv.js';

const dependencies = 'tau-staging-au-dependencies';
const expected = parseExpectedWriters(
  JSON.stringify({
    [dependencies]: { token_ids: ['token-upload'], scripts: [] },
  }),
);
const context = {
  expected,
  dependencyBucket: dependencies,
  environment: 'staging',
};
const to = Date.parse('2026-11-09T18:10:00.000Z');

const telemetryEvent = (id: string, source: Record<string, unknown>): Record<string, unknown> => ({
  $metadata: { id },
  dataset: 'r2',
  timestamp: to - 60_000,
  source,
});

const respond = (events: unknown[], init: ResponseInit = {}): typeof fetch =>
  vi.fn<typeof fetch>(async () =>
    Response.json(
      {
        success: true,
        errors: [],
        messages: [],
        result: { events: { events } },
      },
      init,
    ),
  );

describe('pollQuery', () => {
  it('should read the r2 dataset over the last ten minutes for the six write and delete actions', () => {
    const query = pollQuery(to);
    expect(query).toMatchObject({
      view: 'events',
      dry: true,
      timeframe: { from: to - pollWindowMilliseconds, to },
    });
    expect(query['parameters']).toMatchObject({
      datasets: ['r2'],
      filterCombination: 'or',
    });
    expect(
      (query['parameters'] as { filters: Array<{ value: string }> }).filters.map((filter) => filter.value),
    ).toEqual([
      'PutObject',
      'CopyObject',
      'CompleteMultipartUpload',
      'DeleteObject',
      'DeleteObjects',
      'DeleteObjectsByPrefix',
    ]);
  });
});

describe('readDataAccessEvent', () => {
  it('should read nested source fields', async () => {
    const event = await readDataAccessEvent(
      telemetryEvent('e1', {
        action: 'PutObject',
        bucket: dependencies,
        interface: 'S3',
        actor: { accessKeyId: 'token-upload', email: 'person@example.com' },
        resource: { key: 'blobs/sha256/x' },
      }),
    );
    expect(event).toEqual({
      id: 'e1',
      timestamp: to - 60_000,
      action: 'PutObject',
      bucket: dependencies,
      key: 'blobs/sha256/x',
      interface: 'S3',
      accessKeyId: 'token-upload',
    });
  });

  it('should read dotted keys and hash an event without an id', async () => {
    const raw = {
      timestamp: 1,
      source: { action: 'PutObject', bucket: 'b', 'actor.accessKeyId': 'k' },
    };
    const first = await readDataAccessEvent(raw);
    expect(first).toMatchObject({ accessKeyId: 'k' });
    expect(first?.id).toMatch(/^sha256-[0-9a-f]{64}$/u);
    const again = await readDataAccessEvent(structuredClone(raw));
    expect(again?.id).toBe(first?.id);
  });

  it('should drop an event without an action or bucket', async () => {
    expect(await readDataAccessEvent({ source: { bucket: 'b' } })).toBeUndefined();
    expect(await readDataAccessEvent('text')).toBeUndefined();
  });
});

describe('fetchDataAccessEvents', () => {
  it('should post the query with the token and keep only polled actions', async () => {
    const fetcher = respond([
      telemetryEvent('e1', { action: 'PutObject', bucket: dependencies }),
      telemetryEvent('e2', { action: 'GetObject', bucket: dependencies }),
    ]);
    const result = await fetchDataAccessEvents({
      accountId: 'acc',
      token: 'secret-token',
      to,
      fetch: fetcher,
    });
    expect(result).toMatchObject({ ok: true, truncated: false });
    expect(result.ok && result.events.map((event) => event.id)).toEqual(['e1']);
    const [url, init] = vi.mocked(fetcher).mock.calls[0] ?? [];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/workers/observability/telemetry/query');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-token');
  });

  it('should report a refusal by status only', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response('{"errors":[{"message":"bad token secret-token"}]}', {
          status: 403,
        }),
    );
    expect(
      await fetchDataAccessEvents({
        accountId: 'acc',
        token: 'secret-token',
        to,
        fetch: fetcher,
      }),
    ).toEqual({
      ok: false,
      detail: 'http-403',
    });
  });

  it('should report an unsuccessful envelope and a network failure', async () => {
    const unsuccessful = vi.fn<typeof fetch>(async () => Response.json({ success: false, result: null }));
    expect(
      await fetchDataAccessEvents({
        accountId: 'a',
        token: 't',
        to,
        fetch: unsuccessful,
      }),
    ).toEqual({
      ok: false,
      detail: 'api-error',
    });
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    expect(
      await fetchDataAccessEvents({
        accountId: 'a',
        token: 't',
        to,
        fetch: offline,
      }),
    ).toEqual({
      ok: false,
      detail: 'network',
    });
  });
});

describe('unseenEvents', () => {
  const event = (id: string): DataAccessEvent => ({
    id,
    action: 'PutObject',
    bucket: dependencies,
  });

  it('should keep each event once across overlapping windows and within one', async () => {
    const kv = createFakeKv();
    const first = await unseenEvents([event('a'), event('b'), event('a')], kv);
    const second = await unseenEvents([event('b'), event('c')], kv);
    expect(first.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(second.map(({ id }) => id)).toEqual(['c']);
    expect(kv.puts.every(({ options }) => options?.expirationTtl === seenTtlSeconds)).toBe(true);
  });
});

describe('checkDataAccessEvent', () => {
  it('should pass an expected write', () => {
    expect(
      checkDataAccessEvent(
        {
          id: 'e',
          action: 'PutObject',
          bucket: dependencies,
          interface: 'S3',
          accessKeyId: 'token-upload',
        },
        context,
      ),
    ).toEqual([]);
  });

  it('should alarm on a bulk delete attempt on the dependency bucket, even by an expected token', () => {
    for (const action of ['DeleteObjects', 'DeleteObjectsByPrefix']) {
      expect(
        checkDataAccessEvent(
          {
            id: 'e',
            action,
            bucket: dependencies,
            interface: 'S3',
            accessKeyId: 'token-upload',
          },
          context,
        ).map((line) => line.event),
      ).toEqual(['r2_audit.dependency_delete_attempt']);
    }
  });

  it('should name the actor of an unexpected writer', () => {
    expect(
      checkDataAccessEvent(
        {
          id: 'e',
          timestamp: 0,
          action: 'DeleteObjects',
          bucket: dependencies,
          interface: 'API',
          accessKeyId: 'token-x',
        },
        context,
      ),
    ).toEqual([
      expect.objectContaining({ event: 'r2_audit.dependency_delete_attempt' }),
      {
        event: 'r2_audit.unexpected_writer',
        environment: 'staging',
        source: 'data-access-log',
        bucket: dependencies,
        action: 'DeleteObjects',
        eventTime: '1970-01-01T00:00:00.000Z',
        accessKeyId: 'token-x',
        interface: 'API',
        reason: 'api-interface',
      },
    ]);
  });
});

describe('isForeignEvent', () => {
  it("should never treat one of this Worker's own buckets as foreign", () => {
    const foreignBuckets = new Set(['tau-prod-content-private', dependencies]);
    expect(isForeignEvent({ bucket: 'tau-prod-content-private' }, { ...context, foreignBuckets })).toBe(true);
    expect(isForeignEvent({ bucket: dependencies }, { ...context, foreignBuckets })).toBe(false);
    expect(isForeignEvent({ bucket: dependencies }, { ...context, foreignBuckets, dependencyBucket: undefined })).toBe(
      false,
    );
    expect(isForeignEvent({ bucket: 'tau-prod-content-private' }, context)).toBe(false);
  });
});

describe('pollDataAccessLogs', () => {
  it('should report each event once across two passes', async () => {
    const kv = createFakeKv();
    const fetcher = respond([
      telemetryEvent('e1', {
        action: 'PutObject',
        bucket: dependencies,
        interface: 'S3',
        actor: { accessKeyId: 'stranger' },
      }),
    ]);
    const input = {
      accountId: 'a',
      token: 't',
      to,
      kv,
      expected,
      dependencyBucket: dependencies,
      environment: 'staging',
      fetch: fetcher,
    };
    const first = await pollDataAccessLogs(input);
    const second = await pollDataAccessLogs({ ...input, to: to + 300_000 });
    expect(first).toMatchObject({ ok: true, eventsSeen: 1, eventsNew: 1, eventsForeign: 0 });
    expect(first.ok && first.lines.map((line) => line.event)).toEqual(['r2_audit.unexpected_writer']);
    expect(second).toMatchObject({
      ok: true,
      eventsSeen: 1,
      eventsNew: 0,
      lines: [],
    });
  });

  it('should skip a foreign bucket before both checks, and still alarm on an unknown one', async () => {
    const kv = createFakeKv();
    const fetcher = respond([
      telemetryEvent('prod-put', {
        action: 'PutObject',
        bucket: 'tau-prod-content-private',
        resource: { key: 'blobs/revisions-maintenance/liveness/recover-projects.json' },
        interface: 'S3',
        actor: { accessKeyId: 'token-prod' },
      }),
      telemetryEvent('prod-bulk', {
        action: 'DeleteObjects',
        bucket: 'tau-prod-content-private',
        interface: 'API',
      }),
      telemetryEvent('rogue', {
        action: 'PutObject',
        bucket: 'tau-rogue-bucket',
        interface: 'S3',
        actor: { accessKeyId: 'token-prod' },
      }),
    ]);
    const result = await pollDataAccessLogs({
      accountId: 'a',
      token: 't',
      to,
      kv,
      expected,
      dependencyBucket: dependencies,
      foreignBuckets: new Set(['tau-prod-content-private']),
      environment: 'staging',
      fetch: fetcher,
    });
    expect(result).toMatchObject({ ok: true, eventsSeen: 3, eventsNew: 1, eventsForeign: 2 });
    expect(result.ok && result.lines).toEqual([
      expect.objectContaining({
        event: 'r2_audit.unexpected_writer',
        bucket: 'tau-rogue-bucket',
        reason: 'unknown-bucket',
      }),
    ]);
    // A skipped event costs no KV operation.
    expect(kv.puts.map(({ key }) => key)).toEqual(['seen:rogue']);
  });

  it('should check every bucket without foreign buckets', async () => {
    const fetcher = respond([
      telemetryEvent('prod-put', {
        action: 'PutObject',
        bucket: 'tau-prod-content-private',
        interface: 'S3',
        actor: { accessKeyId: 'token-prod' },
      }),
    ]);
    const result = await pollDataAccessLogs({
      accountId: 'a',
      token: 't',
      to,
      kv: createFakeKv(),
      expected,
      dependencyBucket: dependencies,
      environment: 'staging',
      fetch: fetcher,
    });
    expect(result).toMatchObject({ ok: true, eventsNew: 1, eventsForeign: 0 });
    expect(result.ok && result.lines.map((line) => line.reason)).toEqual(['unknown-bucket']);
  });

  it('should fail cleanly when KV is down', async () => {
    const kv = createFakeKv();
    kv.fail(true);
    const fetcher = respond([telemetryEvent('e1', { action: 'PutObject', bucket: dependencies })]);
    expect(
      await pollDataAccessLogs({
        accountId: 'a',
        token: 't',
        to,
        kv,
        expected,
        dependencyBucket: dependencies,
        environment: 'staging',
        fetch: fetcher,
      }),
    ).toEqual({ ok: false, detail: 'kv' });
  });
});
