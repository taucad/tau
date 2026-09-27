// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type {
  WorkerRevisionRequest,
  WorkerRevisionResponse,
  WorkerRevisionResult,
} from '#machines/file-manager.worker.revisions.js';
import { createPortRevisionsClient } from '#workers/agent-host-revisions.js';

type RevisionRow = Extract<WorkerRevisionResult, { kind: 'log' }>['rows'][number];

const row = (revisionNumber: number, revisionId: string): RevisionRow => ({
  revisionNumber,
  revisionId,
  changeId: `change-${revisionId}`,
  actor: 'person',
  source: 'user',
  createdAt: 0,
  summary: revisionId,
  conflicted: false,
  turnId: undefined,
  tags: [],
});

describe('createPortRevisionsClient', () => {
  it('should read log, diff and the place line over a revision port', async () => {
    const { port1, port2 } = new MessageChannel();
    const seen: WorkerRevisionRequest[] = [];
    port2.addEventListener('message', ({ data }: MessageEvent<WorkerRevisionRequest>) => {
      seen.push(data);
      if (!('command' in data) || data.id === undefined) {
        return;
      }
      const { id } = data;
      const answer = (frame: WorkerRevisionResponse): void => {
        port2.postMessage(frame);
      };
      if (data.command === 'log') {
        const rows = data.branch === 'feature' ? [row(2, 'rev-f')] : [row(3, 'rev-m')];
        answer({ type: 'result', id, result: { kind: 'log', rows } });
      } else if (data.command === 'diff') {
        answer({ type: 'result', id, result: { kind: 'diff', entries: [] } });
      }
    });
    port2.start();
    port2.postMessage({
      type: 'status',
      status: {
        line: { kind: 'branch', name: 'main' },
        headRevisionId: 'rev-m',
        branches: [
          { name: 'main', head: 'rev-m' },
          { name: 'feature', head: 'rev-f' },
          { name: 'unborn', head: undefined },
        ],
      },
    });
    const client = createPortRevisionsClient(port1);

    await expect(client.log({ branch: 'main', limit: 5 })).resolves.toEqual([row(3, 'rev-m')]);
    await expect(client.diff(undefined, 'rev-m')).resolves.toEqual([]);
    await expect(client.describe()).resolves.toEqual({
      branch: 'main',
      revisionNumber: 3,
      revisionId: 'rev-m',
      branches: [
        { name: 'main', revisionNumber: 3, revisionId: 'rev-m' },
        { name: 'feature', revisionNumber: 2, revisionId: 'rev-f' },
      ],
      line: 'main · Rev 3',
    });
    expect(seen[1]).toMatchObject({ command: 'diff', revisionId: 'rev-m' });

    client.close();
    await expect.poll(() => seen.at(-1)).toEqual({ command: 'close' });
    port1.close();
  });
});
