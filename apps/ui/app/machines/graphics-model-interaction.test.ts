import { describe, expect, it } from 'vitest';
import { createActor, fromPromise } from 'xstate';
import type { GeometryComponentManifest } from '@taucad/types';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { ActorRefFrom } from 'xstate';

const capabilities = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
} satisfies GeometryComponentManifest['capabilities'];
const housingComponentId = 'component:housing';
const positionAttributeName = 'POSITION';
const unitId = 'src/main.ts';

function encodeJson(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(value));
}

function createManifest(sourceFile = unitId): GeometryComponentManifest {
  return {
    schemaVersion: 1,
    sourceFile,
    rootId: 'root',
    nodeOrder: ['root', housingComponentId],
    nodesById: {
      root: {
        id: 'root',
        name: 'Model',
        kind: 'model',
        selector: 'root',
        childIds: [housingComponentId],
        depth: 0,
        path: ['Model'],
        meshNodeIndices: [],
        primitiveIndices: [],
        materialIndices: [],
        capabilities,
      },
      [housingComponentId]: {
        id: housingComponentId,
        name: 'housing',
        kind: 'part',
        selector: 'node/0',
        parentId: 'root',
        childIds: [],
        depth: 1,
        path: ['Model', 'housing'],
        meshNodeIndices: [0],
        primitiveIndices: [0],
        materialIndices: [0],
        capabilities,
      },
    },
    capabilities,
  };
}

describe('graphicsMachine model interaction child', () => {
  it('should forward model interaction events without storing Three objects in graphics context', () => {
    const providedMachine = graphicsMachine.provide({
      actors: {
        probeWebGpu: fromPromise(async () => false),
      },
    });
    const actor = createActor(providedMachine, { input: {} });
    actor.start();

    actor.send({ type: 'loadModelComponentManifest', unitId, manifest: createManifest(), source: 'viewer' });

    const modelRef = actor.getSnapshot().children['modelInteraction'] as ActorRefFrom<typeof modelInteractionMachine>;
    actor.send({ type: 'toggleModelComponentSelection', unitId, componentId: housingComponentId, source: 'viewer' });
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).selectedComponentIds).toEqual([
      housingComponentId,
    ]);
    actor.send({ type: 'toggleModelComponentSelection', unitId, componentId: housingComponentId, source: 'viewer' });
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).selectedComponentIds).toEqual([]);

    actor.send({ type: 'focusModelComponent', unitId, componentId: 'component:housing', source: 'explorer' });
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).focusedComponentId).toBe(
      'component:housing',
    );
    actor.send({ type: 'isolateModelComponent', unitId, componentId: 'component:housing', source: 'explorer' });
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).isolatedComponentIds).toEqual([
      'component:housing',
    ]);
    actor.send({ type: 'hideModelComponent', unitId, componentId: housingComponentId, source: 'explorer' });
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).hiddenComponentIds).toEqual([
      housingComponentId,
    ]);
    actor.send({ type: 'showHiddenModelComponents', unitId, source: 'explorer' });
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).hiddenComponentIds).toEqual([]);
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).isolatedComponentIds).toEqual([
      housingComponentId,
    ]);
    actor.send({ type: 'clearModelComponentIsolation', unitId, source: 'viewer' });
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).isolatedComponentIds).toEqual([]);
    actor.send({ type: 'clearModelComponentFocus', unitId, source: 'viewer' });
    actor.send({ type: 'clearModelComponentSelection', unitId, source: 'viewer' });
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).focusedComponentId).toBeUndefined();
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).selectedComponentIds).toEqual([]);
    expect(actor.getSnapshot().context).not.toHaveProperty('scene');
    expect(actor.getSnapshot().context).not.toHaveProperty('object3D');
    actor.stop();
  });

  it('should forward duplicate component ids into separate model units', () => {
    const providedMachine = graphicsMachine.provide({
      actors: {
        probeWebGpu: fromPromise(async () => false),
      },
    });
    const actor = createActor(providedMachine, { input: {} });
    actor.start();

    actor.send({ type: 'loadModelComponentManifest', unitId, manifest: createManifest(unitId), source: 'viewer' });
    actor.send({
      type: 'loadModelComponentManifest',
      unitId: 'src/secondary.ts',
      manifest: createManifest('src/secondary.ts'),
      source: 'viewer',
    });
    actor.send({ type: 'hideModelComponent', unitId, componentId: housingComponentId, source: 'explorer' });
    actor.send({
      type: 'isolateModelComponent',
      unitId: 'src/secondary.ts',
      componentId: housingComponentId,
      source: 'explorer',
    });

    const modelRef = actor.getSnapshot().children['modelInteraction'] as ActorRefFrom<typeof modelInteractionMachine>;
    const { context } = modelRef.getSnapshot();
    expect(getModelInteractionUnitState(context, unitId).hiddenComponentIds).toEqual([housingComponentId]);
    expect(getModelInteractionUnitState(context, unitId).isolatedComponentIds).toEqual([]);
    expect(getModelInteractionUnitState(context, 'src/secondary.ts').hiddenComponentIds).toEqual([]);
    expect(getModelInteractionUnitState(context, 'src/secondary.ts').isolatedComponentIds).toEqual([
      housingComponentId,
    ]);
    actor.stop();
  });

  it('should hydrate component display input into the model interaction child', () => {
    const providedMachine = graphicsMachine.provide({
      actors: {
        probeWebGpu: fromPromise(async () => false),
      },
    });
    const sourceUnitId = deriveModelInteractionUnitId({ sourceFile: 'src/main.ts' });
    const actor = createActor(providedMachine, {
      input: {
        componentDisplay: {
          schemaVersion: 1,
          unitsById: {
            [sourceUnitId]: { hiddenComponentIds: [housingComponentId] },
          },
        },
      },
    });
    actor.start();

    const modelRef = actor.getSnapshot().children['modelInteraction'] as ActorRefFrom<typeof modelInteractionMachine>;
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, sourceUnitId).hiddenComponentIds).toEqual([
      housingComponentId,
    ]);
    actor.stop();
  });

  it('should eagerly extract GLTF component manifests from updateGeometry', () => {
    const providedMachine = graphicsMachine.provide({
      actors: {
        probeWebGpu: fromPromise(async () => false),
      },
    });
    const actor = createActor(providedMachine, { input: {} });
    actor.start();

    actor.send({
      type: 'updateGeometry',
      units: { length: 'mm' },
      sourceFile: 'src/main.ts',
      geometry: {
        format: 'gltf',
        hash: 'geometry-hash',
        content: encodeJson({
          nodes: [{ name: 'Housing', mesh: 0, extras: { tauComponentId: housingComponentId } }],
          meshes: [{ primitives: [{ attributes: { [positionAttributeName]: 0 }, material: 0 }] }],
          accessors: [{ componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }],
          materials: [{ name: 'gray' }],
        }),
      },
    });

    const sourceUnitId = deriveModelInteractionUnitId({ sourceFile: 'src/main.ts' });
    const modelRef = actor.getSnapshot().children['modelInteraction'] as ActorRefFrom<typeof modelInteractionMachine>;
    const unit = getModelInteractionUnitState(modelRef.getSnapshot().context, sourceUnitId);
    expect(unit.manifest?.sourceFile).toBe('src/main.ts');
    expect(unit.manifest?.nodesById[housingComponentId]?.name).toBe('Housing');
    actor.stop();
  });

  it('should preserve hover on camera control start and suppress hover only after camera movement', () => {
    const providedMachine = graphicsMachine.provide({
      actors: {
        probeWebGpu: fromPromise(async () => false),
      },
    });
    const actor = createActor(providedMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadModelComponentManifest', unitId, manifest: createManifest(), source: 'viewer' });
    actor.send({ type: 'setHoveredModelComponent', unitId, componentId: housingComponentId, source: 'viewer' });

    const modelRef = actor.getSnapshot().children['modelInteraction'] as ActorRefFrom<typeof modelInteractionMachine>;
    actor.send({ type: 'controlsInteractionStart' });

    expect(actor.getSnapshot().context.cameraInteracting).toBe(true);
    expect(actor.getSnapshot().context.cameraInteractionHadMovement).toBe(false);
    expect(actor.getSnapshot().context.suppressNextModelPointerClick).toBe(false);
    expect(modelRef.getSnapshot().context.isViewerHoverSuppressed).toBe(false);
    expect(modelRef.getSnapshot().context.viewerHoverSuppressionReasons).toEqual([]);
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).hoveredComponentId).toBe(
      housingComponentId,
    );

    actor.send({ type: 'setHoveredModelComponent', unitId, componentId: housingComponentId, source: 'viewer' });
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).hoveredComponentId).toBe(
      housingComponentId,
    );

    actor.send({ type: 'controlsInteractionMoved' });
    expect(actor.getSnapshot().context.cameraInteractionHadMovement).toBe(true);
    expect(actor.getSnapshot().context.suppressNextModelPointerClick).toBe(true);
    expect(modelRef.getSnapshot().context.isViewerHoverSuppressed).toBe(true);
    expect(modelRef.getSnapshot().context.viewerHoverSuppressionReasons).toEqual(['cameraControls']);
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).hoveredComponentId).toBeUndefined();

    actor.send({ type: 'controlsInteractionEnd', zoom: 2 });
    expect(actor.getSnapshot().context.currentZoom).toBe(2);
    expect(actor.getSnapshot().context.cameraInteracting).toBe(false);
    expect(actor.getSnapshot().context.cameraInteractionHadMovement).toBe(false);
    expect(actor.getSnapshot().context.suppressNextModelPointerClick).toBe(true);
    expect(modelRef.getSnapshot().context.isViewerHoverSuppressed).toBe(false);

    actor.send({ type: 'clearModelPointerClickGuard' });
    expect(actor.getSnapshot().context.suppressNextModelPointerClick).toBe(false);
    actor.stop();
  });

  it('should not guard model clicks when camera controls start and end without movement', () => {
    const providedMachine = graphicsMachine.provide({
      actors: {
        probeWebGpu: fromPromise(async () => false),
      },
    });
    const actor = createActor(providedMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadModelComponentManifest', unitId, manifest: createManifest(), source: 'viewer' });
    actor.send({ type: 'setHoveredModelComponent', unitId, componentId: housingComponentId, source: 'viewer' });
    const modelRef = actor.getSnapshot().children['modelInteraction'] as ActorRefFrom<typeof modelInteractionMachine>;

    actor.send({ type: 'controlsInteractionMoved' });
    expect(actor.getSnapshot().context.suppressNextModelPointerClick).toBe(false);

    actor.send({ type: 'controlsInteractionStart' });
    expect(modelRef.getSnapshot().context.isViewerHoverSuppressed).toBe(false);
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).hoveredComponentId).toBe(
      housingComponentId,
    );
    actor.send({ type: 'controlsInteractionEnd', zoom: 1.5 });

    expect(actor.getSnapshot().context.cameraInteracting).toBe(false);
    expect(actor.getSnapshot().context.suppressNextModelPointerClick).toBe(false);
    expect(actor.getSnapshot().context.currentZoom).toBe(1.5);
    expect(modelRef.getSnapshot().context.isViewerHoverSuppressed).toBe(false);
    expect(getModelInteractionUnitState(modelRef.getSnapshot().context, unitId).hoveredComponentId).toBe(
      housingComponentId,
    );
    actor.stop();
  });

  it('should forward generic hover suppression and model pointer guard events', () => {
    const providedMachine = graphicsMachine.provide({
      actors: {
        probeWebGpu: fromPromise(async () => false),
      },
    });
    const actor = createActor(providedMachine, { input: {} });
    actor.start();

    const modelRef = actor.getSnapshot().children['modelInteraction'] as ActorRefFrom<typeof modelInteractionMachine>;
    actor.send({
      type: 'beginViewerModelHoverSuppression',
      reason: 'sectionViewTransform',
      source: 'viewer',
    });
    expect(modelRef.getSnapshot().context.viewerHoverSuppressionReasons).toEqual(['sectionViewTransform']);

    actor.send({ type: 'markModelPointerGestureMoved' });
    expect(actor.getSnapshot().context.suppressNextModelPointerClick).toBe(true);

    actor.send({
      type: 'endViewerModelHoverSuppression',
      reason: 'sectionViewTransform',
      source: 'viewer',
    });
    expect(modelRef.getSnapshot().context.viewerHoverSuppressionReasons).toEqual([]);

    actor.send({ type: 'clearModelPointerClickGuard' });
    expect(actor.getSnapshot().context.suppressNextModelPointerClick).toBe(false);
    actor.stop();
  });

  it('should suppress viewer hover for the full measure mode lifetime', () => {
    const providedMachine = graphicsMachine.provide({
      actors: {
        probeWebGpu: fromPromise(async () => false),
      },
    });
    const actor = createActor(providedMachine, { input: {} });
    actor.start();

    const modelRef = actor.getSnapshot().children['modelInteraction'] as ActorRefFrom<typeof modelInteractionMachine>;
    actor.send({ type: 'setMeasureActive', payload: true });
    expect(actor.getSnapshot().context.isMeasureActive).toBe(true);
    expect(actor.getSnapshot().context.modelPointerClickSuppressionReasons).toEqual(['measureTool']);
    expect(modelRef.getSnapshot().context.viewerHoverSuppressionReasons).toEqual(['measureTool']);

    actor.send({ type: 'setMeasureActive', payload: false });
    expect(actor.getSnapshot().context.isMeasureActive).toBe(false);
    expect(actor.getSnapshot().context.modelPointerClickSuppressionReasons).toEqual([]);
    expect(modelRef.getSnapshot().context.viewerHoverSuppressionReasons).toEqual([]);
    actor.stop();
  });
});
