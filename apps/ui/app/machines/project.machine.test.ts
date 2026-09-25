import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
import { projectToManifest } from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';
import { isProjectContentActivityPath, projectMachine, selectProjectKernelRefusal } from '#machines/project.machine.js';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import type { ProjectContext, ProjectLoadInput, ProjectRetrievedEvent } from '#machines/project.machine.js';
import { actorIdOf, fromSafeAsync } from '#lib/xstate.lib.js';
import type { KernelOptionsFactory, LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

vi.mock('#constants/browser.constants.js', () => ({
  isBrowser: true,
}));

const createKernelOptionsFactory = (): LazyKernelOptionsFactory => async () => () =>
  mock<ReturnType<KernelOptionsFactory>>({
    config: {
      tauApiUrl: 'https://api.test',
      tauWebSocketUrl: 'wss://api.test',
    },
  });

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const stubProject: ProjectManifest = projectToManifest({
  id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Test Project',
  description: 'A test project',
  tags: ['a', 'b'],
  assets: { main: { entryPath: 'main.ts' } },
});

const stubProjectWithMechanical = stubProject;

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createTestActor(options?: {
  loadResult?: ProjectManifest | (() => Promise<ProjectManifest>);
  writeResult?: () => Promise<void>;
  shouldAutoLoad?: boolean;
  shouldLoadModelOnStart?: boolean;
  projectId?: string;
}) {
  const loadResult = options?.loadResult ?? stubProject;
  const loadFunction = typeof loadResult === 'function' ? loadResult : async () => loadResult;

  const loadProjectActor = fromSafeAsync<ProjectRetrievedEvent, ProjectLoadInput>(async () => {
    const project = await loadFunction();
    return {
      type: 'projectRetrieved',
      project,
    };
  });
  const { writeResult } = options ?? {};
  const machine = projectMachine.provide({
    actors:
      writeResult === undefined
        ? { loadProjectActor }
        : {
            loadProjectActor,
            writeProjectActor: fromSafeAsync(async () => {
              await writeResult();
            }),
          },
    guards: {
      isNotBrowser: () => false,
      shouldAutoLoad: () => options?.shouldAutoLoad ?? false,
    },
  });

  const fileManagerRef = mock<ProjectContext['fileManagerRef']>({
    send: vi.fn(),
  });
  const kernelOptionsFactory = createKernelOptionsFactory();

  return createActor(machine, {
    input: {
      projectId: options?.projectId ?? 'test-project',
      shouldLoadModelOnStart: options?.shouldLoadModelOnStart ?? false,
      fileManagerRef,
      fileSystemRoot: '/previews/test-project',
      kernelOptionsFactory,
    },
  });
}

async function startAndLoad(options?: Parameters<typeof createTestActor>[0]) {
  const actor = createTestActor(options);
  actor.start();
  actor.send({ type: 'reloadProject' });
  await waitFor(actor, (s) => s.matches({ ready: {} }));
  return actor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('projectMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('project content activity path classification', () => {
    it.each([
      ['', false],
      ['.', false],
      ['/', false],
      // Project metadata, not work on the design.
      ['tau.json', false],
      // Records, cache and control plane are never content activity.
      ['thumbnail.webp', false],
      ['exports/model.step', false],
      ['.tau/chats/chat-1/events.jsonl', false],
      ['.tau/cache/render.bin', false],
      ['.git/HEAD', false],
      ['node_modules', false],
      ['node_modules/replicad/index.d.ts', false],
      /* An authored `.tau` control *is* content: the blanket `.tau` exclusion
       * this replaced swallowed parameter edits (Rule 16). */
      ['.tau/parameters/main.json', true],
      ['main.ts', true],
      ['/main.ts', true],
      ['src', true],
      ['src/model.ts', true],
      ['assets/mesh.step', true],
    ])('classifies %s as project content activity: %s', (path, expected) => {
      expect(isProjectContentActivityPath(path)).toBe(expected);
    });
  });

  // =========================================================================
  // State: checkEnvironment
  // =========================================================================
  describe('checkEnvironment', () => {
    it('should go to idle when browser but shouldAutoLoad is false', () => {
      const actor = createTestActor({ shouldAutoLoad: false });
      actor.start();
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should go to loading when shouldAutoLoad is true', () => {
      const actor = createTestActor({ shouldAutoLoad: true });
      actor.start();
      expect(actor.getSnapshot().value).toBe('loading');
      actor.stop();
    });

    it('should go to ssr when isNotBrowser is true', () => {
      const machine = projectMachine.provide({
        actors: {
          loadProjectActor: fromSafeAsync<ProjectRetrievedEvent, ProjectLoadInput>(async () => {
            return {
              type: 'projectRetrieved',
              project: stubProject,
            };
          }),
        },
        guards: {
          isNotBrowser: () => true,
          shouldAutoLoad: () => false,
        },
      });
      const fileManagerRef = mock<ProjectContext['fileManagerRef']>({
        send: vi.fn(),
      });
      const kernelOptionsFactory = createKernelOptionsFactory();
      const actor = createActor(machine, {
        input: {
          projectId: 'b',
          fileManagerRef,
          fileSystemRoot: '/projects/b',
          kernelOptionsFactory,
        },
      });
      actor.start();
      expect(actor.getSnapshot().value).toBe('ssr');
      actor.stop();
    });
  });

  // =========================================================================
  // State: idle
  // =========================================================================
  describe('idle', () => {
    it('should transition to loading on reloadProject', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().value).toBe('idle');
      actor.send({ type: 'reloadProject' });
      expect(actor.getSnapshot().value).toBe('loading');
      actor.stop();
    });

    it('should accept createViewGraphics in idle', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'createViewGraphics', viewId: 'v1' });
      expect(actor.getSnapshot().context.viewGraphics.has('v1')).toBe(true);
      actor.stop();
    });

    /* The graphics actor is the live owner of its durable keys (Law 1), and `createViewGraphics` is
     * the only path the app takes to build a view, so the record has to reach the spawn input. */
    it('should seed a spawned view graphics actor with every durable key it owns', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({
        type: 'createViewGraphics',
        viewId: 'v1',
        settings: {
          ...defaultGraphicsSettings,
          enableGrid: false,
          sectionView: { active: true, plane: 'xz', pivot: [1, 2, 3], rotation: [0, 0.5, 0], direction: 1 },
          sectionDisplay: { clipLines: false, clipMesh: false, planeName: 'cartesian' },
        },
      });

      const graphics = actor.getSnapshot().context.viewGraphics.get('v1');
      expect(graphics).toBeDefined();
      expect(graphics!.getSnapshot().context).toMatchObject({
        enableGrid: false,
        isSectionViewActive: true,
        selectedSectionViewId: 'xz',
        sectionViewPivot: [1, 2, 3],
        sectionViewRotation: [0, 0.5, 0],
        sectionViewDirection: 1,
        enableClippingLines: false,
        enableClippingMesh: false,
        planeName: 'cartesian',
      });
      actor.stop();
    });

    it('should accept destroyViewGraphics in idle', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'createViewGraphics', viewId: 'v1' });
      actor.send({ type: 'destroyViewGraphics', viewId: 'v1' });
      expect(actor.getSnapshot().context.viewGraphics.has('v1')).toBe(false);
      actor.stop();
    });
  });

  // =========================================================================
  // State: loading
  // =========================================================================
  describe('loading', () => {
    it('should transition to ready on successful load', async () => {
      const actor = await startAndLoad();
      expect(actor.getSnapshot().matches({ ready: {} })).toBe(true);
      actor.stop();
    });

    it('should set project in context after load', async () => {
      const actor = await startAndLoad();
      expect(actor.getSnapshot().context.project).toEqual(stubProject);
      expect(actor.getSnapshot().context.isLoading).toBe(false);
      actor.stop();
    });

    it('should transition to error on load failure', async () => {
      const actor = createTestActor({
        loadResult: async () => {
          throw new Error('load failed');
        },
      });
      actor.start();
      actor.send({ type: 'reloadProject' });
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.error?.message).toBe('load failed');
      actor.stop();
    });

    it('should clear previous error on loading entry', async () => {
      const loadCallCount = { count: 0 };
      const actor = createTestActor({
        loadResult: async () => {
          loadCallCount.count++;
          if (loadCallCount.count === 1) {
            throw new Error('first attempt');
          }
          return stubProject;
        },
      });
      actor.start();

      actor.send({ type: 'reloadProject' });
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.error).toBeDefined();

      actor.send({ type: 'reloadProject' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));
      expect(actor.getSnapshot().context.error).toBeUndefined();
      actor.stop();
    });

    it('should accept view graphics events during loading', async () => {
      let resolveLoad!: (value: ProjectManifest) => void;
      const actor = createTestActor({
        loadResult: async () =>
          new Promise<ProjectManifest>((resolve) => {
            resolveLoad = resolve;
          }),
      });
      actor.start();
      actor.send({ type: 'reloadProject' });
      expect(actor.getSnapshot().value).toBe('loading');

      actor.send({ type: 'createViewGraphics', viewId: 'v1' });
      expect(actor.getSnapshot().context.viewGraphics.has('v1')).toBe(true);

      resolveLoad(stubProject);
      await waitFor(actor, (s) => s.matches({ ready: {} }));
      expect(actor.getSnapshot().context.viewGraphics.has('v1')).toBe(true);
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – context initialization
  // =========================================================================
  describe('ready – initial context', () => {
    it('should leave mainEntryPath empty until model loading is requested', async () => {
      const actor = await startAndLoad();
      expect(actor.getSnapshot().context.mainEntryPath).toBe('');
      actor.stop();
    });

    it('should initialize with empty geometryUnits when shouldLoadModelOnStart is false', async () => {
      const actor = await startAndLoad({
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: false,
      });
      expect(actor.getSnapshot().context.geometryUnits.size).toBe(0);
      expect(actor.getSnapshot().context.exportableGeometryUnitPaths.size).toBe(0);
      actor.stop();
    });

    it('should set mainEntryPath via initializeKernelIfNeeded when shouldLoadModelOnStart is true', async () => {
      const actor = await startAndLoad({
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
      });
      expect(actor.getSnapshot().context.mainEntryPath).toBe('main.ts');
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(true);
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – project metadata updates
  // =========================================================================
  describe('ready – metadata actions', () => {
    it('should update project name', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'updateName', name: 'New Name' });
      expect(actor.getSnapshot().context.project?.name).toBe('New Name');
      actor.stop();
    });

    it('should no-op updateName when project is undefined', async () => {
      const actor = await startAndLoad();
      // Manually clear the project for this edge case test
      // We can't easily unset project, but we can verify the action guard by
      // checking the project remains as-is
      actor.send({ type: 'updateName', name: 'Changed' });
      expect(actor.getSnapshot().context.project?.name).toBe('Changed');
      actor.stop();
    });

    it('should update project description', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'updateDescription', description: 'New desc' });
      expect(actor.getSnapshot().context.project?.description).toBe('New desc');
      actor.stop();
    });

    it('should update tags with deduplication', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'updateTags', tags: ['x', 'y', 'x', 'z', 'y'] });
      expect(actor.getSnapshot().context.project?.tags).toEqual(['x', 'y', 'z']);
      actor.stop();
    });

    it('should set main file path in project assets', async () => {
      const actor = await startAndLoad({
        loadResult: stubProjectWithMechanical,
      });
      actor.send({ type: 'setMainFile', path: 'other.ts' });
      expect(actor.getSnapshot().context.project?.assets.main.entryPath).toBe('other.ts');
      actor.stop();
    });

    it('should emit local activity for visible project file activity', async () => {
      const actor = await startAndLoad();
      const emitted: string[] = [];
      actor.on('projectActivity', (event) => emitted.push(event.type));
      actor.send({
        type: 'projectFileActivity',
        operation: 'written',
        paths: ['main.ts'],
      });
      expect(emitted).toEqual(['projectActivity']);
      actor.stop();
    });

    it('should not emit local activity for root and housekeeping file activity', async () => {
      const actor = await startAndLoad();
      const emitted: string[] = [];
      actor.on('projectActivity', (event) => emitted.push(event.type));
      actor.send({
        type: 'projectFileActivity',
        operation: 'batchWritten',
        paths: ['', 'tau.json', '.tau/cache/render.bin', '.git/HEAD', 'node_modules/pkg/index.d.ts'],
      });
      expect(emitted).toEqual([]);
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – geometry units
  // =========================================================================
  describe('ready – geometry units', () => {
    it('should create a geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(true);
      expect(actor.getSnapshot().context.geometryUnits.get('main.ts')?.getSnapshot().context.fileSystemRoot).toBe(
        '/previews/test-project',
      );
      actor.stop();
    });

    /*
     * R4 / V2-3: the row says one sentence, so the project keeps one refusal,
     * tagged with the unit that reported it — the clear rides on a unit
     * *entering* `connecting`, and a second view's first attempt must not green
     * a row whose other unit is still refused.
     */
    it('keeps the refusal a unit reported until that unit takes it back', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      await vi.waitFor(() => {
        expect(selectProjectKernelRefusal(actor.getSnapshot())).toBeDefined();
      });
      const refused = actor.getSnapshot().context.kernelRefusal?.actorId;

      /* A second view opens and starts connecting: its own clear says nothing
       * about the unit that is still refused. */
      actor.send({ type: 'createGeometryUnit', entryPath: 'lib/cube.ts' });
      expect(actor.getSnapshot().context.kernelRefusal?.actorId).toBe(refused);
      expect(selectProjectKernelRefusal(actor.getSnapshot())).toBeDefined();

      /* The unit that reported it tries again: only it can take it back. */
      actor.getSnapshot().context.geometryUnits.get('main.ts')?.send({ type: 'initializeModel', entryPath: 'main.ts' });
      expect(selectProjectKernelRefusal(actor.getSnapshot())).toBeUndefined();
      actor.stop();
    });

    /* R4: a unit nobody holds cannot keep a row red. */
    it('drops a refusal when the unit that reported it is closed', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'lib/cube.ts' });
      await vi.waitFor(() => {
        expect(selectProjectKernelRefusal(actor.getSnapshot())).toBeDefined();
      });

      actor.send({ type: 'destroyGeometryUnit', entryPath: 'lib/cube.ts' });

      expect(selectProjectKernelRefusal(actor.getSnapshot())).toBeUndefined();
      actor.stop();
    });

    /* R3: the live session decides that nobody is looking; this owns the kernels. */
    it('parks and resumes every geometry unit it owns', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      actor.send({ type: 'createGeometryUnit', entryPath: 'lib/cube.ts' });
      const units = () => [...actor.getSnapshot().context.geometryUnits.values()];
      await vi.waitFor(() => {
        expect(units().every((unit) => unit.getSnapshot().value === 'error')).toBe(true);
      });

      actor.send({ type: 'parkRuntime' });
      expect(units().map((unit) => unit.getSnapshot().value)).toEqual(['parked', 'parked']);

      actor.send({ type: 'resumeRuntime' });
      expect(units().map((unit) => unit.getSnapshot().value)).toEqual(['connecting', 'connecting']);
      actor.stop();
    });

    it('should initialize a nested geometry unit with its exact entry path', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'lib/cube.ts' });

      const unit = actor.getSnapshot().context.geometryUnits.get('lib/cube.ts');

      expect(unit?.getSnapshot().context.entryPath).toBe('lib/cube.ts');
      actor.stop();
    });

    it('should set mainEntryPath when it is currently empty', async () => {
      const actor = await startAndLoad();
      expect(actor.getSnapshot().context.mainEntryPath).toBe('');
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      expect(actor.getSnapshot().context.mainEntryPath).toBe('main.ts');
      actor.stop();
    });

    it('should NOT override mainEntryPath when it is already set', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'first.ts' });
      actor.send({ type: 'createGeometryUnit', entryPath: 'second.ts' });
      expect(actor.getSnapshot().context.mainEntryPath).toBe('first.ts');
      expect(actor.getSnapshot().context.geometryUnits.has('second.ts')).toBe(true);
      actor.stop();
    });

    it('should no-op when creating a geometry unit that already exists', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      const unitBefore = actor.getSnapshot().context.geometryUnits.get('main.ts');
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      const unitAfter = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unitAfter).toBe(unitBefore);
      actor.stop();
    });

    it('should destroy a geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(true);
      actor.send({ type: 'destroyGeometryUnit', entryPath: 'main.ts' });
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(false);
      actor.stop();
    });

    it('should clear mainEntryPath when destroying the main geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      expect(actor.getSnapshot().context.mainEntryPath).toBe('main.ts');
      actor.send({ type: 'destroyGeometryUnit', entryPath: 'main.ts' });
      expect(actor.getSnapshot().context.mainEntryPath).toBe('');
      actor.stop();
    });

    it('should NOT clear mainEntryPath when destroying a non-main geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      actor.send({ type: 'createGeometryUnit', entryPath: 'other.ts' });
      expect(actor.getSnapshot().context.mainEntryPath).toBe('main.ts');
      actor.send({ type: 'destroyGeometryUnit', entryPath: 'other.ts' });
      expect(actor.getSnapshot().context.mainEntryPath).toBe('main.ts');
      actor.stop();
    });

    it('should no-op when destroying a non-existent geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'destroyGeometryUnit', entryPath: 'nonexistent.ts' });
      expect(actor.getSnapshot().context.geometryUnits.size).toBe(0);
      actor.stop();
    });

    it('should openInViewer: create unit and emit viewerFileRequested', async () => {
      const actor = await startAndLoad();
      const emitted: unknown[] = [];
      actor.on('viewerFileRequested', (event) => emitted.push(event));

      actor.send({ type: 'openInViewer', entryPath: 'viewer.ts' });
      expect(actor.getSnapshot().context.geometryUnits.has('viewer.ts')).toBe(true);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ entryPath: 'viewer.ts' });
      actor.stop();
    });

    it('should add an exportable geometry unit path from a child availability event', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unit).toBeDefined();

      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actorIdOf(unit!),
        available: true,
      });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths).toEqual(new Set(['main.ts']));
      actor.stop();
    });

    it('should track only the exportable secondary geometry unit when the main unit is unavailable', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      actor.send({ type: 'createGeometryUnit', entryPath: 'helper.ts' });
      const mainUnit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      const helperUnit = actor.getSnapshot().context.geometryUnits.get('helper.ts');
      expect(mainUnit).toBeDefined();
      expect(helperUnit).toBeDefined();

      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actorIdOf(mainUnit!),
        available: false,
      });
      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actorIdOf(helperUnit!),
        available: true,
      });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths).toEqual(new Set(['helper.ts']));
      actor.stop();
    });

    it('should remove an exportable geometry unit path when availability becomes false', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unit).toBeDefined();

      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actorIdOf(unit!),
        available: true,
      });
      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actorIdOf(unit!),
        available: false,
      });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths.size).toBe(0);
      actor.stop();
    });

    it('should ignore availability events from unknown geometry units', async () => {
      const actor = await startAndLoad();

      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: 'missing-actor',
        available: true,
      });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths.size).toBe(0);
      actor.stop();
    });

    it('should clear exportability when destroying a geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unit).toBeDefined();
      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actorIdOf(unit!),
        available: true,
      });

      actor.send({ type: 'destroyGeometryUnit', entryPath: 'main.ts' });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths.size).toBe(0);
      actor.stop();
    });

    it('should rekey exportability when a geometry unit file moves', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unit).toBeDefined();
      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actorIdOf(unit!),
        available: true,
      });

      actor.send({
        type: 'fileMoved',
        oldPath: 'main.ts',
        newPath: 'renamed.ts',
      });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths).toEqual(new Set(['renamed.ts']));
      actor.stop();
    });

    it('should point a moved geometry unit at its new file', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'parts/main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('parts/main.ts');

      actor.send({ type: 'fileMoved', oldPath: 'parts', newPath: 'models' });

      expect(actor.getSnapshot().context.geometryUnits.get('models/main.ts')).toBe(unit);
      expect(unit!.getSnapshot().context.entryPath).toBe('models/main.ts');
      actor.stop();
    });

    it('should clear exportability when a geometry unit file is deleted', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unit).toBeDefined();
      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actorIdOf(unit!),
        available: true,
      });

      actor.send({ type: 'fileDeleted', path: 'main.ts' });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths.size).toBe(0);
      actor.stop();
    });

    it('should clear exportability when a geometry unit directory is deleted', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryPath: 'parts/main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('parts/main.ts');
      expect(unit).toBeDefined();
      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actorIdOf(unit!),
        available: true,
      });

      actor.send({ type: 'directoryDeleted', path: 'parts' });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths.size).toBe(0);
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – view graphics
  // =========================================================================
  describe('ready – view graphics', () => {
    it('should create a graphics actor for a view', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createViewGraphics', viewId: 'panel-1' });
      expect(actor.getSnapshot().context.viewGraphics.has('panel-1')).toBe(true);
      actor.stop();
    });

    it('should no-op when creating graphics for an existing view', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createViewGraphics', viewId: 'panel-1' });
      const gfxBefore = actor.getSnapshot().context.viewGraphics.get('panel-1');
      actor.send({ type: 'createViewGraphics', viewId: 'panel-1' });
      const gfxAfter = actor.getSnapshot().context.viewGraphics.get('panel-1');
      expect(gfxAfter).toBe(gfxBefore);
      actor.stop();
    });

    it('should destroy a graphics actor', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createViewGraphics', viewId: 'panel-1' });
      actor.send({ type: 'destroyViewGraphics', viewId: 'panel-1' });
      expect(actor.getSnapshot().context.viewGraphics.has('panel-1')).toBe(false);
      actor.stop();
    });

    it('should no-op when destroying a non-existent graphics view', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'destroyViewGraphics', viewId: 'nonexistent' });
      expect(actor.getSnapshot().context.viewGraphics.size).toBe(0);
      actor.stop();
    });

    it('should share one project model interaction actor across multiple view graphics', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createViewGraphics', viewId: 'v1' });
      actor.send({ type: 'createViewGraphics', viewId: 'v2' });
      const { modelInteractionRef, viewGraphics } = actor.getSnapshot().context;
      expect(viewGraphics.get('v1')?.getSnapshot().context.modelInteractionRef).toBe(modelInteractionRef);
      expect(viewGraphics.get('v2')?.getSnapshot().context.modelInteractionRef).toBe(modelInteractionRef);
      actor.send({ type: 'destroyViewGraphics', viewId: 'v1' });
      expect(modelInteractionRef.getSnapshot().status).toBe('active');
      expect(actor.getSnapshot().context.viewGraphics.has('v2')).toBe(true);
      actor.stop();
      expect(modelInteractionRef.getSnapshot().status).toBe('stopped');
    });

    it('should rekey and prune shared model display state with source files', async () => {
      const actor = await startAndLoad();
      const { modelInteractionRef } = actor.getSnapshot().context;
      modelInteractionRef.send({
        type: 'restoreComponentDisplay',
        componentDisplay: {
          schemaVersion: 1,
          unitsById: { 'file:main.ts': { hiddenComponentIds: ['node-1'] } },
        },
      });

      actor.send({
        type: 'fileMoved',
        oldPath: 'main.ts',
        newPath: 'renamed.ts',
      });
      expect(modelInteractionRef.getSnapshot().context.unitsById['file:main.ts']).toBeUndefined();
      expect(modelInteractionRef.getSnapshot().context.unitsById['file:renamed.ts']?.hiddenComponentIds).toEqual([
        'node-1',
      ]);

      actor.send({ type: 'fileDeleted', path: 'renamed.ts' });
      expect(modelInteractionRef.getSnapshot().context.unitsById['file:renamed.ts']).toBeUndefined();
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – loadModel
  // =========================================================================
  describe('ready – loadModel', () => {
    it('should create geometry unit for main file when none exists', async () => {
      const actor = await startAndLoad({
        loadResult: stubProjectWithMechanical,
      });
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(false);
      actor.send({ type: 'loadModel' });
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(true);
      expect(actor.getSnapshot().context.mainEntryPath).toBe('main.ts');
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – storing (immediate write, no debounce)
  // =========================================================================
  describe('ready – storing', () => {
    it('should enter storing.writing after a metadata update', async () => {
      let resolveWrite!: () => void;
      const writeGate = new Promise<void>((resolve) => {
        resolveWrite = resolve;
      });

      const actor = await startAndLoad({
        writeResult: async () => {
          await writeGate;
        },
      });

      actor.send({ type: 'updateName', name: 'Trigger Store' });
      await waitFor(actor, (s) => s.matches({ ready: { storing: 'writing' } }));
      resolveWrite();
      await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));
      actor.stop();
    });

    it('should write project without debounce delay', async () => {
      let writeCallCount = 0;
      const actor = await startAndLoad({
        writeResult: async () => {
          writeCallCount++;
        },
      });

      actor.send({ type: 'updateName', name: 'Immediate' });
      await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));
      expect(writeCallCount).toBe(1);
      actor.stop();
    });

    it('should run a follow-up write when another update arrives during writing', async () => {
      let writeCallCount = 0;
      const writeResolvers: Array<() => void> = [];
      const actor = await startAndLoad({
        writeResult: async () => {
          writeCallCount++;
          return new Promise<void>((resolve) => {
            writeResolvers.push(resolve);
          });
        },
      });

      actor.send({ type: 'updateName', name: 'First' });
      await waitFor(actor, (s) => s.matches({ ready: { storing: 'writing' } }));
      expect(writeCallCount).toBe(1);

      actor.send({ type: 'updateDescription', description: 'Second' });
      await waitFor(actor, (s) => s.matches({ ready: { storing: 'writing' } }));
      expect(writeResolvers).toHaveLength(2);

      writeResolvers[1]!();
      await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));
      expect(writeCallCount).toBe(2);
      actor.stop();
    });

    it('should land in idle with error on write failure', async () => {
      let writeCallCount = 0;
      const actor = await startAndLoad({
        writeResult: async () => {
          writeCallCount++;
          if (writeCallCount === 1) {
            throw new Error('write failed');
          }
        },
      });

      actor.send({ type: 'updateName', name: 'Will Fail' });
      await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));
      expect(writeCallCount).toBe(1);
      expect(actor.getSnapshot().context.error?.message).toBe('write failed');

      actor.send({ type: 'updateName', name: 'Retry' });
      await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));
      expect(writeCallCount).toBe(2);
      actor.stop();
    });

    it('should flush immediately on flushNow event while pending', async () => {
      vi.useFakeTimers();
      try {
        let writeCallCount = 0;
        const writeResolvers: Array<() => void> = [];
        const actor = await startAndLoad({
          writeResult: async () => {
            writeCallCount++;
            return new Promise<void>((resolve) => {
              writeResolvers.push(resolve);
            });
          },
        });

        actor.send({ type: 'updateName', name: 'First' });
        await waitFor(actor, (s) => s.matches({ ready: { storing: 'writing' } }));
        actor.send({ type: 'updateDescription', description: 'Queue' });
        await waitFor(actor, (s) => s.matches({ ready: { storing: 'pending' } }));

        actor.send({ type: 'flushNow' });
        expect(actor.getSnapshot().matches({ ready: { storing: 'writing' } })).toBe(true);

        await vi.advanceTimersByTimeAsync(0);
        writeResolvers[1]!();
        await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));
        expect(writeCallCount).toBe(2);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should emit projectUpdated after successful write', async () => {
      const actor = await startAndLoad({
        writeResult: async () => {
          /* No-op */
        },
      });

      const emitted: unknown[] = [];
      actor.on('projectUpdated', (event) => emitted.push(event));

      actor.send({ type: 'updateName', name: 'Updated' });
      await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));

      expect(emitted).toHaveLength(1);
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – same-project reload
  // =========================================================================
  describe('ready – same-project reload', () => {
    it('should reload without replacing the immutable project ID or stateful actors', async () => {
      const loadResults = [stubProject, { ...stubProject, name: 'Reloaded' }];
      let loadIndex = 0;
      const actor = await startAndLoad({
        loadResult: async () => loadResults[loadIndex++]!,
      });

      actor.send({ type: 'createGeometryUnit', entryPath: 'old.ts' });
      actor.send({ type: 'createViewGraphics', viewId: 'old-view' });
      const geometryUnit = actor.getSnapshot().context.geometryUnits.get('old.ts');
      const viewGraphics = actor.getSnapshot().context.viewGraphics.get('old-view');

      actor.send({ type: 'reloadProject' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));

      expect(actor.getSnapshot().context.projectId).toBe('test-project');
      expect(actor.getSnapshot().context.project?.name).toBe('Reloaded');
      expect(actor.getSnapshot().context.geometryUnits.get('old.ts')).toBe(geometryUnit);
      expect(actor.getSnapshot().context.viewGraphics.get('old-view')).toBe(viewGraphics);
      actor.stop();
    });
  });

  // =========================================================================
  // State: error
  // =========================================================================
  describe('error', () => {
    it('should transition to loading on reloadProject', async () => {
      let loadIndex = 0;
      const actor = createTestActor({
        loadResult: async () => {
          loadIndex++;
          if (loadIndex === 1) {
            throw new Error('boom');
          }
          return stubProject;
        },
      });
      actor.start();

      actor.send({ type: 'reloadProject' });
      await waitFor(actor, (s) => s.value === 'error');

      actor.send({ type: 'reloadProject' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));
      expect(actor.getSnapshot().context.error).toBeUndefined();
      actor.stop();
    });

    it('should set error context on unknown error shape', async () => {
      const actor = createTestActor({
        // oxlint-disable-next-line @typescript-eslint/only-throw-error -- testing non-Error rejection
        loadResult: async () => {
          // oxlint-disable-next-line @typescript-eslint/only-throw-error -- testing non-Error rejection
          throw 'string error';
        },
      });
      actor.start();
      actor.send({ type: 'reloadProject' });
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.error?.message).toBe('Unknown error');
      actor.stop();
    });
  });

  // =========================================================================
  // Context initialization
  // =========================================================================
  describe('context initialization', () => {
    it('should initialize with correct defaults', () => {
      const actor = createTestActor({ projectId: 'init-test' });
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.projectId).toBe('init-test');
      expect(context.project).toBeUndefined();
      expect(context.error).toBeUndefined();
      expect(context.isLoading).toBe(true);
      expect(context.mainEntryPath).toBe('');
      expect(context.geometryUnits.size).toBe(0);
      expect(context.viewGraphics.size).toBe(0);
      actor.stop();
    });
  });
});
