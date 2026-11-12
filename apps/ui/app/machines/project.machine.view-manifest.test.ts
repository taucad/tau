/*
 * How the project decides that a unit's shared manifest is no longer presented (G11b). Each view's graphics reports
 * the unit it presents and its media type (`presentedUnitChanged`), and the project releases a unit's manifest,
 * selection and focus once no GLB view presents it. These rows were characterised against the snapshot reads this
 * replaced; the one change (charter D14) is that a view's own change releases the unit without a request from React.
 */
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor } from 'xstate';
import type { GeometryComponentManifest } from '@taucad/types';
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import {
  deriveModelInteractionUnitId,
  getModelInteractionUnitState,
} from '@taucad/viewer/machines/model-interaction.machine';
import { projectMachine } from '#machines/project.machine.js';
import type { ProjectContext, ProjectLoadInput, ProjectRetrievedEvent } from '#machines/project.machine.js';
import type { KernelOptionsFactory, LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

vi.mock('#constants/browser.constants.js', () => ({
  isBrowser: true,
}));

const createKernelOptionsFactory = (): LazyKernelOptionsFactory => async () => () =>
  mock<ReturnType<KernelOptionsFactory>>({
    config: { tauApiUrl: 'https://api.test', tauWebSocketUrl: 'wss://api.test' },
  });

const createProjectActor = () =>
  createActor(
    projectMachine.provide({
      actors: {
        loadProjectActor: fromSafeAsync<ProjectRetrievedEvent, ProjectLoadInput>(async () => ({
          type: 'projectRetrieved',
          project: createProjectFixture({
            id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
            name: 'Test Project',
            description: 'A test project',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          }),
        })),
      },
      guards: { isNotBrowser: () => false, shouldAutoLoad: () => false },
    }),
    {
      input: {
        projectId: 'test-project',
        shouldLoadModelOnStart: false,
        fileManagerRef: mock<ProjectContext['fileManagerRef']>({ send: vi.fn() }),
        fileSystemRoot: '/previews/test-project',
        kernelOptionsFactory: createKernelOptionsFactory(),
      },
    },
  );

const capabilities = {
  canAdjustOpacity: false,
  canFocus: false,
  canHide: false,
  canIsolate: false,
  exports: [],
  hasDrawings: false,
  hasPreciseTopology: false,
};

const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  rootId: 'root',
  nodeOrder: ['root'],
  nodesById: {
    root: {
      id: 'root',
      selector: 'root',
      name: 'Model',
      kind: 'model',
      depth: 0,
      childIds: [],
      meshNodeIndices: [],
      primitiveIndices: [],
      materialIndices: [],
      path: ['Model'],
      capabilities,
    },
  },
  capabilities,
};

const gltf = (): { mimeType: 'model/gltf-binary'; content: Uint8Array<ArrayBuffer> } => ({
  mimeType: 'model/gltf-binary',
  content: new TextEncoder().encode('{}'),
});

type ProjectActor = ReturnType<typeof createProjectActor>;

/** Open a view and present `unitId` in it, as GltfMesh's commit does. */
function presentInView(project: ProjectActor, viewId: string, unitId: string): void {
  project.send({ type: 'createViewGraphics', viewId });
  const graphics = project.getSnapshot().context.viewGraphics.get(viewId)!;
  // The geometry key differs from the unit, so a row cannot pass by reading one for the other.
  graphics.send({ type: 'updateArtifact', artifact: gltf(), hash: `glb-${unitId}` });
  const { requestedRevision } = graphics.getSnapshot().context.gltfPresentation;
  graphics.send({
    type: 'gltfPresentationCommitted',
    revision: requestedRevision,
    key: `glb-${unitId}`,
    unitId,
    manifest,
  });
  // A selection and a focus on the unit, which reconciliation clears with the manifest.
  const { modelInteractionRef } = project.getSnapshot().context;
  modelInteractionRef.send({ type: 'selectComponent', unitId, componentId: 'root' });
  modelInteractionRef.send({ type: 'focusComponent', unitId, componentId: 'root' });
}

/** What the project holds for a unit: its manifest, selection and focus. */
const heldFor = (project: ProjectActor, unitId: string) => {
  const unit = getModelInteractionUnitState(
    project.getSnapshot().context.modelInteractionRef.getSnapshot().context,
    unitId,
  );
  return {
    manifest: unit.manifest,
    selectedComponentIds: [...unit.selectedComponentIds],
    focusedComponentId: unit.focusedComponentId,
  };
};

const kept = { manifest, selectedComponentIds: ['root'], focusedComponentId: 'root' };
const released = { manifest: undefined, selectedComponentIds: [], focusedComponentId: undefined };

describe('project view manifest reconciliation (G11b)', () => {
  it('should clear the manifest of a unit when the last view presenting it closes', () => {
    const project = createProjectActor().start();
    try {
      presentInView(project, 'v1', 'unit:a');
      expect(heldFor(project, 'unit:a')).toEqual(kept);

      const listener = project.getSnapshot().context.viewPresentationListeners.get('v1')!;
      project.send({ type: 'destroyViewGraphics', viewId: 'v1' });
      expect(heldFor(project, 'unit:a')).toEqual(released);
      // The view's listener stops with it, so nothing keeps the stopped graphics actor alive.
      expect(listener.getSnapshot().status).toBe('stopped');
      expect(project.getSnapshot().context.viewPresentationListeners.has('v1')).toBe(false);
    } finally {
      project.stop();
    }
  });

  it('should keep the manifest of a unit while another view still presents it', () => {
    const project = createProjectActor().start();
    try {
      presentInView(project, 'v1', 'unit:a');
      presentInView(project, 'v2', 'unit:a');

      project.send({ type: 'destroyViewGraphics', viewId: 'v1' });
      expect(heldFor(project, 'unit:a')).toEqual(kept);
    } finally {
      project.stop();
    }
  });

  it('should clear the manifest once the view that presented it is cleared', () => {
    const project = createProjectActor().start();
    try {
      presentInView(project, 'v1', 'unit:a');
      const graphics = project.getSnapshot().context.viewGraphics.get('v1')!;

      graphics.send({ type: 'clearArtifact' });
      expect(heldFor(project, 'unit:a')).toEqual(released);
    } finally {
      project.stop();
    }
  });

  it('should clear the manifest of a unit once its only view commits another unit', () => {
    const project = createProjectActor().start();
    try {
      presentInView(project, 'v1', 'unit:a');
      const v1 = project.getSnapshot().context.viewGraphics.get('v1')!;
      v1.send({ type: 'updateArtifact', artifact: gltf(), hash: 'glb-unit:b' });
      const { requestedRevision } = v1.getSnapshot().context.gltfPresentation;
      v1.send({
        type: 'gltfPresentationCommitted',
        revision: requestedRevision,
        key: 'glb-unit:b',
        unitId: 'unit:b',
        manifest,
      });

      expect(heldFor(project, 'unit:a')).toEqual(released);
      expect(heldFor(project, 'unit:b').manifest).toBe(manifest);
    } finally {
      project.stop();
    }
  });

  it('should not count a view whose newer artifact is still preparing as presenting a new unit', () => {
    const project = createProjectActor().start();
    try {
      presentInView(project, 'v1', 'unit:a');
      presentInView(project, 'v2', 'unit:b');
      const v1 = project.getSnapshot().context.viewGraphics.get('v1')!;
      // The first view asks for unit:b, but unit:a stays on screen until that commit lands.
      v1.send({ type: 'updateArtifact', artifact: gltf(), hash: 'glb-unit:b' });

      project.send({ type: 'destroyViewGraphics', viewId: 'v2' });
      expect(heldFor(project, 'unit:a')).toEqual(kept);
      expect(heldFor(project, 'unit:b')).toEqual(released);
    } finally {
      project.stop();
    }
  });
  it('should not let a view showing a non-GLB artifact of the same file keep the manifest', () => {
    const project = createProjectActor().start();
    try {
      const unitId = deriveModelInteractionUnitId({ sourceFile: 'main.ts' });
      presentInView(project, 'v1', unitId);
      project.send({ type: 'createViewGraphics', viewId: 'v2' });
      const v2 = project.getSnapshot().context.viewGraphics.get('v2')!;
      v2.send({
        type: 'updateArtifact',
        artifact: { mimeType: 'image/svg+xml', content: '<svg/>' },
        hash: 'svg',
        sourceFile: 'main.ts',
      });
      // Both views name the unit, but only the GLB view presents its manifest.
      expect(v2.getSnapshot().context.modelInteractionUnitId).toBe(unitId);

      project.send({ type: 'destroyViewGraphics', viewId: 'v1' });
      expect(heldFor(project, unitId)).toEqual(released);
    } finally {
      project.stop();
    }
  });
  it('should keep the manifest of a unit whose view failed to present a replacement', () => {
    const project = createProjectActor().start();
    try {
      presentInView(project, 'v1', 'unit:a');
      const v1 = project.getSnapshot().context.viewGraphics.get('v1')!;
      v1.send({ type: 'updateArtifact', artifact: gltf(), hash: 'glb-unit:b' });
      const { requestedRevision } = v1.getSnapshot().context.gltfPresentation;
      v1.send({ type: 'gltfPresentationFailed', revision: requestedRevision, key: 'glb-unit:b' });

      expect(heldFor(project, 'unit:a')).toEqual(kept);
    } finally {
      project.stop();
    }
  });
});

describe('project component focus forwarding (G11b)', () => {
  const focusOf = (project: ProjectActor, viewId: string) =>
    project.getSnapshot().context.viewGraphics.get(viewId)!.getSnapshot().context.componentFocus;

  it('should forward a focus on the shared model interaction to every view, and to a view opened after it', () => {
    const project = createProjectActor().start();
    try {
      project.send({ type: 'createViewGraphics', viewId: 'v1' });
      project.send({ type: 'createViewGraphics', viewId: 'v2' });
      const { modelInteractionRef } = project.getSnapshot().context;
      modelInteractionRef.send({ type: 'loadManifest', unitId: 'unit:a', manifest, source: 'viewer' });
      modelInteractionRef.send({ type: 'focusComponent', unitId: 'unit:a', componentId: 'root' });
      expect(focusOf(project, 'v1')).toEqual({ 'unit:a': 'root' });
      expect(focusOf(project, 'v2')).toEqual({ 'unit:a': 'root' });

      project.send({ type: 'createViewGraphics', viewId: 'v3' });
      expect(focusOf(project, 'v3')).toEqual({ 'unit:a': 'root' });

      modelInteractionRef.send({ type: 'clearFocus', unitId: 'unit:a', source: 'viewer' });
      expect(focusOf(project, 'v1')).toEqual({});
      expect(focusOf(project, 'v3')).toEqual({});
    } finally {
      project.stop();
    }
  });

  it('should forward nothing for a model-interaction change that leaves the focus alone', () => {
    const project = createProjectActor().start();
    try {
      project.send({ type: 'createViewGraphics', viewId: 'v1' });
      const graphics = project.getSnapshot().context.viewGraphics.get('v1')!;
      const { modelInteractionRef } = project.getSnapshot().context;
      modelInteractionRef.send({ type: 'loadManifest', unitId: 'unit:a', manifest, source: 'viewer' });
      const before = graphics.getSnapshot();
      modelInteractionRef.send({
        type: 'selectComponent',
        unitId: 'unit:a',
        componentId: 'root',
      });
      expect(graphics.getSnapshot()).toBe(before);
    } finally {
      project.stop();
    }
  });
});
