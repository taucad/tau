/* eslint-disable @typescript-eslint/naming-convention -- Binding names are tau-cloud's contract. */

import { describe, expect, it, vi } from 'vitest';
import type { AuditEnvironment } from '#environment.js';
import type { AuditLogLine } from '#log.js';
import { createFakeKv } from '#testing/fake-kv.js';
import type { FakeKv } from '#testing/fake-kv.js';
import { createAuditWorker } from '#worker.js';
import type { AuditQueueMessage } from '#worker.js';

const dependencies = 'tau-staging-au-dependencies';
const key = `blobs/sha256/${'b'.repeat(64)}`;
const queryToken = 'query-token-value';
const writers = JSON.stringify({
  [dependencies]: { token_ids: ['token-upload'], scripts: [] },
});

const environmentWith = (kv: FakeKv, overrides: Partial<AuditEnvironment> = {}): AuditEnvironment => ({
  AUDIT_KV: kv,
  AUDIT_ENVIRONMENT: 'staging',
  AUDIT_DEPENDENCY_BUCKET: dependencies,
  AUDIT_ACCOUNT_ID: 'account',
  AUDIT_EXPECTED_WRITERS: writers,
  ...overrides,
});

const message = (body: unknown): AuditQueueMessage & { acked: () => boolean; retried: () => boolean } => {
  let acked = false;
  let retried = false;
  return {
    id: 'm',
    body,
    ack: () => {
      acked = true;
    },
    retry: () => {
      retried = true;
    },
    acked: () => acked,
    retried: () => retried,
  };
};

const harness = (fetcher?: typeof fetch) => {
  const lines: AuditLogLine[] = [];
  let clock = 1000;
  const worker = createAuditWorker({
    now: () => {
      clock += 5;
      return clock;
    },
    log: (line) => lines.push(line),
    ...(fetcher === undefined ? {} : { fetch: fetcher }),
  });
  return { worker, lines };
};

describe('queue', () => {
  it('should record a create, alarm on its overwrite and delete, and end with a heartbeat', async () => {
    const kv = createFakeKv();
    const { worker, lines } = harness();
    const messages = [
      message({
        action: 'PutObject',
        bucket: dependencies,
        object: { key, eTag: 'e1' },
        eventTime: 't1',
      }),
      message({
        action: 'PutObject',
        bucket: dependencies,
        object: { key, eTag: 'e2' },
        eventTime: 't2',
      }),
      message({
        action: 'DeleteObject',
        bucket: dependencies,
        object: { key },
        eventTime: 't3',
      }),
    ];
    await worker.queue({ queue: 'tau-r2-audit-staging', messages }, environmentWith(kv));
    expect(lines.map((line) => line.event)).toEqual([
      'r2_audit.dependency_created',
      'r2_audit.dependency_overwritten',
      'r2_audit.dependency_deleted',
      'r2_audit.heartbeat',
    ]);
    expect(lines.at(-1)).toEqual({
      event: 'r2_audit.heartbeat',
      environment: 'staging',
      pass: 'queue',
      expectedWritersValid: true,
      messages: 3,
      retried: 0,
      alarms: 2,
      durationMilliseconds: 5,
    });
    expect(messages.every((item) => item.acked())).toBe(true);
  });

  it('should retry an unreadable message and a create KV could not record', async () => {
    const kv = createFakeKv();
    const { worker, lines } = harness();
    const unreadable = message('not json');
    await worker.queue({ queue: 'q', messages: [unreadable] }, environmentWith(kv));
    expect(unreadable.retried()).toBe(true);

    kv.fail(true);
    const create = message({
      action: 'PutObject',
      bucket: dependencies,
      object: { key, eTag: 'e1' },
    });
    const deletion = message({
      action: 'DeleteObject',
      bucket: dependencies,
      object: { key },
    });
    await worker.queue({ queue: 'q', messages: [create, deletion] }, environmentWith(kv));
    expect(create.retried()).toBe(true);
    expect(deletion.acked()).toBe(true);
    expect(lines.filter((line) => line.event === 'r2_audit.dependency_deleted')).toHaveLength(1);
    expect(lines.at(-1)).toMatchObject({ retried: 1, alarms: 1 });
  });
});

describe('scheduled', () => {
  it('should skip the poll without a query token and still write the heartbeat', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const { worker, lines } = harness(fetcher);
    await Promise.all(
      [undefined, '', '  '].map(async (token) =>
        worker.scheduled(
          { scheduledTime: 0, cron: '*/5 * * * *' },
          environmentWith(createFakeKv(), token === undefined ? {} : { AUDIT_QUERY_TOKEN: token }),
        ),
      ),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({
      event: 'r2_audit.heartbeat',
      environment: 'staging',
      pass: 'scheduled',
      expectedWritersValid: true,
      poll: 'skipped',
      pollDetail: 'no-query-token',
      alarms: 0,
      durationMilliseconds: 5,
    });
  });

  it('should log the poll alarms then a heartbeat, and never the token or the writer list', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        success: true,
        result: {
          events: {
            events: [
              {
                $metadata: { id: 'e1' },
                timestamp: 0,
                source: {
                  action: 'DeleteObjectsByPrefix',
                  bucket: dependencies,
                  interface: 'S3',
                  actor: { accessKeyId: 'token-x' },
                },
              },
            ],
          },
        },
      }),
    );
    const { worker, lines } = harness(fetcher);
    await worker.scheduled(
      { scheduledTime: 600_000 },
      environmentWith(createFakeKv(), { AUDIT_QUERY_TOKEN: queryToken }),
    );
    expect(lines.map((line) => line.event)).toEqual([
      'r2_audit.dependency_delete_attempt',
      'r2_audit.unexpected_writer',
      'r2_audit.heartbeat',
    ]);
    expect(lines.at(-1)).toMatchObject({
      poll: 'ok',
      eventsSeen: 1,
      eventsNew: 1,
      truncated: false,
      alarms: 2,
    });
    const text = JSON.stringify(lines);
    expect(text).not.toContain(queryToken);
    expect(text).not.toContain('token-upload');
  });

  it('should report a failed poll in the heartbeat', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('nope', { status: 401 }));
    const { worker, lines } = harness(fetcher);
    await worker.scheduled(
      { scheduledTime: 0 },
      environmentWith(createFakeKv(), {
        AUDIT_QUERY_TOKEN: queryToken,
        AUDIT_EXPECTED_WRITERS: 'garbage',
      }),
    );
    expect(lines).toEqual([
      expect.objectContaining({
        event: 'r2_audit.heartbeat',
        poll: 'failed',
        pollDetail: 'http-401',
        expectedWritersValid: false,
      }),
    ]);
  });
});
