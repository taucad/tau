/**
 * Totality baseline for the project machine (MC-R17). It locks today's answers before any state moves: every public
 * event is sampled in every reachable state, and each pair left unanswered must be on `projectIgnoredEvents`. A
 * later change that answers an event removes its pair; this file then fails until it does.
 *
 * A pair names a state where some sampled event of its type goes unanswered. Where another sample of that type is
 * answered there (a mixed pair), the blanket pair cannot tell if that answer stops, so a dedicated row checks it.
 *
 * The claim is bounded by the samples below, the projection (one snapshot per state value, loaded name, manifest issue
 * and failed write) and the traversal limit. The effects never settle, so the traversal delivers their answers as
 * built-in events, each only where it can arrive: the load's done event after `projectRetrieved` (the load reports
 * before it completes) and its error, the write, repair and runtime-close invokes' done or error events while they run,
 * and `pendingToWriting` in `ready.storing.pending`. The host loads on demand (`shouldAutoLoad` false), so `idle` is
 * reached and `reloadProject` reaches the rest; an auto-loading browser starts at row 2. The cad, graphics and model
 * interaction children are the real logics, never started. No retained snapshot holds a geometry unit or a view
 * graphics actor (the graph keeps the last snapshot per vertex), so the branches of `createGeometryUnit`,
 * `destroyGeometryUnit`, `createViewGraphics`, `destroyViewGraphics` and `loadModel` that run when one exists are not
 * sampled; those handlers answer either way today.
 *
 * Two alpha.59 limits shape the harness, and neither changes what is claimed. `xstate/graph` steps the machine on a
 * bare scope, which has no actor sources for a spawn by name and no snapshot for `runtimeClosing`'s invoke input, so
 * the traversal steps it through the pure `transition` helper; and `can()` dry-runs on such a scope too, so `answers`
 * reads a spawn by name as answered and the file applies `unansweredEvents`' rule itself. Samples that need context
 * are paired: `updateName` with the current name and a new one, `projectFileActivity` for content and for
 * `tau.json`, `projectRetrieved` whole and degraded. Path table (the shortest path to each state value, the first row
 * of its projections), kept current with `pathTable`:
 *
 * 1. `idle`: initial
 * 2. `loading`: `reloadProject`
 * 3. `runtimeClosing`: `closeRuntime`, answered at the root
 * 4. `error`: `reloadProject`, the load's error event
 * 5. `runtimeClosed`: `closeRuntime`, the close's done event
 * 6. `runtimeCloseFailed`: `closeRuntime`, the close's error event
 * 7. `ready`, `storing.idle`: `reloadProject`, `projectRetrieved`, the load's done event
 * 8. `ready`, `storing.writing`: then `updateName` to a new name
 * 9. `ready`, `storing.repairing`: from row 7, `manifestIssueObserved`, `repairManifest`
 * 10. `ready`, `storing.pending`: from row 8, `updateName` again
 * 11. `ssr`: initial, for a host outside the browser
 *
 * `checkEnvironment` is transient, so no path rests there.
 */
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { isIgnoredPair } from '@taucad/xstate-testing/inspect';
import type { IgnoredPairs } from '@taucad/xstate-testing/inspect';
import { pathTable, unreachedStates } from '@taucad/xstate-testing/paths';
import type { UnansweredEvent } from '@taucad/xstate-testing/paths';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createCallbackLogic, matchesState, transition } from 'xstate';
import { getShortestPaths } from 'xstate/graph';
import type { AnyMachineSnapshot, StateValue } from 'xstate';
import type { Project } from '@taucad/types';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { projectEventTypes, projectIgnoredEvents, projectMachine } from '#machines/project.machine.js';
import type { ProjectContext, ProjectEvent } from '#machines/project.machine.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

vi.mock('#constants/browser.constants.js', () => ({
  isBrowser: true,
}));

const project: Project = createProjectFixture({
  id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Test Project',
  description: 'A test project',
  tags: ['a'],
  assets: { main: { entryPath: 'main.ts' } },
});

type Event<T extends ProjectEvent['type']> = Extract<ProjectEvent, { type: T }>;

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = { [T in ProjectEvent['type']]: ReadonlyArray<Event<T>> };

const samples: Samples = {
  reloadProject: [{ type: 'reloadProject' }],
  closeRuntime: [{ type: 'closeRuntime' }],
  /* A unit this project does not own: the handler answers it without reading its snapshot. */
  'geometryUnit.runtimeClosed': [
    { type: 'geometryUnit.runtimeClosed', unit: mock<Event<'geometryUnit.runtimeClosed'>['unit']>() },
  ],
  manifestIssueObserved: [{ type: 'manifestIssueObserved', issue: { code: 'manifest-missing' } }],
  repairManifest: [{ type: 'repairManifest' }],
  /* The current name, which nothing answers, and a new one. */
  updateName: [
    { type: 'updateName', name: 'Test Project' },
    { type: 'updateName', name: 'Renamed' },
  ],
  updateDescription: [{ type: 'updateDescription', description: 'Described' }],
  updateTags: [{ type: 'updateTags', tags: ['b', 'b'] }],
  loadModel: [{ type: 'loadModel' }],
  setMainFile: [{ type: 'setMainFile', path: 'main.ts' }],
  createGeometryUnit: [{ type: 'createGeometryUnit', entryPath: 'part.ts' }],
  setViewerGeometryDemand: [
    { type: 'setViewerGeometryDemand', viewId: 'view_1', entryPath: 'main.ts' },
    { type: 'setViewerGeometryDemand', viewId: 'view_1' },
  ],
  claimGeometryUnit: [{ type: 'claimGeometryUnit', claimId: 'claim_1', entryPath: 'main.ts' }],
  releaseGeometryUnit: [{ type: 'releaseGeometryUnit', claimId: 'claim_1' }],
  'geometryUnit.kernelRefused': [
    { type: 'geometryUnit.kernelRefused', actorId: 'cad_1', reason: 'budget' },
    { type: 'geometryUnit.kernelRefused', actorId: 'cad_1', reason: undefined },
  ],
  openInViewer: [{ type: 'openInViewer', entryPath: 'main.ts' }],
  parkRuntime: [{ type: 'parkRuntime' }],
  resumeRuntime: [{ type: 'resumeRuntime' }],
  destroyGeometryUnit: [{ type: 'destroyGeometryUnit', entryPath: 'part.ts' }],
  createViewGraphics: [{ type: 'createViewGraphics', viewId: 'view_1' }],
  destroyViewGraphics: [{ type: 'destroyViewGraphics', viewId: 'view_1' }],
  viewPresentationChanged: [
    { type: 'viewPresentationChanged', viewId: 'view_1', unitId: 'main.ts', mediaType: 'model/gltf-binary' },
  ],
  modelComponentFocusObserved: [{ type: 'modelComponentFocusObserved', focus: { 'main.ts': 'root' } }],
  fileMoved: [{ type: 'fileMoved', oldPath: 'part.ts', newPath: 'moved.ts' }],
  fileDeleted: [{ type: 'fileDeleted', path: 'moved.ts' }],
  directoryDeleted: [{ type: 'directoryDeleted', path: 'parts' }],
  /* Content activity, which is answered, and metadata activity, which nothing answers. */
  projectFileActivity: [
    { type: 'projectFileActivity', operation: 'written', paths: ['main.ts'] },
    { type: 'projectFileActivity', operation: 'written', paths: ['tau.json'] },
  ],
  flushNow: [{ type: 'flushNow' }],
  projectRetrieved: [
    { type: 'projectRetrieved', project },
    { type: 'projectRetrieved', project, issue: { code: 'manifest-invalid-json', message: 'Unexpected token' } },
  ],
};

/** Every effect settles only when the traversal delivers its built-in answer; a view keeps no record. */
const pending = fromSafeAsync(
  async (): Promise<never> =>
    new Promise<never>(() => {
      // Never settles: the traversal delivers the effect's answer as a built-in event.
    }),
);
const provide = (environment: Readonly<{ browser: boolean }>) =>
  projectMachine.provide({
    actors: {
      loadProjectActor: pending,
      writeProjectActor: pending,
      closeRuntimeActor: pending,
      viewRecord: createCallbackLogic(() => undefined),
    },
    /* A host that loads on demand, so the traversal reaches `idle`; `reloadProject` then reaches everything else. */
    guards: { isNotBrowser: () => !environment.browser, shouldAutoLoad: () => false },
  });
/**
 * The machine as the traversal steps it. `xstate/graph` steps a machine on a bare scope: a transition function that
 * spawns by name (`'graphics'`, `'viewRecord'`, `'cad'`) finds no actor sources there, and `runtimeClosing`'s invoke
 * input reads `self.getSnapshot()`, which it has none of. The pure `transition` helper builds a full scope; everything
 * else (`root`, `getInitialSnapshot`, the state nodes) is the machine's own.
 */
const traversable = (provided: ReturnType<typeof provide>): ReturnType<typeof provide> =>
  Object.create(provided, {
    transition: {
      value: (snapshot: Parameters<typeof provided.transition>[0], event: ProjectEvent) =>
        transition(provided, snapshot, event)[0],
    },
  }) as ReturnType<typeof provide>;
const machine = traversable(provide({ browser: true }));
const events: readonly ProjectEvent[] = Object.values(samples).flat();

const builtIn = (types: readonly string[]): readonly ProjectEvent[] =>
  types.map((type) =>
    type.startsWith('xstate.error.') ? { type, error: new Error('effect failed') } : { type },
  ) as unknown as readonly ProjectEvent[];
/** Invoke answers and the batching timer, built in and so never public; offered only where they can arrive. */
const builtInsAt = (snapshot: AnyMachineSnapshot): readonly ProjectEvent[] => {
  const context = snapshot.context as ProjectContext;
  return builtIn([
    /* The load reports `projectRetrieved` before it completes, so its done event follows a retrieved project. */
    ...(snapshot.matches('loading')
      ? [
          ...(context.project === undefined ? [] : ['xstate.done.actor.0.project.loading']),
          'xstate.error.actor.0.project.loading',
        ]
      : []),
    ...['ready.storing.writing', 'ready.storing.repairing', 'runtimeClosing'].flatMap((state) =>
      snapshot.matches(state) ? [`xstate.done.actor.0.project.${state}`, `xstate.error.actor.0.project.${state}`] : [],
    ),
    ...(snapshot.matches('ready.storing.pending')
      ? ['xstate.after.pendingToWriting.project.ready.storing.pending']
      : []),
  ]);
};
const input = {
  projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  shouldLoadModelOnStart: false,
  fileManagerRef: mock<ProjectContext['fileManagerRef']>(),
  fileSystemRoot: '/projects/proj_aaaaaaaaaaaaaaaaaaaaa',
  kernelOptionsFactory: (async () => {
    throw new Error('no kernel in a traversal');
  }) as LazyKernelOptionsFactory,
};
const options = {
  input,
  events: (snapshot: AnyMachineSnapshot) => [...events, ...builtInsAt(snapshot)],
  limit: 20_000,
  /* The loaded name, a degraded manifest and a failed write join the projection: each changes which branch answers. */
  serializeState: (snapshot: AnyMachineSnapshot) => {
    const context = snapshot.context as ProjectContext;
    return JSON.stringify([
      snapshot.value,
      context.project?.name,
      context.manifestIssue?.code,
      context.error !== undefined,
    ]);
  },
};

/** The active leaf paths of a state value, dotted and joined, e.g. `ready.operation.idle | ready.storing.idle`. */
const leaves = (value: StateValue, prefix = ''): string[] =>
  typeof value === 'string'
    ? [`${prefix}${value}`]
    : Object.entries(value).flatMap(([key, child]) =>
        child === undefined ? [`${prefix}${key}`] : leaves(child, `${prefix}${key}.`),
      );
const dotted = (value: StateValue): string => leaves(value).join(' | ');

/**
 * Whether a snapshot answers an event, as `can()` reads it. In alpha.59 `can()` dry-runs a transition function on a
 * scope with no actor sources, so one that spawns by name (`'graphics'`, `'viewRecord'`, `'cad'`) throws there. Such a
 * function reached its spawn, which every one here follows with a result, so the throw is read as answered.
 */
const answers = (snapshot: AnyMachineSnapshot, event: ProjectEvent): boolean => {
  try {
    return snapshot.can(event);
  } catch (error) {
    if (error instanceof Error && /^Actor source '\w+' is not provided$/u.test(error.message)) {
      return true;
    }
    throw error;
  }
};

/** Built-in `xstate.*` and `@xstate.*` samples are never public, as in `unansweredEvents`. */
const isBuiltIn = (type: string): boolean => type.startsWith('xstate.') || type.startsWith('@xstate.');

/** `unansweredEvents` over {@link answers}: one row per (state value, event type) left unanswered and not ignored. */
const gapsOf = (
  snapshots: readonly AnyMachineSnapshot[],
  sampled: (snapshot: AnyMachineSnapshot) => readonly ProjectEvent[],
  ignore?: IgnoredPairs,
): UnansweredEvent[] => {
  const found = new Map<string, UnansweredEvent>();
  for (const snapshot of snapshots) {
    if (snapshot.status !== 'active') {
      continue;
    }
    for (const event of sampled(snapshot)) {
      const key = JSON.stringify([snapshot.value, event.type]);
      if (isBuiltIn(event.type) || found.has(key) || answers(snapshot, event)) {
        continue;
      }
      if (!isIgnoredPair(ignore, snapshot, event.type)) {
        found.set(key, { state: snapshot.value as StateValue, eventType: event.type });
      }
    }
  }
  return [...found.values()];
};

const reachable = (): AnyMachineSnapshot[] =>
  getShortestPaths(machine, {
    ...options,
    serializeState: (snapshot: AnyMachineSnapshot) => `${snapshot.status}:${options.serializeState(snapshot)}`,
  }).map((path) => path.state);

describe('project machine totality baseline', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...projectEventTypes].toSorted());
    expect(new Set(projectEventTypes).size).toBe(projectEventTypes.length);
  });

  it('should reach every state along the documented path table', () => {
    // The projection splits a state value by its context; the first row per value is its shortest path.
    const rows = new Map<string, string[]>();
    for (const row of pathTable(machine, options)) {
      const state = dotted(row.state);
      if (!rows.has(state)) {
        rows.set(
          state,
          row.events.map((event) => event.type),
        );
      }
    }
    const loaded = ['reloadProject', 'projectRetrieved', 'xstate.done.actor.0.project.loading'];
    expect(Object.fromEntries(rows)).toEqual({
      idle: [],
      loading: ['reloadProject'],
      runtimeClosing: ['closeRuntime'],
      error: ['reloadProject', 'xstate.error.actor.0.project.loading'],
      runtimeClosed: ['closeRuntime', 'xstate.done.actor.0.project.runtimeClosing'],
      runtimeCloseFailed: ['closeRuntime', 'xstate.error.actor.0.project.runtimeClosing'],
      'ready.operation.idle | ready.storing.idle': loaded,
      'ready.operation.idle | ready.storing.writing': [...loaded, 'updateName'],
      'ready.operation.idle | ready.storing.repairing': [...loaded, 'manifestIssueObserved', 'repairManifest'],
      'ready.operation.idle | ready.storing.pending': [...loaded, 'updateName', 'updateName'],
    });
    // `checkEnvironment` is transient (its `always` leaves at once), and `ssr` is the final state a host outside the
    // browser starts in: no event reaches it from a browser start, so the server variant below reaches it.
    expect(unreachedStates(machine, options)).toEqual(['project.checkEnvironment', 'project.ssr']);
    const server = traversable(provide({ browser: false }));
    // A final snapshot takes no event, so none is sampled there.
    const atRest = { ...options, events: [] };
    expect(pathTable(server, atRest).map((row) => ({ state: row.state, events: row.events }))).toEqual([
      { state: 'ssr', events: [] },
    ]);
    expect(unreachedStates(server, atRest)).not.toContain('project.ssr');
  });

  it('should answer every sampled event in every reachable state except the declared baseline', () => {
    expect(gapsOf(reachable(), options.events, projectIgnoredEvents)).toEqual([]);
  });

  it('should answer the answering sample of every mixed `ready` pair, which the blanket pairs cannot check', () => {
    const ready = reachable().filter((snapshot) => snapshot.status === 'active' && snapshot.matches('ready'));
    const contextOf = (snapshot: AnyMachineSnapshot) => snapshot.context as ProjectContext;
    const writable = ready.filter(
      (snapshot) => contextOf(snapshot).project !== undefined && contextOf(snapshot).manifestIssue === undefined,
    );
    // Repair needs a degraded manifest that is not a JSON syntax error, and nothing being written.
    const repairable = ready.filter(
      (snapshot) =>
        snapshot.matches('ready.storing.idle') &&
        contextOf(snapshot).manifestIssue !== undefined &&
        contextOf(snapshot).manifestIssue?.code !== 'manifest-invalid-json',
    );
    // A flush in `storing.idle` retries a failed write over a writable manifest.
    const failedWrite = writable.filter(
      (snapshot) => snapshot.matches('ready.storing.idle') && contextOf(snapshot).error !== undefined,
    );
    expect(writable.length).toBeGreaterThan(0);
    expect(repairable.length).toBeGreaterThan(0);
    expect(failedWrite.length).toBeGreaterThan(0);
    const writes = (snapshot: AnyMachineSnapshot): readonly ProjectEvent[] => [
      { type: 'updateName', name: `${contextOf(snapshot).project?.name ?? ''} renamed` },
      ...samples.updateDescription,
      ...samples.updateTags,
      ...samples.setMainFile,
    ];
    const checks: ReadonlyArray<
      readonly [readonly AnyMachineSnapshot[], (s: AnyMachineSnapshot) => readonly ProjectEvent[]]
    > = [
      [writable, writes],
      [ready.filter((snapshot) => contextOf(snapshot).project !== undefined), () => [samples.projectFileActivity[0]!]],
      [repairable, () => samples.repairManifest],
      [failedWrite, () => samples.flushNow],
    ];
    const refused = checks.flatMap(([snapshots, sampled]) =>
      snapshots.flatMap((snapshot) =>
        sampled(snapshot)
          .filter((event) => !answers(snapshot, event))
          .map((event) => `${dotted(snapshot.value as StateValue)}: ${event.type}`),
      ),
    );
    expect(refused).toEqual([]);
  });

  it('should declare no baseline pair that the machine now answers', () => {
    const gaps = gapsOf(reachable(), options.events);
    const stale = projectIgnoredEvents.filter(
      ([state, eventType]) =>
        !gaps.some((gap) => gap.eventType === eventType && (state === '*' || matchesState(state, gap.state))),
    );
    expect(stale).toEqual([]);
  });
});
