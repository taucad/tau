/**
 * Rows that drove `ProjectProvider`'s own effects, moved onto the project runtime that now owns that work (app state
 * orchestration plan § 4 A6b; inventory S13, S15, S40).
 *
 * They were `hooks/use-project.manifest-observation.test.tsx`, which rendered the provider with its `useActorRef`
 * replaced. The provider creates nothing now: the manifest observation, the parameter observers and the producer set
 * are the runtime's, so each scenario and its assertion is kept here against the runtime, the provider's surface being
 * the runtime's events and selectors. Old to new:
 *
 * - "should show manifest observation closure and retry without rewriting the healthy manifest":
 *   `project-runtime.test.ts`, "should follow the manifest, report its observation closing and retry it", which
 *   asserts the healthy manifest is neither reloaded nor reported; the held-retry row below asserts no repair.
 * - "reloads the physical project manifest after held retry without accepting its cached predecessor": below.
 * - "should attempt every registered record and report every refusal on direct project close": below, on
 *   `runtime.producers`.
 * - "should replay held temporary parameters after replacement CAD connection and document opening": below, on the
 *   parameter observers.
 *
 * And `hooks/use-preview-parameter-lifetime.test.tsx`, whose hook closed a shared project's parameter service on unmount;
 * the runtime's `resources` child closes it when the runtime stops, and the lease keeps one runtime through a StrictMode
 * remount (`hooks/use-project.lease.test.tsx`):
 *
 * - "keeps the service alive through Strict Mode and closes after leaving Preview": below, and the lease rows.
 * - "leaves editor services to their live-session owner": below.
 * - "reports a refused close instead of hiding a pending-write failure": below.
 */
import { toast } from 'sonner';
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, setup, types } from 'xstate';
import { flush } from '@taucad/xstate-testing/clock';
import { eventSchemas, fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { createMockRuntimeClient, createMockRuntimeDocument } from '@taucad/runtime-testing';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { withAuthorityDigest } from '@taucad/ui-core/lib/composed-view-client.fixture';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { Project } from '@taucad/types';
import type { ParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import { cadMachine } from '#machines/cad.machine.js';
import type { projectMachine } from '#machines/project.machine.js';
import type { AppRuntimeClient, KernelOptionsFactory } from '#types/runtime-client.alias.js';
import {
  createManifestObservationLogic,
  createParameterObserversLogic,
  createProjectRuntimeProducers,
  createResourcesLogic,
  projectRuntimeMachine,
  selectManifestObservationError,
} from '#runtime/project-runtime.js';
import type { ProjectChildInput, ProjectRuntimeFileManager } from '#runtime/project-runtime.js';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const projectId = 'proj_123456789012345678901';

/** Let the content service's reads and the observation's retries run. */
const settle = async (rounds = 10): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each round lets the next microtask chain run.
    await flush();
  }
};

/** A ready project as far as the manifest observation reads it, keeping every event it is sent. */
const projectStandIn = (project: Project) =>
  setup({
    schemas: {
      context: types<{ project: Project; manifestIssue: undefined; sent: string[] }>(),
      events: eventSchemas<{ type: string }>(),
    },
  }).createMachine({
    id: 'project',
    context: { project, manifestIssue: undefined, sent: [] },
    initial: 'ready',
    states: { ready: {} },
    on: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- XState wildcard event
      '*': ({ context, event }) => ({ context: { sent: [...context.sent, event.type] } }),
    },
  });

/** A file manager as the observation reads it: its content service. */
const fileManagerOver = (contentService: unknown): ProjectRuntimeFileManager['fileManagerRef'] => {
  const actor = createActor(
    setup({ schemas: { context: types<{ contentService: unknown; rootDirectory: string }>() } }).createMachine({
      id: 'fake-file-manager',
      context: { contentService, rootDirectory: `/projects/${projectId}` },
    }),
  );
  actor.start();
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- read by snapshot only.
  return actor as unknown as ProjectRuntimeFileManager['fileManagerRef'];
};

describe('the manifest observation, as the provider drove it', () => {
  it('reloads the physical project manifest after held retry without accepting its cached predecessor', async () => {
    const project = createProjectFixture({
      id: projectId,
      name: 'Cached project',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.ts' } },
    });
    const provider = new MemoryProvider();
    const oldBytes = serializeProjectManifest(projectToManifest(project));
    await provider.writeFile('tau.json', oldBytes);
    const paths = new WorkspacePathResolver('/project');
    const proxy = withAuthorityDigest(mock<ComposedViewClient>());
    proxy.readFile.mockImplementation(async (path) => {
      const relative = paths.toRelativePath(path);
      if (relative === undefined) {
        throw new Error(`Unexpected project read: ${path}`);
      }
      return provider.readFile(relative);
    });
    const closed = Promise.withResolvers<void>();
    const ready = Promise.withResolvers<void>();
    let held = false;
    const channel = new WorkerChangeChannel({
      transport: {
        listen: () => () => undefined,
        watchReady: () => ({
          ready: held ? ready.promise : Promise.resolve(),
          closed: held
            ? new Promise<void>(() => {
                /* Remain open until the fixture owner releases its source. */
              })
            : closed.promise,
          unsubscribe: () => undefined,
        }),
      },
    });
    const content = new FileContentService({ proxy, paths, channel, refreshGuard: new RefreshGenerationGuard() });
    expect(await content.resolveBytes('tau.json')).toEqual(oldBytes);
    expect(proxy.readFile).toHaveBeenCalledOnce();

    const runtime = createActor(
      projectRuntimeMachine.provide({
        actors: {
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a ready project read by snapshot.
          project: projectStandIn(project) as unknown as typeof projectMachine,
          manifestObservation: createManifestObservationLogic({ projectId, fileManagerRef: fileManagerOver(content) }),
        },
      }),
      {
        input: {
          projectId,
          profile: 'shared',
          project: {
            projectId,
            fileManagerRef: fileManagerOver(content),
            fileSystemRoot: '/',
            kernelOptionsFactory: vi.fn(),
          },
          editor: { projectId },
        },
      },
    );
    runtime.start();
    const sent = (): readonly string[] =>
      (runtime.getSnapshot().context.projectRef.getSnapshot().context as unknown as { sent: string[] }).sent;
    try {
      await settle();
      expect(selectManifestObservationError(runtime.getSnapshot())).toBeUndefined();
      expect(proxy.readFile).toHaveBeenCalledTimes(2);

      closed.resolve();
      await settle();
      expect(selectManifestObservationError(runtime.getSnapshot())).toBeDefined();

      held = true;
      runtime.send({ type: 'retryManifestObservation' });
      const freshBytes = serializeProjectManifest(projectToManifest({ ...project, name: 'Physical project changed' }));
      await provider.writeFile('tau.json', freshBytes);
      expect(await provider.readFile('tau.json')).toEqual(freshBytes);
      expect(await content.resolveBytes('tau.json')).toEqual(oldBytes);
      expect(sent()).not.toContain('reloadProject');

      ready.resolve();
      await settle();
      expect(sent()).toContain('reloadProject');
      expect(sent()).not.toContain('repairManifest');
    } finally {
      runtime.stop();
      content.dispose();
    }
  });
});

describe('the producer set, as the provider walked it', () => {
  it('should attempt every registered record and report every refusal on direct project close', async () => {
    const producers = createProjectRuntimeProducers();
    const first = new Error('Pane layout is not confirmed saved.');
    const second = new Error('View settings for main.cs are not confirmed saved.');
    const layout = vi.fn(async () => {
      throw first;
    });
    const view = vi.fn(async () => {
      throw second;
    });
    const unregisterLayout = producers.register(layout);
    const unregisterView = producers.register(view);
    await expect(producers.flushAll()).rejects.toMatchObject({
      message: `${first.message} ${second.message}`,
      errors: [first, second],
    });
    expect(layout).toHaveBeenCalledTimes(1);
    expect(view).toHaveBeenCalledTimes(1);
    unregisterLayout();
    await expect(producers.flushAll()).rejects.toMatchObject({ message: second.message, errors: [second] });
    unregisterView();
    await expect(producers.flushAll()).resolves.toBeUndefined();
  });
});

describe('the parameter observers, as the provider ran them for a preview', () => {
  it('should replay held temporary parameters after replacement CAD connection and document opening', async () => {
    const service = mock<ParameterSetService>();
    service.subscribeActors.mockReturnValue(() => undefined);
    service.snapshot.mockReturnValue({
      entry: { activeGroup: 'default', groups: { default: { values: { crankAngle: 35 } } } },
      identity: { manifestRevision: 'sha256:held' },
      bytes: new Uint8Array(),
    });
    const createCad = () => {
      const connection = Promise.withResolvers<void>();
      const client = createMockRuntimeClient();
      const runtime = createMockRuntimeDocument();
      vi.mocked(client.open).mockReturnValue(runtime.document);
      const actor = createActor(
        cadMachine.provide({
          actors: {
            connectKernelActor: fromSafeAsync(
              async (): Promise<{ type: 'kernelConnected'; client: AppRuntimeClient; cleanups: Array<() => void> }> => {
                await connection.promise;
                return { type: 'kernelConnected', client, cleanups: [] };
              },
            ),
          },
        }),
        {
          input: {
            shouldInitializeKernelOnStart: false,
            fileSystemRoot: '/projects/preview',
            kernelOptionsFactory: async () => () => mock<ReturnType<KernelOptionsFactory>>(),
          },
        },
      );
      actor.start();
      actor.send({ type: 'initializeModel', entryPath: 'main.ts' });
      return { actor, runtime, connection };
    };
    const first = createCad();
    const replacement = createCad();
    /* A project whose geometry units the row replaces, as a reload hands the preview a new CAD actor. */
    const project = createActor(
      setup({
        schemas: {
          context: types<{ geometryUnits: Map<string, unknown> }>(),
          events: eventSchemas<{ type: 'setUnits'; geometryUnits: Map<string, unknown> }>(),
        },
      }).createMachine({
        id: 'fake-project',
        context: { geometryUnits: new Map<string, unknown>([['main.ts', first.actor]]) },
        on: { setUnits: ({ event }) => ({ context: { geometryUnits: event.geometryUnits } }) },
      }),
    );
    project.start();
    const observers = createActor(
      createParameterObserversLogic({
        parameterService: { get: () => service, subscribe: () => () => undefined },
        previewParameterService: service,
      }),
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in read by snapshot only.
      { input: { project: project as unknown as ProjectChildInput['project'] } },
    );
    observers.start();
    try {
      expect(first.runtime.document.update).not.toHaveBeenCalled();
      first.connection.resolve();
      await vi.waitFor(() => {
        expect(first.runtime.document.update).toHaveBeenCalledWith({ parameters: { crankAngle: 35 } });
      });
      project.send({ type: 'setUnits', geometryUnits: new Map([['main.ts', replacement.actor]]) });
      expect(replacement.runtime.document.update).not.toHaveBeenCalled();
      replacement.connection.resolve();
      await vi.waitFor(() => {
        expect(replacement.runtime.document.update).toHaveBeenCalledWith({ parameters: { crankAngle: 35 } });
      });
      expect(service.resolve).not.toHaveBeenCalled();
    } finally {
      observers.stop();
      project.stop();
      first.actor.stop();
      replacement.actor.stop();
    }
  });
});

describe("the runtime's resources, as the preview parameter lifetime closed them", () => {
  const runResources = (service: ParameterSetService, closesParameterService: boolean) => {
    const project = createActor(
      setup({ schemas: { context: types<{ geometryUnits: Map<string, unknown> }>() } }).createMachine({
        id: 'fake-project',
        context: { geometryUnits: new Map<string, unknown>() },
      }),
    ).start();
    const resources = createActor(
      createResourcesLogic({
        parameterService: { get: () => service, subscribe: () => () => undefined },
        closesParameterService,
      }),
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in read by snapshot only.
      { input: { project: project as unknown as ProjectChildInput['project'] } },
    );
    resources.start();
    return {
      stop: () => {
        resources.stop();
        project.stop();
      },
    };
  };

  it("keeps a shared project's service open while the runtime runs and closes it when the runtime stops", async () => {
    const service = mock<ParameterSetService>();
    service.close.mockResolvedValue();
    const run = runResources(service, true);
    await flush();
    expect(service.close).not.toHaveBeenCalled();
    run.stop();
    await flush();
    expect(service.close).toHaveBeenCalledTimes(1);
  });

  it('leaves editor services to their live-session owner', async () => {
    const service = mock<ParameterSetService>();
    const run = runResources(service, false);
    run.stop();
    await flush();
    expect(service.close).not.toHaveBeenCalled();
  });

  it('reports a refused close instead of hiding a pending-write failure', async () => {
    const service = mock<ParameterSetService>();
    service.close.mockRejectedValue(new Error('Parameter writes have not settled.'));
    const run = runResources(service, true);
    run.stop();
    await flush();
    expect(toast.error).toHaveBeenCalledWith('Parameter writes have not settled.');
  });
});
