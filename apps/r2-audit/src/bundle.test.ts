/* eslint-disable @typescript-eslint/naming-convention -- Binding names are tau-cloud's contract. */

import { describe, expect, it } from 'vitest';
import { bundleAuditWorker } from '#scripts/bundle.mts';
import { createFakeKv } from '#testing/fake-kv.js';

describe('r2-audit-worker.mjs', () => {
  it('should build to the same bytes every time', async () => {
    const [first, second] = await Promise.all([bundleAuditWorker(), bundleAuditWorker()]);
    expect(second.sha256).toBe(first.sha256);
    expect(second.code).toBe(first.code);
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('should hold no machine path, timestamp or inline source map', async () => {
    const { code, map } = await bundleAuditWorker();
    expect(code).not.toContain('/home/');
    expect(code).not.toContain('sourceMappingURL');
    expect(code).not.toMatch(/\b20\d\d-\d\d-\d\dT/u);
    expect(JSON.parse(map)).toMatchObject({ version: 3 });
  });

  it('should export only default queue and scheduled handlers that write a heartbeat', async () => {
    const { code } = await bundleAuditWorker();
    const module = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)) as Record<
      string,
      unknown
    >;
    expect(Object.keys(module)).toEqual(['default']);
    const handlers = module['default'] as Record<string, unknown>;
    expect(Object.keys(handlers).toSorted()).toEqual(['queue', 'scheduled']);

    const logged: unknown[] = [];
    const original = console.log;
    console.log = (line: unknown) => {
      logged.push(line);
    };
    try {
      await (handlers['scheduled'] as (controller: unknown, environment: unknown) => Promise<void>)(
        { scheduledTime: 0 },
        {
          AUDIT_KV: createFakeKv(),
          AUDIT_ENVIRONMENT: 'staging',
          AUDIT_DEPENDENCY_BUCKET: '-',
          AUDIT_ACCOUNT_ID: 'account',
          AUDIT_EXPECTED_WRITERS: '{}',
        },
      );
    } finally {
      console.log = original;
    }
    expect(logged).toHaveLength(1);
    expect(JSON.parse(String(logged[0]))).toMatchObject({
      event: 'r2_audit.heartbeat',
      poll: 'skipped',
    });
  });
});
