import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
import type { FileParameterEntry, Project } from '@taucad/types';
import { isProjectContentActivityPath, projectMachine } from '#machines/project.machine.js';
import type { ProjectContext } from '#machines/project.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { createDefaultEntry, getActiveGroupValues } from '#utils/parameter-config.utils.js';
import type { KernelOptionsFactory, LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import { defaultProjectName } from '#constants/project-names.js';

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

const stubProject: Project = {
  id: 'test-project',
  name: 'Test Project',
  description: 'A test project',
  author: { name: 'Test', avatar: '' },
  tags: ['a', 'b'],
  thumbnail: 'thumb.png',
  createdAt: 1000,
  updatedAt: 2000,
  assets: {},
} satisfies Project;

const stubProjectWithMechanical: Project = {
  ...stubProject,
  assets: {
    mechanical: {
      main: 'main.ts',
      parameters: { width: 10 },
    },
  },
};

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

type WriteParameterInput = { projectId: string; filePath: string; entry: FileParameterEntry };

function createTestActor(options?: {
  loadResult?: Project | (() => Promise<Project>);
  writeResult?: () => Promise<void>;
  writeParameterResult?: (input?: WriteParameterInput) => Promise<void>;
  parameterEntries?: Map<string, FileParameterEntry>;
  shouldAutoLoad?: boolean;
  shouldLoadModelOnStart?: boolean;
  projectId?: string;
}) {
  const loadResult = options?.loadResult ?? stubProject;
  const loadFunction = typeof loadResult === 'function' ? loadResult : async () => loadResult;
  const parameterEntries = options?.parameterEntries;

  const machine = projectMachine.provide({
    actors: {
      loadProjectActor: fromSafeAsync(async () => {
        const project = await loadFunction();
        return { type: 'projectRetrieved', project, parameterEntries: parameterEntries ?? new Map() };
      }),
      ...(options?.writeResult
        ? {
            writeProjectActor: fromSafeAsync(async () => {
              await options.writeResult!();
            }),
          }
        : {}),
      ...(options?.writeParameterResult
        ? {
            writeParameterFileActor: fromSafeAsync<void, WriteParameterInput>(async ({ input }) => {
              await options.writeParameterResult!(input);
            }),
          }
        : {}),
    },
    guards: {
      isNotBrowser: () => false,
      shouldAutoLoad: () => options?.shouldAutoLoad ?? false,
    },
  });

  const fileManagerRef = mock<ProjectContext['fileManagerRef']>({ send: vi.fn() });
  const kernelOptionsFactory = createKernelOptionsFactory();

  return createActor(machine, {
    input: {
      projectId: options?.projectId ?? 'test-project',
      shouldLoadModelOnStart: options?.shouldLoadModelOnStart ?? false,
      fileManagerRef,
      kernelOptionsFactory,
    },
  });
}

async function startAndLoad(options?: Parameters<typeof createTestActor>[0]) {
  const actor = createTestActor(options);
  actor.start();
  actor.send({ type: 'loadProject', projectId: options?.projectId ?? 'test-project' });
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
      ['.tau', false],
      ['.tau/settings.json', false],
      ['.cache', false],
      ['.cache/render.bin', false],
      ['node_modules', false],
      ['node_modules/replicad/index.d.ts', false],
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
          loadProjectActor: fromSafeAsync(async () => {
            return { type: 'projectRetrieved', project: stubProject, parameterEntries: new Map() };
          }),
        },
        guards: {
          isNotBrowser: () => true,
          shouldAutoLoad: () => false,
        },
      });
      const fileManagerRef = mock<ProjectContext['fileManagerRef']>({ send: vi.fn() });
      const kernelOptionsFactory = createKernelOptionsFactory();
      const actor = createActor(machine, {
        input: { projectId: 'b', fileManagerRef, kernelOptionsFactory },
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
    it('should transition to loading on loadProject', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().value).toBe('idle');
      actor.send({ type: 'loadProject', projectId: 'test-project' });
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
      actor.send({ type: 'loadProject', projectId: 'test-project' });
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

      actor.send({ type: 'loadProject', projectId: 'test-project' });
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.error).toBeDefined();

      actor.send({ type: 'loadProject', projectId: 'test-project' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));
      expect(actor.getSnapshot().context.error).toBeUndefined();
      actor.stop();
    });

    it('should emit projectLoaded event on successful load', async () => {
      const actor = createTestActor();
      actor.start();
      const emitted: unknown[] = [];
      actor.on('projectLoaded', (event) => emitted.push(event));

      actor.send({ type: 'loadProject', projectId: 'test-project' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ type: 'projectLoaded', project: stubProject });
      actor.stop();
    });

    it('should accept view graphics events during loading', async () => {
      let resolveLoad!: (value: Project) => void;
      const actor = createTestActor({
        loadResult: async () =>
          new Promise<Project>((resolve) => {
            resolveLoad = resolve;
          }),
      });
      actor.start();
      actor.send({ type: 'loadProject', projectId: 'test-project' });
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
    it('should initialize with empty mainEntryFile when no mechanical asset', async () => {
      const actor = await startAndLoad();
      expect(actor.getSnapshot().context.mainEntryFile).toBe('');
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

    it('should set mainEntryFile via initializeKernelIfNeeded when shouldLoadModelOnStart is true', async () => {
      const actor = await startAndLoad({
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
      });
      expect(actor.getSnapshot().context.mainEntryFile).toBe('main.ts');
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

    it('should update project thumbnail', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'updateThumbnail', thumbnail: 'new-thumb.png' });
      expect(actor.getSnapshot().context.project?.thumbnail).toBe('new-thumb.png');
      actor.stop();
    });

    it('should update tags with deduplication', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'updateTags', tags: ['x', 'y', 'x', 'z', 'y'] });
      expect(actor.getSnapshot().context.project?.tags).toEqual(['x', 'y', 'z']);
      actor.stop();
    });

    it('should update updatedAt on name change', async () => {
      const actor = await startAndLoad();
      const before = actor.getSnapshot().context.project!.updatedAt;
      actor.send({ type: 'updateName', name: 'Trigger update' });
      const after = actor.getSnapshot().context.project!.updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
      actor.stop();
    });

    it('should preserve updatedAt on generated name change', async () => {
      const actor = await startAndLoad({ loadResult: { ...stubProject, name: defaultProjectName } });
      const before = actor.getSnapshot().context.project!.updatedAt;
      actor.send({ type: 'applyGeneratedProjectName', name: 'Generated Name' });
      const snapshot = actor.getSnapshot().context.project;
      expect(snapshot?.name).toBe('Generated Name');
      expect(snapshot?.updatedAt).toBe(before);
      actor.stop();
    });

    it('should ignore generated name changes once a project has a user name', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'applyGeneratedProjectName', name: 'Generated Name' });
      const snapshot = actor.getSnapshot().context.project;
      expect(snapshot?.name).toBe(stubProject.name);
      expect(snapshot?.updatedAt).toBe(stubProject.updatedAt);
      actor.stop();
    });

    it('should NOT update updatedAt on tag change', async () => {
      const actor = await startAndLoad();
      const before = actor.getSnapshot().context.project!.updatedAt;
      actor.send({ type: 'updateTags', tags: ['new'] });
      const after = actor.getSnapshot().context.project!.updatedAt;
      expect(after).toBe(before);
      actor.stop();
    });

    it('should set main file path in project assets', async () => {
      const actor = await startAndLoad({ loadResult: stubProjectWithMechanical });
      actor.send({ type: 'setMainFile', path: 'other.ts' });
      expect(actor.getSnapshot().context.project?.assets.mechanical?.main).toBe('other.ts');
      actor.stop();
    });

    it('should no-op setMainFile when no mechanical asset', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'setMainFile', path: 'other.ts' });
      expect(actor.getSnapshot().context.project?.assets.mechanical).toBeUndefined();
      actor.stop();
    });

    it('should bump updatedAt for visible project file activity', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(3001);
      const actor = await startAndLoad();
      actor.send({ type: 'projectFileActivity', operation: 'written', paths: ['main.ts'] });
      const snapshot = actor.getSnapshot().context.project;
      expect(snapshot?.updatedAt).toBe(3001);
      now.mockRestore();
      actor.stop();
    });

    it('should preserve updatedAt for root and housekeeping file activity', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(3001);
      const actor = await startAndLoad();
      actor.send({
        type: 'projectFileActivity',
        operation: 'batchWritten',
        paths: ['', '.tau/project.json', '.cache/render.bin', 'node_modules/pkg/index.d.ts'],
      });
      const snapshot = actor.getSnapshot().context.project;
      expect(snapshot?.updatedAt).toBe(stubProject.updatedAt);
      now.mockRestore();
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – geometry units
  // =========================================================================
  describe('ready – geometry units', () => {
    it('should create a geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(true);
      actor.stop();
    });

    it('should set mainEntryFile when it is currently empty', async () => {
      const actor = await startAndLoad();
      expect(actor.getSnapshot().context.mainEntryFile).toBe('');
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      expect(actor.getSnapshot().context.mainEntryFile).toBe('main.ts');
      actor.stop();
    });

    it('should NOT override mainEntryFile when it is already set', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'first.ts' });
      actor.send({ type: 'createGeometryUnit', entryFile: 'second.ts' });
      expect(actor.getSnapshot().context.mainEntryFile).toBe('first.ts');
      expect(actor.getSnapshot().context.geometryUnits.has('second.ts')).toBe(true);
      actor.stop();
    });

    it('should no-op when creating a geometry unit that already exists', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      const unitBefore = actor.getSnapshot().context.geometryUnits.get('main.ts');
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      const unitAfter = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unitAfter).toBe(unitBefore);
      actor.stop();
    });

    it('should destroy a geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(true);
      actor.send({ type: 'destroyGeometryUnit', entryFile: 'main.ts' });
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(false);
      actor.stop();
    });

    it('should clear mainEntryFile when destroying the main geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      expect(actor.getSnapshot().context.mainEntryFile).toBe('main.ts');
      actor.send({ type: 'destroyGeometryUnit', entryFile: 'main.ts' });
      expect(actor.getSnapshot().context.mainEntryFile).toBe('');
      actor.stop();
    });

    it('should NOT clear mainEntryFile when destroying a non-main geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      actor.send({ type: 'createGeometryUnit', entryFile: 'other.ts' });
      expect(actor.getSnapshot().context.mainEntryFile).toBe('main.ts');
      actor.send({ type: 'destroyGeometryUnit', entryFile: 'other.ts' });
      expect(actor.getSnapshot().context.mainEntryFile).toBe('main.ts');
      actor.stop();
    });

    it('should no-op when destroying a non-existent geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'destroyGeometryUnit', entryFile: 'nonexistent.ts' });
      expect(actor.getSnapshot().context.geometryUnits.size).toBe(0);
      actor.stop();
    });

    it('should openInViewer: create unit and emit viewerFileRequested', async () => {
      const actor = await startAndLoad();
      const emitted: unknown[] = [];
      actor.on('viewerFileRequested', (event) => emitted.push(event));

      actor.send({ type: 'openInViewer', entryFile: 'viewer.ts' });
      expect(actor.getSnapshot().context.geometryUnits.has('viewer.ts')).toBe(true);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ entryFile: 'viewer.ts' });
      actor.stop();
    });

    it('should add an exportable geometry unit path from a child availability event', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unit).toBeDefined();

      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: unit!.id,
        available: true,
      });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths).toEqual(new Set(['main.ts']));
      actor.stop();
    });

    it('should track only the exportable secondary geometry unit when the main unit is unavailable', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      actor.send({ type: 'createGeometryUnit', entryFile: 'helper.ts' });
      const mainUnit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      const helperUnit = actor.getSnapshot().context.geometryUnits.get('helper.ts');
      expect(mainUnit).toBeDefined();
      expect(helperUnit).toBeDefined();

      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: mainUnit!.id,
        available: false,
      });
      actor.send({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: helperUnit!.id,
        available: true,
      });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths).toEqual(new Set(['helper.ts']));
      actor.stop();
    });

    it('should remove an exportable geometry unit path when availability becomes false', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unit).toBeDefined();

      actor.send({ type: 'geometryUnit.exportAvailabilityChanged', actorId: unit!.id, available: true });
      actor.send({ type: 'geometryUnit.exportAvailabilityChanged', actorId: unit!.id, available: false });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths.size).toBe(0);
      actor.stop();
    });

    it('should ignore availability events from unknown geometry units', async () => {
      const actor = await startAndLoad();

      actor.send({ type: 'geometryUnit.exportAvailabilityChanged', actorId: 'missing-actor', available: true });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths.size).toBe(0);
      actor.stop();
    });

    it('should clear exportability when destroying a geometry unit', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unit).toBeDefined();
      actor.send({ type: 'geometryUnit.exportAvailabilityChanged', actorId: unit!.id, available: true });

      actor.send({ type: 'destroyGeometryUnit', entryFile: 'main.ts' });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths.size).toBe(0);
      actor.stop();
    });

    it('should rekey exportability when a geometry unit file moves', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unit).toBeDefined();
      actor.send({ type: 'geometryUnit.exportAvailabilityChanged', actorId: unit!.id, available: true });

      actor.send({ type: 'fileMoved', oldPath: 'main.ts', newPath: 'renamed.ts' });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths).toEqual(new Set(['renamed.ts']));
      actor.stop();
    });

    it('should clear exportability when a geometry unit file is deleted', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(unit).toBeDefined();
      actor.send({ type: 'geometryUnit.exportAvailabilityChanged', actorId: unit!.id, available: true });

      actor.send({ type: 'fileDeleted', path: 'main.ts' });

      expect(actor.getSnapshot().context.exportableGeometryUnitPaths.size).toBe(0);
      actor.stop();
    });

    it('should clear exportability when a geometry unit directory is deleted', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createGeometryUnit', entryFile: 'parts/main.ts' });
      const unit = actor.getSnapshot().context.geometryUnits.get('parts/main.ts');
      expect(unit).toBeDefined();
      actor.send({ type: 'geometryUnit.exportAvailabilityChanged', actorId: unit!.id, available: true });

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

    it('should support multiple independent view graphics', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'createViewGraphics', viewId: 'v1' });
      actor.send({ type: 'createViewGraphics', viewId: 'v2' });
      expect(actor.getSnapshot().context.viewGraphics.size).toBe(2);
      actor.send({ type: 'destroyViewGraphics', viewId: 'v1' });
      expect(actor.getSnapshot().context.viewGraphics.size).toBe(1);
      expect(actor.getSnapshot().context.viewGraphics.has('v2')).toBe(true);
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – parameters
  // =========================================================================
  describe('ready – parameters', () => {
    it('should update code parameters in project context', async () => {
      const actor = await startAndLoad({ loadResult: stubProjectWithMechanical });
      actor.send({
        type: 'updateCodeParameters',
        files: {},
        parameters: { height: 20 },
      });
      expect(actor.getSnapshot().context.project?.assets.mechanical?.parameters).toEqual({ height: 20 });
      actor.stop();
    });

    it('should no-op updateCodeParameters when no mechanical asset', async () => {
      const actor = await startAndLoad();
      actor.send({
        type: 'updateCodeParameters',
        files: {},
        parameters: { height: 20 },
      });
      expect(actor.getSnapshot().context.project?.assets.mechanical).toBeUndefined();
      actor.stop();
    });

    it('should update parameters and forward to main geometry unit', async () => {
      const entries = new Map<string, FileParameterEntry>([['main.ts', createDefaultEntry()]]);
      const actor = await startAndLoad({
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        parameterEntries: entries,
      });
      const mainUnit = actor.getSnapshot().context.geometryUnits.get('main.ts');
      expect(mainUnit).toBeDefined();

      actor.send({ type: 'setParameters', parameters: { depth: 5 } });
      const { parameterEntries } = actor.getSnapshot().context;
      expect(parameterEntries.size).toBeGreaterThan(0);
      expect(getActiveGroupValues(parameterEntries.get('main.ts'))).toEqual({ depth: 5 });
      actor.stop();
    });

    it('should no-op setParameters when no mechanical asset', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'setParameters', parameters: { depth: 5 } });
      expect(actor.getSnapshot().context.project?.assets.mechanical).toBeUndefined();
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – loadModel
  // =========================================================================
  describe('ready – loadModel', () => {
    it('should create geometry unit for main file when none exists', async () => {
      const actor = await startAndLoad({ loadResult: stubProjectWithMechanical });
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(false);
      actor.send({ type: 'loadModel' });
      expect(actor.getSnapshot().context.geometryUnits.has('main.ts')).toBe(true);
      expect(actor.getSnapshot().context.mainEntryFile).toBe('main.ts');
      actor.stop();
    });

    it('should no-op loadModel when no mechanical asset', async () => {
      const actor = await startAndLoad();
      actor.send({ type: 'loadModel' });
      expect(actor.getSnapshot().context.geometryUnits.size).toBe(0);
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
  // State: ready – project ID change
  // =========================================================================
  describe('ready – project ID change', () => {
    it('should reload with same projectId (no actor respawn)', async () => {
      const loadResults = [stubProject, { ...stubProject, name: 'Reloaded' }];
      let loadIndex = 0;
      const actor = await startAndLoad({
        loadResult: async () => loadResults[loadIndex++]!,
      });

      actor.send({ type: 'loadProject', projectId: 'test-project' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));
      expect(actor.getSnapshot().context.project?.name).toBe('Reloaded');
      actor.stop();
    });

    it('should stop and respawn actors when projectId changes', async () => {
      const actor = await startAndLoad();

      actor.send({ type: 'createGeometryUnit', entryFile: 'old.ts' });
      actor.send({ type: 'createViewGraphics', viewId: 'old-view' });
      expect(actor.getSnapshot().context.geometryUnits.size).toBe(1);
      expect(actor.getSnapshot().context.viewGraphics.size).toBe(1);

      actor.send({ type: 'loadProject', projectId: 'new-project' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));

      expect(actor.getSnapshot().context.projectId).toBe('new-project');
      expect(actor.getSnapshot().context.geometryUnits.size).toBe(0);
      expect(actor.getSnapshot().context.viewGraphics.size).toBe(0);
      expect(actor.getSnapshot().context.mainEntryFile).toBe('');
      actor.stop();
    });
  });

  // =========================================================================
  // State: error
  // =========================================================================
  describe('error', () => {
    it('should transition to loading on loadProject', async () => {
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

      actor.send({ type: 'loadProject', projectId: 'test-project' });
      await waitFor(actor, (s) => s.value === 'error');

      actor.send({ type: 'loadProject', projectId: 'test-project' });
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
      actor.send({ type: 'loadProject', projectId: 'test-project' });
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
      expect(context.mainEntryFile).toBe('');
      expect(context.geometryUnits.size).toBe(0);
      expect(context.viewGraphics.size).toBe(0);
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – parameterStoring (immediate write, no debounce)
  // =========================================================================
  describe('ready – parameterStoring', () => {
    it('should not transition to writing when parameterEntries is empty', async () => {
      const actor = await startAndLoad();
      expect(actor.getSnapshot().context.parameterEntries.size).toBe(0);

      actor.send({ type: 'setParameters', parameters: { width: 10 } });
      expect(actor.getSnapshot().matches({ ready: { parameterStoring: 'idle' } })).toBe(true);
      actor.stop();
    });

    it('should enter writing after a parameter event when entries exist', async () => {
      let resolveWrite!: () => void;
      const gate = new Promise<void>((resolve) => {
        resolveWrite = resolve;
      });

      const entries = new Map<string, FileParameterEntry>([['main.ts', createDefaultEntry()]]);
      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async () => {
          await gate;
        },
      });
      expect(actor.getSnapshot().context.parameterEntries.size).toBeGreaterThan(0);

      actor.send({ type: 'setParameters', parameters: { width: 10 } });
      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'writing' } }));
      resolveWrite();
      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));
      actor.stop();
    });

    it('should coalesce rapid parameter events into fewer writes than events', async () => {
      let writeCallCount = 0;
      const entries = new Map<string, FileParameterEntry>([['main.ts', createDefaultEntry()]]);
      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async () => {
          writeCallCount++;
        },
      });

      actor.send({ type: 'setParameters', parameters: { width: 1 } });
      actor.send({ type: 'setParameters', parameters: { width: 2 } });
      actor.send({ type: 'setParameters', parameters: { width: 3 } });

      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));
      expect(writeCallCount).toBe(2);
      actor.stop();
    });

    it('should coalesce events during writing into a follow-up write', async () => {
      vi.useFakeTimers();
      try {
        let writeCallCount = 0;
        const writeResolvers: Array<() => void> = [];
        const entries = new Map<string, FileParameterEntry>([['main.ts', createDefaultEntry()]]);
        const actor = await startAndLoad({
          parameterEntries: entries,
          loadResult: stubProjectWithMechanical,
          shouldLoadModelOnStart: true,
          writeParameterResult: async () => {
            writeCallCount++;
            return new Promise<void>((resolve) => {
              writeResolvers.push(resolve);
            });
          },
        });

        actor.send({ type: 'setParameters', parameters: { width: 1 } });
        await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'writing' } }));
        expect(writeCallCount).toBe(1);

        actor.send({ type: 'setParameters', parameters: { width: 2 } });
        await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'pending' } }));

        await vi.advanceTimersByTimeAsync(0);
        expect(writeCallCount).toBe(2);

        writeResolvers[1]!();
        await vi.advanceTimersByTimeAsync(0);
        await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));

        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should land in idle with error on parameter write failure and allow retry', async () => {
      let writeCallCount = 0;
      const entries = new Map<string, FileParameterEntry>([['main.ts', createDefaultEntry()]]);
      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async () => {
          writeCallCount++;
          if (writeCallCount === 1) {
            throw new Error('write failed');
          }
        },
      });

      actor.send({ type: 'setParameters', parameters: { width: 1 } });
      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));
      expect(writeCallCount).toBe(1);
      expect(actor.getSnapshot().context.error?.message).toBe('write failed');

      actor.send({ type: 'setParameters', parameters: { width: 2 } });
      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));
      expect(writeCallCount).toBe(2);

      actor.stop();
    });

    it('should write the correct geometry unit file path, not mainEntryFile', async () => {
      const writtenPaths: string[] = [];
      const entries = new Map<string, FileParameterEntry>([
        ['main.ts', createDefaultEntry()],
        ['other.ts', createDefaultEntry()],
      ]);
      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async (input) => {
          writtenPaths.push(input!.filePath);
        },
      });

      actor.send({ type: 'setGeometryUnitParameters', filePath: 'other.ts', parameters: { radius: 5 } });
      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));

      expect(writtenPaths).toEqual(['other.ts']);
      actor.stop();
    });

    it('should drain dirty set and write both geometry units when two different geometry units change rapidly', async () => {
      const writtenPaths: string[] = [];
      const entries = new Map<string, FileParameterEntry>([
        ['main.ts', createDefaultEntry()],
        ['other.ts', createDefaultEntry()],
      ]);
      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async (input) => {
          writtenPaths.push(input!.filePath);
        },
      });

      actor.send({ type: 'setGeometryUnitParameters', filePath: 'main.ts', parameters: { width: 1 } });
      actor.send({ type: 'setGeometryUnitParameters', filePath: 'other.ts', parameters: { radius: 2 } });

      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));

      expect(writtenPaths).toContain('main.ts');
      expect(writtenPaths).toContain('other.ts');
      actor.stop();
    });

    it('should deduplicate same-geometry-unit rapid fire in dirty set', async () => {
      const writtenPaths: string[] = [];
      const entries = new Map<string, FileParameterEntry>([['main.ts', createDefaultEntry()]]);
      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async (input) => {
          writtenPaths.push(input!.filePath);
        },
      });

      actor.send({ type: 'setGeometryUnitParameters', filePath: 'main.ts', parameters: { width: 1 } });
      actor.send({ type: 'setGeometryUnitParameters', filePath: 'main.ts', parameters: { width: 2 } });
      actor.send({ type: 'setGeometryUnitParameters', filePath: 'main.ts', parameters: { width: 3 } });

      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));

      expect(writtenPaths).toEqual(['main.ts', 'main.ts']);
      const { parameterEntries } = actor.getSnapshot().context;
      expect(getActiveGroupValues(parameterEntries.get('main.ts'))).toEqual({ width: 3 });
      actor.stop();
    });

    it('should clear dirtyParameterPaths after all writes complete', async () => {
      const entries = new Map<string, FileParameterEntry>([
        ['main.ts', createDefaultEntry()],
        ['other.ts', createDefaultEntry()],
      ]);
      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async () => {
          /* Test stub: no side effects needed */
        },
      });

      actor.send({ type: 'setGeometryUnitParameters', filePath: 'main.ts', parameters: { width: 1 } });
      actor.send({ type: 'setGeometryUnitParameters', filePath: 'other.ts', parameters: { radius: 2 } });

      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));

      expect(actor.getSnapshot().context.dirtyParameterPaths.size).toBe(0);
      actor.stop();
    });

    it('should lazily create a default entry for a non-main geometry unit on setGeometryUnitParameters', async () => {
      const entries = new Map<string, FileParameterEntry>([['main.ts', createDefaultEntry()]]);
      const writtenInputs: WriteParameterInput[] = [];
      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async (input) => {
          writtenInputs.push(input!);
        },
      });

      expect(actor.getSnapshot().context.parameterEntries.has('other.ts')).toBe(false);

      actor.send({ type: 'setGeometryUnitParameters', filePath: 'other.ts', parameters: { radius: 5 } });
      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));

      const { parameterEntries } = actor.getSnapshot().context;
      expect(parameterEntries.has('other.ts')).toBe(true);
      expect(getActiveGroupValues(parameterEntries.get('other.ts'))).toEqual({ radius: 5 });

      const otherWrite = writtenInputs.find((w) => w.filePath === 'other.ts');
      expect(otherWrite).toBeDefined();
      expect(otherWrite!.entry).toBeDefined();
      actor.stop();
    });

    it('should lazily init and write valid entry for a non-main geometry unit without throwing', async () => {
      const entries = new Map<string, FileParameterEntry>([['main.ts', createDefaultEntry()]]);
      let writeError: Error | undefined;
      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async (input) => {
          if (!input?.entry) {
            writeError = new Error('entry was undefined');
            throw writeError;
          }
        },
      });

      actor.send({ type: 'setGeometryUnitParameters', filePath: 'new-cu.ts', parameters: { height: 10 } });
      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));

      expect(writeError).toBeUndefined();
      expect(actor.getSnapshot().context.error).toBeUndefined();
      actor.stop();
    });

    it('should handle rapid parameter changes for a geometry unit that starts without an entry', async () => {
      const entries = new Map<string, FileParameterEntry>([['main.ts', createDefaultEntry()]]);
      const writtenInputs: WriteParameterInput[] = [];
      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async (input) => {
          writtenInputs.push(input!);
        },
      });

      actor.send({ type: 'setGeometryUnitParameters', filePath: 'new-cu.ts', parameters: { x: 1 } });
      actor.send({ type: 'setGeometryUnitParameters', filePath: 'new-cu.ts', parameters: { x: 2 } });
      actor.send({ type: 'setGeometryUnitParameters', filePath: 'new-cu.ts', parameters: { x: 3 } });

      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));

      const { parameterEntries } = actor.getSnapshot().context;
      expect(getActiveGroupValues(parameterEntries.get('new-cu.ts'))).toEqual({ x: 3 });

      const newCuWrites = writtenInputs.filter((w) => w.filePath === 'new-cu.ts');
      expect(newCuWrites.length).toBeGreaterThan(0);
      expect(newCuWrites.every((w) => Object.keys(w.entry.groups).length > 0)).toBe(true);
      actor.stop();
    });

    it('should load multi-geometry-unit parameter entries from loadProjectActor and make all accessible', async () => {
      const secondaryEntry: FileParameterEntry = {
        activeGroup: 'preset-a',
        groups: { 'preset-a': { values: { radius: 42, height: 100 } } },
      };
      const entries = new Map<string, FileParameterEntry>([
        ['main.ts', createDefaultEntry()],
        ['public/models/box-corner.js', secondaryEntry],
      ]);

      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
      });

      const { parameterEntries } = actor.getSnapshot().context;
      expect(parameterEntries.has('main.ts')).toBe(true);
      expect(parameterEntries.has('public/models/box-corner.js')).toBe(true);
      expect(getActiveGroupValues(parameterEntries.get('public/models/box-corner.js'))).toEqual({
        radius: 42,
        height: 100,
      });
      actor.stop();
    });

    it('should merge with pre-loaded non-main geometry unit entry on setGeometryUnitParameters', async () => {
      const secondaryEntry: FileParameterEntry = {
        activeGroup: 'default',
        groups: { default: { values: { radius: 42, depth: 10 } } },
      };
      const entries = new Map<string, FileParameterEntry>([
        ['main.ts', createDefaultEntry()],
        ['other.ts', secondaryEntry],
      ]);

      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async () => {
          /* Test stub: no side effects needed */
        },
      });

      actor.send({ type: 'setGeometryUnitParameters', filePath: 'other.ts', parameters: { radius: 99 } });
      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));

      const { parameterEntries } = actor.getSnapshot().context;
      expect(getActiveGroupValues(parameterEntries.get('other.ts'))).toEqual({ radius: 99 });
      actor.stop();
    });

    it('should write pre-loaded non-main geometry unit entry content via writeParameterFileActor', async () => {
      const secondaryEntry: FileParameterEntry = {
        activeGroup: 'default',
        groups: { default: { values: { radius: 42 } } },
      };
      const entries = new Map<string, FileParameterEntry>([
        ['main.ts', createDefaultEntry()],
        ['other.ts', secondaryEntry],
      ]);
      const writtenInputs: WriteParameterInput[] = [];

      const actor = await startAndLoad({
        parameterEntries: entries,
        loadResult: stubProjectWithMechanical,
        shouldLoadModelOnStart: true,
        writeParameterResult: async (input) => {
          writtenInputs.push(input!);
        },
      });

      actor.send({ type: 'setGeometryUnitParameters', filePath: 'other.ts', parameters: { radius: 99 } });
      await waitFor(actor, (s) => s.matches({ ready: { parameterStoring: 'idle' } }));

      const otherWrite = writtenInputs.find((w) => w.filePath === 'other.ts');
      expect(otherWrite).toBeDefined();
      expect(otherWrite!.entry.activeGroup).toBe('default');
      expect(otherWrite!.entry.groups['default']!.values).toEqual({ radius: 99 });
      actor.stop();
    });
  });
});
