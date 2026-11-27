/**
 * STO-25 SP6 (SP3-local 674f6460 gap 4): the viewer opens on a Tau Cloud open's first view once the manifest the
 * project holds is the `tau.json` the open's write landed. The landing reloads the project, and the reload reads
 * those bytes; the project it parsed from them is equal to them by construction, so the reconciliation is recorded
 * when the project is ready with it, without waiting for the new observation's own first read (measured 0.1–0.6 s
 * under the apply). A project that is not the one the load read is recorded only by the observation (I7).
 */
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, setup, types } from 'xstate';
import { flush } from '@taucad/xstate-testing/clock';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import { sha256Bytes } from '@taucad/utils/hash';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { withAuthorityDigest } from '@taucad/ui-core/lib/composed-view-client.fixture';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { Project } from '@taucad/types';
import type { projectMachine } from '#machines/project.machine.js';
import { reconciledManifest } from '#lib/manifest-reconciliation.js';
import { createManifestObservationLogic, projectRuntimeMachine } from '#runtime/project-runtime.js';
import type { LoadedProjectManifest, ProjectRuntimeFileManager } from '#runtime/project-runtime.js';

const settle = async (rounds = 10): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each round lets the next microtask chain run.
    await flush();
  }
};

/** A project that loads, then is ready with the project its `loaded` event carries. */
const loadingProject = (placeholder: Project) =>
  setup({
    schemas: {
      context: types<{ project: Project; manifestIssue: undefined }>(),
      events: eventSchemas<{ type: 'loaded'; project: Project }>(),
    },
  }).createMachine({
    id: 'project',
    context: { project: placeholder, manifestIssue: undefined },
    initial: 'loading',
    states: {
      loading: {
        on: { loaded: ({ event }) => ({ target: 'ready', context: { project: event.project } }) },
      },
      ready: {},
    },
  });

/** A file manager as the observation reads it: its content service. */
const fileManagerOver = (projectId: string, contentService: unknown): ProjectRuntimeFileManager['fileManagerRef'] => {
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

/** A content service whose observation never reads: the apply holds the worker (the measured case). */
const heldContentService = (): Readonly<{ content: FileContentService; proxy: ComposedViewClient }> => {
  const proxy = withAuthorityDigest(mock<ComposedViewClient>());
  const channel = new WorkerChangeChannel({
    transport: {
      listen: () => () => undefined,
      watchReady: () => ({
        ready: new Promise<void>(() => {
          /* The observation's read waits on the worker, which answers after the test. */
        }),
        closed: new Promise<void>(() => {
          /* Open for the test's life. */
        }),
        unsubscribe: () => undefined,
      }),
    },
  });
  const content = new FileContentService({
    proxy,
    paths: new WorkspacePathResolver('/project'),
    channel,
    refreshGuard: new RefreshGenerationGuard(),
  });
  return { content, proxy };
};

const runtimeFor = ({
  projectId,
  placeholder,
  loaded,
  content,
}: Readonly<{
  projectId: string;
  placeholder: Project;
  loaded: () => LoadedProjectManifest | undefined;
  content: FileContentService;
}>) =>
  createActor(
    projectRuntimeMachine.provide({
      actors: {
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a project read by snapshot.
        project: loadingProject(placeholder) as unknown as typeof projectMachine,
        manifestObservation: createManifestObservationLogic({
          projectId,
          fileManagerRef: fileManagerOver(projectId, content),
          loadedManifest: loaded,
        }),
      },
    }),
    {
      input: {
        projectId,
        profile: 'shared',
        project: {
          projectId,
          fileManagerRef: fileManagerOver(projectId, content),
          fileSystemRoot: '/',
          kernelOptionsFactory: vi.fn(),
        },
        editor: { projectId },
      },
    },
  );

/** The stand-in's own `loaded` event, which the project machine's alphabet does not name. */
const sendLoaded = (runtime: ReturnType<typeof runtimeFor>, project: Project): void => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the stand-in takes its own event.
  (
    runtime.getSnapshot().context.projectRef as unknown as {
      send: (event: { type: 'loaded'; project: Project }) => void;
    }
  ).send({
    type: 'loaded',
    project,
  });
};

const projectNamed = (id: string, name: string): Project =>
  createProjectFixture({ id, name, description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } });

describe('the manifest a project load read (STO-25)', () => {
  it('is recorded as reconciled once the project is ready with it, before the observation reads', async () => {
    const projectId = 'proj_seededReconciled000000000';
    const landed = projectNamed(projectId, 'Landed');
    const bytes = serializeProjectManifest(projectToManifest(landed));
    const { content } = heldContentService();
    const runtime = runtimeFor({
      projectId,
      placeholder: projectNamed(projectId, 'Placeholder'),
      loaded: () => ({ project: landed, bytes }),
      content,
    });
    runtime.start();
    try {
      await settle();
      expect(reconciledManifest(projectId)).toBeUndefined();
      sendLoaded(runtime, landed);
      const digest = await sha256Bytes(bytes);
      await expect.poll(() => reconciledManifest(projectId)).toBe(digest);
    } finally {
      runtime.stop();
      content.dispose();
    }
    /* The observation's end: what the manifest was found to be no longer stands. */
    expect(reconciledManifest(projectId)).toBeUndefined();
  });

  it('records nothing for a project the load did not read, leaving it to the observation (I7)', async () => {
    const projectId = 'proj_unseededReconciled0000000';
    const landed = projectNamed(projectId, 'Landed');
    const bytes = serializeProjectManifest(projectToManifest(landed));
    const { content } = heldContentService();
    const runtime = runtimeFor({
      projectId,
      placeholder: projectNamed(projectId, 'Placeholder'),
      loaded: () => ({ project: landed, bytes }),
      content,
    });
    runtime.start();
    try {
      /* Equal in content but not the object the load parsed: a write or another load replaced it. */
      sendLoaded(runtime, { ...landed });
      await settle();
      await sha256Bytes(bytes);
      await settle();
      expect(reconciledManifest(projectId)).toBeUndefined();
    } finally {
      runtime.stop();
      content.dispose();
    }
  });
});
