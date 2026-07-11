import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { PersistedRevisionState, Project } from '@taucad/types';
import { projectMachine } from '#machines/project.machine.js';
import type { ProjectContext } from '#machines/project.machine.js';
import { revisionMachine } from '#machines/revision.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { KernelOptionsFactory, LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

// Integration of the two machines' persistence contract, wired exactly as
// `RevisionProvider` wires them: the revision machine persists its slice by
// SENDING an `updateRevisionState` event to the project machine — the single
// writer of the project document — never via an out-of-band worker write, and
// nothing feeds the project machine's `projectUpdated` back into the revision
// machine. This is the regression surface for the stale-UI clobber and the
// last-writer-wins DB race. See docs/research/revision-state-atomic-persistence.md.
//
// Driven through the synchronous FS_WRITE (dirty) seam rather than the async
// restore flow: it exercises the identical `persistState` → injected `persist`
// path with none of the plan/apply machinery.

const kernelOptionsFactory: LazyKernelOptionsFactory = async () => () =>
  mock<ReturnType<KernelOptionsFactory>>({
    config: { tauApiUrl: 'https://api.test', tauWebSocketUrl: 'wss://api.test' },
  });

function makeProjectActor(revisionState: PersistedRevisionState): ActorRefFrom<typeof projectMachine> {
  const project: Project = {
    id: 'p1',
    name: 'Test',
    description: '',
    author: { name: '', avatar: '' },
    tags: [],
    thumbnail: '',
    createdAt: 1,
    updatedAt: 1,
    assets: {},
    revisionState,
  };
  const machine = projectMachine.provide({
    actors: {
      loadProjectActor: fromSafeAsync(async () => ({
        type: 'projectRetrieved',
        project,
        parameterEntries: new Map(),
      })),
      writeProjectActor: fromSafeAsync(async () => {
        /* Resolve immediately so storing.writing completes and emits projectUpdated. */
      }),
    },
    guards: { isNotBrowser: () => false, shouldAutoLoad: () => false },
  });
  const actor = createActor(machine, {
    input: {
      projectId: 'p1',
      shouldLoadModelOnStart: false,
      fileManagerRef: mock<ProjectContext['fileManagerRef']>({ send: vi.fn() }),
      kernelOptionsFactory,
    },
  });
  actor.start();
  actor.send({ type: 'loadProject', projectId: 'p1' });
  return actor;
}

// Mirrors the `persist` closure RevisionProvider injects.
function makeRevisionActor(
  projectRef: ActorRefFrom<typeof projectMachine>,
  initial: PersistedRevisionState,
): ActorRefFrom<typeof revisionMachine> {
  return createActor(revisionMachine, {
    input: {
      projectId: 'p1',
      initial,
      persist: (state) => {
        projectRef.send({ type: 'updateRevisionState', revisionState: state });
      },
    },
  }).start();
}

describe('revision persistence is single-writer and never reverted', () => {
  let projectActor: ActorRefFrom<typeof projectMachine>;
  let revisionActor: ActorRefFrom<typeof revisionMachine> | undefined;

  beforeEach(async () => {
    projectActor = makeProjectActor({ headTurnId: 'u1', supersededTurnIds: [], dirty: false });
    await waitFor(projectActor, (s) => s.matches({ ready: {} }));
  });

  afterEach(() => {
    revisionActor?.stop();
    revisionActor = undefined;
    projectActor.stop();
    vi.restoreAllMocks();
  });

  it('persists a slice change through the project machine, not out-of-band (R2, R5)', () => {
    revisionActor = makeRevisionActor(projectActor, { headTurnId: 'u1', supersededTurnIds: [], dirty: false });

    // A non-machine design write flips dirty and persists via the injected callback.
    revisionActor.send({ type: 'FS_WRITE', source: 'user', path: 'main.scad' });

    // The revision authority flips dirty...
    expect(revisionActor.getSnapshot().context.dirty).toBe(true);
    // ...and the project machine (single writer) now carries the fresh slice in
    // its in-memory document — proof the persist routed through it, not a worker.
    expect(projectActor.getSnapshot().context.project?.revisionState?.dirty).toBe(true);
  });

  it('does not revert the revision slice when the project machine emits projectUpdated (R4)', async () => {
    revisionActor = makeRevisionActor(projectActor, { headTurnId: 'u1', supersededTurnIds: [], dirty: false });
    revisionActor.send({ type: 'FS_WRITE', source: 'user', path: 'main.scad' });
    expect(revisionActor.getSnapshot().context.dirty).toBe(true);

    // Any unrelated project write emits projectUpdated. Pre-fix, a Seam-4 read-back
    // fed the stale slice back and reverted the authority; there is no such wiring now.
    const emitted: unknown[] = [];
    projectActor.on('projectUpdated', (event) => emitted.push(event));
    projectActor.send({ type: 'updateName', name: 'Renamed' });
    await waitFor(projectActor, (s) => s.matches({ ready: { storing: 'idle' } }));

    expect(emitted.length).toBeGreaterThan(0);
    expect(revisionActor.getSnapshot().context.dirty).toBe(true);
  });

  it('keeps machine restore notifications clean and persists a later genuine editor write as dirty (R4)', () => {
    revisionActor = makeRevisionActor(projectActor, { headTurnId: 'u1', supersededTurnIds: [], dirty: false });

    revisionActor.send({ type: 'FS_WRITE', source: 'machine', path: 'main.scad' });

    expect(revisionActor.getSnapshot().context.dirty).toBe(false);
    expect(projectActor.getSnapshot().context.project?.revisionState).toEqual({
      headTurnId: 'u1',
      supersededTurnIds: [],
      dirty: false,
    });

    revisionActor.send({ type: 'FS_WRITE', source: 'editor', path: 'main.scad' });

    expect(revisionActor.getSnapshot().context.dirty).toBe(true);
    expect(projectActor.getSnapshot().context.project?.revisionState).toEqual({
      headTurnId: 'u1',
      supersededTurnIds: [],
      dirty: true,
    });
  });
});
