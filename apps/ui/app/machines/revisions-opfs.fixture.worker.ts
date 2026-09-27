/**
 * One of RM-A22's two workers: an isomorphic-git revision port over this worker's own OPFS
 * provider, under a directory the test names. Each request is one step the test orders across
 * the two workers; the reply is its result or its error message.
 */

import { OPFSProvider } from '@taucad/filesystem/backend';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import type { RevisionPort } from '@taucad/revisions';
import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';

export type OpfsRequest =
  | Readonly<{ op: 'init'; directory: string }>
  | Readonly<{ op: 'writeRevision'; directory: string; parent: string | undefined; content: string }>
  | Readonly<{ op: 'updateRef'; directory: string; expectedHead: string | undefined; head: string }>
  | Readonly<{ op: 'readRef'; directory: string }>
  | Readonly<{ op: 'writeLease'; directory: string; runId: string }>
  | Readonly<{ op: 'readLeases'; directory: string }>;

const encoder = new TextEncoder();
const provider = new OPFSProvider();
const ready = provider.initialize();

const portOf = (directory: string): RevisionPort =>
  createIsomorphicGitRevisionPort({ filesystem: provider, gitDirectory: `${directory}/.git` });

/* The records row `writeLease` and `readLeases` use (`revision-effects.ts`), under the test's directory. */
const runsOf = (directory: string): string => `${directory}/.tau/runs`;

const handle = async (request: OpfsRequest): Promise<unknown> => {
  await ready;
  switch (request.op) {
    case 'init': {
      await portOf(request.directory).init({
        author: { name: 'Tau', email: 'tau@example.test' },
        createSetupFiles: false,
      });
      return undefined;
    }
    case 'writeRevision': {
      const receipt = await portOf(request.directory).writeRevision({
        parents: request.parent === undefined ? [] : [revisionId(request.parent)],
        tree: new ImmutableRevisionTree([['a.txt', encoder.encode(request.content)]]),
        provenance: { source: 'user', actorId: 'rm-a22', createdAt: Date.UTC(2026, 8, 26) },
        summary: { generated: request.content },
      });
      return receipt.commitId;
    }
    case 'updateRef': {
      const result = await portOf(request.directory).updateRef({
        name: 'main',
        expectedHead: request.expectedHead === undefined ? undefined : revisionId(request.expectedHead),
        head: revisionId(request.head),
      });
      return result.status;
    }
    case 'readRef': {
      return portOf(request.directory).readRef('main');
    }
    case 'writeLease': {
      await provider.mkdir(runsOf(request.directory), { recursive: true });
      await provider.writeFile(
        `${runsOf(request.directory)}/${request.runId}.json`,
        `${JSON.stringify({ runId: request.runId, attempt: 0 })}\n`,
      );
      return undefined;
    }
    case 'readLeases': {
      const runs = runsOf(request.directory);
      if (!(await provider.exists(runs))) {
        return [];
      }
      const entries = await provider.readdir(runs);
      const names = entries.filter((name) => name.endsWith('.json')).toSorted();
      return Promise.all(
        names.map(
          async (name) => (JSON.parse(await provider.readFile(`${runs}/${name}`, 'utf8')) as { runId: string }).runId,
        ),
      );
    }
  }
};

self.addEventListener('message', async (event: MessageEvent<{ id: number; request: OpfsRequest }>) => {
  const { id, request } = event.data;
  try {
    self.postMessage({ id, result: await handle(request) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
