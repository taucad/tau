/**
 * A consumer-owned Node worker entry hosts an explicit runtime definition.
 *
 * `nodeWorkerTransport` still takes a consumer-supplied URL — defaulting it is
 * pinned forbidden by `node-worker-cycle-prevention.test.ts`. The platform answer
 * for a Node host is `import.meta.resolve`, which is what these cases exercise.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';

import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';

const boxSource = `import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, 20, 30);\n`;

/**
 * The application-owned worker entry is TypeScript in this workspace, so the
 * worker thread needs tsx's loader. `workerCtor` is the transport's own seam for exactly this
 * (`node-worker-client.ts:143`), and it mirrors how `websocket-two-process.test.ts`
 * runs its `.ts` fixture child under `node --import tsx`.
 */
class TsxWorker extends NodeWorker {
  public constructor(url: string | URL) {
    super(url, { execArgv: ['--import', 'tsx'] });
  }
}

const createClient = (root: string) =>
  createRuntimeClient({
    transport: nodeWorkerTransport({
      // The invoking application owns and resolves the executable worker URL.
      url: new URL('fixtures/node-runtime.ts', import.meta.url),
      fileSystem: fromNodeFs(root),
      workerCtor: TsxWorker,
    }),
  });

describe('explicit Node worker entry', () => {
  let projectDirectory: string | undefined;

  afterEach(async () => {
    if (projectDirectory) {
      await rm(projectDirectory, { recursive: true, force: true });
      projectDirectory = undefined;
    }
  });

  const createProject = async (): Promise<string> => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'tau-node-entry-'));
    await writeFile(join(projectDirectory, 'box.ts'), boxSource, 'utf8');
    return projectDirectory;
  };

  it('renders a trivial replicad model over nodeWorkerTransport', async () => {
    const client = createClient(await createProject());
    try {
      const outcome = await client.render({ source: { path: 'box.ts' }, parameters: {} });

      expect(outcome.superseded).toBe(false);
      if (outcome.superseded) {
        throw new Error('The only render in this test must not be superseded.');
      }
      expect(outcome.geometry.success).toBe(true);
    } finally {
      client.terminate();
    }
  });

  it('hosts the explicitly composed kernel', async () => {
    const client = createClient(await createProject());
    try {
      await client.connect();

      const hosted = (client.capabilities?.registrations ?? [])
        .filter(({ kind }) => kind === 'kernel')
        .map(({ id }) => String(id));
      expect(hosted).toEqual(['replicad']);
    } finally {
      client.terminate();
    }
  });
});
