/**
 * The read-only `revisions` tool's client in the browser project host (W6 RH-S8): requests over one port into the
 * file-manager worker's revision root, which the page brokers once that project's revision client has opened (RV9-F1).
 */
import type { RpcRevisionsClient } from '@taucad/chat/rpc';
import type {
  WorkerRevisionRequest,
  WorkerRevisionResponse,
  WorkerRevisionResult,
} from '#machines/file-manager.worker.revisions.js';

type RevisionStatus = Extract<WorkerRevisionResponse, { type: 'status' }>['status'];

/** A revisions client over one revision port, and the close that lets the root go. @internal */
export type PortRevisionsClient = RpcRevisionsClient & Readonly<{ close: () => void }>;

/**
 * Serve `log`, `diff` and `describe` over a revision port.
 *
 * @param port - A port the file-manager worker's revision registry serves for this project.
 * @returns The client and its close.
 * @internal
 */
export const createPortRevisionsClient = (port: MessagePort): PortRevisionsClient => {
  let nextId = 0;
  const pending = new Map<number, PromiseWithResolvers<WorkerRevisionResult>>();
  const status = Promise.withResolvers<void>();
  let latest: RevisionStatus | undefined;
  port.addEventListener('message', ({ data }: MessageEvent<WorkerRevisionResponse>) => {
    if (data.type === 'status') {
      latest = data.status;
      status.resolve();
      return;
    }
    if (data.type !== 'result' && data.type !== 'error') {
      return;
    }
    const request = pending.get(data.id);
    pending.delete(data.id);
    if (data.type === 'result') {
      request?.resolve(data.result);
    } else {
      request?.reject(Object.assign(new Error(data.message), data.code === undefined ? {} : { code: data.code }));
    }
  });
  port.start();

  const ask = async <Kind extends WorkerRevisionResult['kind']>(
    request: WorkerRevisionRequest,
    kind: Kind,
  ): Promise<Extract<WorkerRevisionResult, { kind: Kind }>> => {
    nextId += 1;
    const id = nextId;
    const answer = Promise.withResolvers<WorkerRevisionResult>();
    pending.set(id, answer);
    port.postMessage({ ...request, id });
    const result = await answer.promise;
    if (result.kind !== kind) {
      throw new Error(`The revision root answered ${result.kind} to a ${kind} request.`);
    }
    return result as Extract<WorkerRevisionResult, { kind: Kind }>;
  };
  const numberOf = async (branch: string): Promise<number | undefined> => {
    const { rows } = await ask({ command: 'log', branch, limit: 1 }, 'log');
    return rows[0]?.revisionNumber;
  };

  return {
    log: async (request) => {
      const { rows } = await ask(
        {
          command: 'log',
          ...(request.branch === undefined ? {} : { branch: request.branch }),
          ...(request.limit === undefined ? {} : { limit: request.limit }),
        },
        'log',
      );
      return rows;
    },
    diff: async (from, to) => {
      const { entries } = await ask(
        { command: 'diff', revisionId: to, ...(from === undefined ? {} : { from }) },
        'diff',
      );
      return entries;
    },
    /* ponytail: one log read per branch, as `readRevisionPlace` walks every head; one batched read if a project's
     * branch count ever makes this slow. */
    describe: async () => {
      await status.promise;
      const { line, headRevisionId, branches } = latest!;
      const branch = line.kind === 'branch' ? line.name : undefined;
      const [revisionNumber, ...numbers] = await Promise.all([
        branch === undefined || headRevisionId === undefined ? undefined : numberOf(branch),
        ...branches.map(async (facet) => (facet.head === undefined ? undefined : numberOf(facet.name))),
      ]);
      return {
        branch,
        revisionNumber,
        revisionId: headRevisionId,
        branches: branches.flatMap((facet, index) =>
          facet.head === undefined
            ? []
            : [{ name: facet.name, revisionNumber: numbers[index] ?? 0, revisionId: facet.head }],
        ),
        line:
          branch === undefined
            ? 'No revisions yet'
            : revisionNumber === undefined
              ? `${branch} · no revisions yet`
              : `${branch} · Rev ${String(revisionNumber)}`,
      };
    },
    close: () => {
      /* Uncorrelated: the last port's close releases the root; any other port's only leaves it. */
      port.postMessage({ command: 'close' } satisfies WorkerRevisionRequest);
      for (const request of pending.values()) {
        request.reject(Object.assign(new Error('The project host closed.'), { code: 'PROJECT_HOST_CLOSED' }));
      }
      pending.clear();
    },
  };
};
