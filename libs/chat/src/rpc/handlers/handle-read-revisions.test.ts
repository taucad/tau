import { describe, expect, it } from 'vitest';

import { handleReadRevisions } from '#rpc/handlers/handle-read-revisions.js';
import type { RpcRevisionsClient } from '#rpc/rpc-dependencies.js';

const client: RpcRevisionsClient = {
  log: async ({ limit }) =>
    [
      {
        revisionNumber: 2,
        revisionId: 'b'.repeat(40),
        actor: 'ada',
        source: 'user',
        createdAt: 1_789_000_000_000,
        summary: 'Second',
        conflicted: false,
      },
      {
        revisionNumber: 1,
        revisionId: 'a'.repeat(40),
        actor: 'ada',
        source: 'user',
        createdAt: 1_788_000_000_000,
        summary: 'First',
        conflicted: false,
      },
    ].slice(0, limit),
  diff: async (from, to) => [{ path: `${from ?? 'nothing'}-to-${to}.ts`, kind: 'modified' }],
  describe: async () => ({
    branch: 'main',
    revisionNumber: 2,
    revisionId: 'b'.repeat(40),
    branches: [{ name: 'main', revisionNumber: 2, revisionId: 'b'.repeat(40) }],
    line: 'main · Rev 2',
  }),
};

describe('handleReadRevisions', () => {
  it('answers every action with the same line the chat card shows', async () => {
    for (const action of ['log', 'diff', 'describe'] as const) {
      // oxlint-disable-next-line no-await-in-loop -- three answers, read in order.
      const result = await handleReadRevisions({ action, to: 'b'.repeat(40) }, client);
      expect(result).toMatchObject({ success: true, where: 'main · Rev 2' });
    }
  });

  it('lists what the host holds, bounded by the limit', async () => {
    const result = await handleReadRevisions({ action: 'log', limit: 1 }, client);
    expect(result).toMatchObject({ success: true, branch: 'main' });
    expect(result.success && result.revisions).toHaveLength(1);
    expect(result.success && result.revisions?.[0]?.revisionNumber).toBe(2);
  });

  it('asks for the newer revision rather than guessing one', async () => {
    const result = await handleReadRevisions({ action: 'diff' }, client);
    expect(result).toMatchObject({ success: false, errorCode: 'VALIDATION_ERROR' });
  });

  it('says so where the host has no revision history at all', async () => {
    const result = await handleReadRevisions({ action: 'describe' }, undefined);
    expect(result).toMatchObject({ success: false, errorCode: 'UNKNOWN' });
  });
});
