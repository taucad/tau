import { describe, expect, it } from 'vitest';

import { handleReadRevisions } from '#rpc/handlers/handle-read-revisions.js';
import type { RpcRevisionsClient } from '#rpc/rpc-dependencies.js';

const client: RpcRevisionsClient = {
  log: async ({ limit }) =>
    [
      {
        revisionId: 'b'.repeat(40),
        who: { kind: 'recorded', identity: { kind: 'user', id: 'ada' } } as const,
        source: 'user',
        createdAt: 1_789_000_000_000,
        summary: 'Ready for print',
        conflicted: false,
        versions: [{ name: 'Ready for print', number: 3 }],
      },
      {
        revisionId: 'a'.repeat(40),
        who: { kind: 'recorded', identity: { kind: 'user', id: 'ada' } } as const,
        source: 'user',
        createdAt: 1_788_000_000_000,
        summary: 'First',
        conflicted: false,
      },
    ].slice(0, limit),
  diff: async (from, to) => [{ path: `${from ?? 'nothing'}-to-${to}.ts`, kind: 'modified' }],
  describe: async () => ({
    branch: 'main',
    revisionId: 'b'.repeat(40),
    branches: [{ name: 'main', revisionId: 'b'.repeat(40) }],
    line: 'main',
  }),
  /* One conflict waits on `main`, recorded as `c…c`. */
  conflict: async (revision) =>
    revision === undefined || revision === 'c'.repeat(40)
      ? {
          revisionId: 'c'.repeat(40),
          labels: { ours: 'main', theirs: 'laptop' },
          files: [
            { path: 'bracket.ts', chooseOne: false, base: 'width = 10', ours: 'width = 20', theirs: 'width = 30' },
            {
              path: '.tau/parameters/bracket.json',
              chooseOne: true,
              base: undefined,
              ours: undefined,
              theirs: undefined,
            },
          ],
        }
      : undefined,
};

/** The same history, with no conflict waiting anywhere. */
const settled: RpcRevisionsClient = { ...client, conflict: async () => undefined };

describe('handleReadRevisions', () => {
  it('answers every action with the same line the chat card shows', async () => {
    for (const action of ['log', 'diff', 'describe'] as const) {
      // oxlint-disable-next-line no-await-in-loop -- three answers, read in order.
      const result = await handleReadRevisions({ action, to: 'b'.repeat(40) }, client);
      expect(result).toMatchObject({ success: true, where: 'main' });
    }
  });

  it('lists what the host holds, bounded by the limit', async () => {
    const result = await handleReadRevisions({ action: 'log', limit: 1 }, client);
    expect(result).toMatchObject({ success: true, branch: 'main' });
    expect(result.success && result.revisions).toHaveLength(1);
    /* M11: an entry has no number; a version carries its project-wide one and its name. */
    expect(result.success && result.revisions?.[0]).not.toHaveProperty('revisionNumber');
    expect(result.success && result.revisions?.[0]?.version).toStrictEqual({ number: 3, name: 'Ready for print' });
  });

  it('names no position on a branch for any branch', async () => {
    const result = await handleReadRevisions({ action: 'describe' }, client);
    expect(result.success && result.branches).toStrictEqual([{ name: 'main', revisionId: 'b'.repeat(40) }]);
  });

  /* B2: a host's row carries its trailer and ids for its own pane; the agent reads the schema's row and no more. */
  it('hands the agent the typed who and none of the host row’s diagnostics', async () => {
    const hostRow = {
      revisionId: 'a'.repeat(40),
      who: { kind: 'unrecorded', authorName: 'octo-dev' },
      source: 'import',
      createdAt: 1_788_000_000_000,
      summary: 'Initial commit',
      conflicted: false,
      treeId: 'd'.repeat(40),
      trailer: 'Tau-Metadata: {}',
    } as const;
    const result = await handleReadRevisions({ action: 'log' }, { ...client, log: async () => [hostRow] });
    expect(result.success && result.revisions).toStrictEqual([
      {
        revisionId: 'a'.repeat(40),
        who: { kind: 'unrecorded', authorName: 'octo-dev' },
        source: 'import',
        createdAt: 1_788_000_000_000,
        summary: 'Initial commit',
        conflicted: false,
      },
    ]);
  });

  it('asks for the newer revision rather than guessing one', async () => {
    const result = await handleReadRevisions({ action: 'diff' }, client);
    expect(result).toMatchObject({ success: false, errorCode: 'VALIDATION_ERROR' });
  });

  it('reads both sides of the conflict waiting on this branch, and none for a choose-one file', async () => {
    const result = await handleReadRevisions({ action: 'conflict' }, client);

    expect(result).toEqual({
      success: true,
      where: 'main',
      conflict: {
        revisionId: 'c'.repeat(40),
        labels: { ours: 'main', theirs: 'laptop' },
        files: [
          { path: 'bracket.ts', chooseOne: false, base: 'width = 10', ours: 'width = 20', theirs: 'width = 30' },
          { path: '.tau/parameters/bracket.json', chooseOne: true },
        ],
      },
    });
  });

  it('reads one named file of a named conflicted revision', async () => {
    const result = await handleReadRevisions(
      { action: 'conflict', revision: 'c'.repeat(40), path: 'bracket.ts' },
      client,
    );

    expect(result.success && result.conflict?.files.map((file) => file.theirs)).toEqual(['width = 30']);
  });

  it('refuses rather than guesses when no conflict is waiting', async () => {
    const result = await handleReadRevisions({ action: 'conflict' }, settled);

    expect(result).toMatchObject({ success: false, errorCode: 'VALIDATION_ERROR' });
    expect(!result.success && result.message).toContain('No conflict is waiting on this branch');
  });

  it('names the conflicted files when asked for one that is not among them', async () => {
    const result = await handleReadRevisions({ action: 'conflict', path: 'other.ts' }, client);

    expect(result).toMatchObject({ success: false, errorCode: 'FILE_NOT_FOUND' });
    expect(!result.success && result.message).toContain('bracket.ts');
  });

  it('cuts text past its budget with a marker saying how much is missing', async () => {
    const huge = 'x'.repeat(60 * 1024);
    const result = await handleReadRevisions(
      { action: 'conflict' },
      {
        ...client,
        conflict: async () => ({
          revisionId: 'c'.repeat(40),
          labels: { ours: 'main', theirs: 'laptop' },
          files: [{ path: 'big.ts', chooseOne: false, base: huge, ours: huge, theirs: huge }],
        }),
      },
    );
    const file = result.success ? result.conflict?.files[0] : undefined;

    expect(file?.base).toMatch(/\[truncated: \d+ more characters\. Pass `path` to read one file\.\]$/u);
    expect(file?.ours).toMatch(/^\n\[truncated: 61440 more characters/u);
    expect(JSON.stringify(result).length).toBeLessThan(52 * 1024);
  });

  it('says so where the host has no revision history at all', async () => {
    const result = await handleReadRevisions({ action: 'describe' }, undefined);
    expect(result).toMatchObject({ success: false, errorCode: 'UNKNOWN' });
  });
});
