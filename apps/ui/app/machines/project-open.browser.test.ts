import { createActor, waitFor } from 'xstate';
import type { Actor } from 'xstate';
import { expect, it, vi } from 'vitest';
import { parseProjectManifestBytes, projectManifestSchemaUrl, serializeProjectManifest } from '@taucad/types';
import { createFileSystemBridgeProxy } from '@taucad/fs-bridge';
import {
  deleteProjectFileSystemConfig,
  getProjectRootConfigs,
  setProjectFileSystemConfig,
} from '#filesystem/handle-store.js';
import { fileManagerMachine } from '#machines/file-manager.machine.js';

/**
 * This probe uses the real file-manager worker and its OPFS provider. The
 * passive span measures the root observation, including watch registration, not
 * provider read counts; those remain unavailable across the worker boundary.
 */
type RootListingSpan = { startedAt: number; settledAt: number; outcome: 'resolved' | 'rejected' };

/** XState's abrupt stop does not run the root exit, so dispose the published graph explicitly. */
const stopProbeFileManager = (actor: Actor<typeof fileManagerMachine>): void => {
  const { context } = actor.getSnapshot();
  actor.stop();
  let failure: unknown;
  for (const dispose of [
    () => context.contentService?.dispose(),
    () => context.treeService?.dispose(),
    () => context.workerChangeChannel?.dispose(),
    () => context.disposeComposedView?.(),
    () => context.proxy?.dispose(),
    () => context.bridgeDispose?.(),
    () => context.worker?.terminate(),
  ]) {
    try {
      dispose();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== undefined) {
    throw failure instanceof Error
      ? failure
      : new Error('Could not dispose the probe file manager.', { cause: failure });
  }
};

const removeProbeRoot = async (projectId: string): Promise<void> => {
  const opfsRoot = await navigator.storage.getDirectory();
  try {
    await opfsRoot.removeEntry(projectId, { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
      throw error;
    }
  }
};

const projectIdForProbe = (): string => `proj_${crypto.randomUUID().replaceAll('-', '').slice(0, 21)}`;

const seededManifest = (count: number): Uint8Array<ArrayBuffer> =>
  serializeProjectManifest({
    $schema: projectManifestSchemaUrl,
    name: `Root listing probe ${String(count)}`,
    description: 'Browser-only selected-root listing probe.',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });

/** Seed `count` authored root files (main.ts plus parts), outside the timed open. */
const seedProjectRoot = async (projectId: string, count: number): Promise<void> => {
  const home = createActor(fileManagerMachine, {
    input: { rootDirectory: '/', shouldInitializeOnStart: true },
  });
  home.start();
  try {
    const ready = await waitFor(home, (snapshot) => snapshot.matches('ready') || snapshot.matches('error'), {
      timeout: 30_000,
    });
    expect(ready.matches('ready'), ready.context.error?.message).toBe(true);
    const { proxy, openFileSystemBridge } = ready.context;
    if (proxy === undefined || openFileSystemBridge === undefined) {
      throw new Error('The home filesystem authority did not publish its bridge.');
    }
    await proxy.configureProjectRoots(await getProjectRootConfigs());
    const seeded = createFileSystemBridgeProxy(openFileSystemBridge(`/projects/${projectId}`, 'user'));
    try {
      await seeded.ready;
      expect(seeded.hello.payload.state).toBe('ready');
      await seeded.writeFiles({
        'tau.json': { content: seededManifest(count) },
        'main.ts': { content: 'export default function main() { return null; }\n' },
      });
      // Batches bound bridge payload size. Seed time is deliberately excluded.
      for (let first = 0; first < count - 1; first += 100) {
        const files: Record<string, { content: string }> = {};
        for (let index = first; index < Math.min(first + 100, count - 1); index += 1) {
          files[`part-${String(index).padStart(5, '0')}.ts`] = { content: `export const part = ${String(index)};\n` };
        }
        // oxlint-disable-next-line no-await-in-loop -- Each bounded batch settles before the next bridge request.
        await seeded.writeFiles(files);
      }
    } finally {
      seeded.dispose();
    }
  } finally {
    stopProbeFileManager(home);
  }
};

it.each([10, 1000])(
  'should measure real selected-root bootstrap with %i authored root files',
  async (count) => {
    const projectId = projectIdForProbe();
    const rootDirectory = `/projects/${projectId}`;
    let actor: Actor<typeof fileManagerMachine> | undefined;
    const timing: {
      listing?: RootListingSpan;
      rootListingCalls: number;
      initializingServicesAt?: number;
      readyAt?: number;
    } = { rootListingCalls: 0 };

    try {
      await setProjectFileSystemConfig({ projectId, backend: 'opfs', providerBasePath: projectId });
      await seedProjectRoot(projectId, count);

      try {
        actor = createActor(fileManagerMachine, {
          input: {
            projectId,
            rootDirectory,
            shouldInitializeOnStart: true,
            openPerformance: {
              begin: (phase) => {
                const startedAt = performance.now();
                let finished = false;
                if (phase === 'tree.list') {
                  timing.rootListingCalls += 1;
                }
                return {
                  spanId: crypto.randomUUID(),
                  finish: (outcome) => {
                    if (finished) {
                      return;
                    }
                    finished = true;
                    if (phase === 'tree.list') {
                      timing.listing = {
                        startedAt,
                        settledAt: performance.now(),
                        outcome: outcome === 'ok' ? 'resolved' : 'rejected',
                      };
                    }
                  },
                };
              },
            },
          },
        });
        actor.subscribe((snapshot) => {
          if (snapshot.matches('initializingServices')) {
            timing.initializingServicesAt ??= performance.now();
          }
          if (snapshot.matches('ready')) {
            timing.readyAt ??= performance.now();
          }
        });
        actor.start();
        const settled = await waitFor(actor, (snapshot) => snapshot.matches('ready') || snapshot.matches('error'), {
          timeout: 120_000,
        });
        expect(settled.matches('ready'), settled.context.error?.message).toBe(true);
        const tree = settled.context.treeService;
        const content = settled.context.contentService;
        if (tree === undefined || content === undefined) {
          throw new Error('The scoped file services did not publish.');
        }
        await vi.waitFor(
          () => {
            expect(timing.listing?.outcome).toBe('resolved');
          },
          { timeout: 120_000 },
        );
        const rows = tree.listDirectorySync('');
        expect(rows?.filter(({ name }) => name.startsWith('part-'))).toHaveLength(count - 1);
        expect(rows?.some(({ name }) => name === 'main.ts')).toBe(true);
        expect(rows?.some(({ name }) => name === 'tau.json')).toBe(true);
        const manifest = parseProjectManifestBytes(await content.readRawBytes('tau.json'));
        expect(manifest.success).toBe(true);

        // Keep timings as inspectable structured evidence for the browser run.
        // Exact provider operation counters require a separate worker-side probe.
        expect(timing.listing).toMatchObject({ outcome: 'resolved' });
        expect(timing.rootListingCalls).toBe(1);
        if (
          timing.listing === undefined ||
          timing.initializingServicesAt === undefined ||
          timing.readyAt === undefined ||
          rows === undefined
        ) {
          throw new Error('The browser probe did not capture its required service timing.');
        }
        expect(timing.listing.settledAt).toBeGreaterThan(timing.listing.startedAt);

        const evidence = {
          kind: 'service-observation-span',
          buildMode: 'vitest-vite',
          acceptanceQualified: false,
          admissionScope: 'filesystem-only: no generated project identity or full route/session admission',
          authoredRootFilesExcludingManifestAndIdentity: count,
          rootListingCalls: timing.rootListingCalls,
          readyToListingSettledMilliseconds: timing.listing.settledAt - timing.readyAt,
          rootListingMilliseconds: timing.listing.settledAt - timing.listing.startedAt,
          initializingServicesToReadyMilliseconds: timing.readyAt - timing.initializingServicesAt,
          listedAuthoredRootFiles: rows.filter(({ name }) => name.startsWith('part-') || name === 'main.ts').length,
          manifestRead: manifest.success,
          providerReadCounters: null,
        };
        const response = await fetch('/__project-open-probe', { method: 'POST', body: JSON.stringify(evidence) });
        expect(response.ok).toBe(true);
      } finally {
        if (actor !== undefined) {
          stopProbeFileManager(actor);
        }
      }
    } finally {
      try {
        await deleteProjectFileSystemConfig(projectId);
      } finally {
        await removeProbeRoot(projectId);
      }
    }
  },
  180_000,
);
