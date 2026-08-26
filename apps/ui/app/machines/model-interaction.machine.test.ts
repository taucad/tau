import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { GeometryComponentManifest } from '@taucad/types';
import {
  createSourceModelInteractionUnitId,
  deriveModelInteractionUnitId,
  getModelInteractionUnitState,
  modelInteractionMachine,
  serializeModelComponentDisplayState,
} from '#machines/model-interaction.machine.js';

const capabilities = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb', 'stl'], available: true }],
} satisfies GeometryComponentManifest['capabilities'];
const mainSourceFile = 'src/main.ts';
const alternateSourceFile = 'src/alternate.ts';
const mainUnitId = createSourceModelInteractionUnitId(mainSourceFile);
const alternateUnitId = createSourceModelInteractionUnitId(alternateSourceFile);
const housingComponentId = 'component:housing';
const gearComponentId = 'component:gear';
const missingComponentId = 'component:missing';

function createManifest(sourceFile = mainSourceFile): GeometryComponentManifest {
  return {
    schemaVersion: 1,
    sourceFile,
    geometryHash: `${sourceFile}:hash`,
    rootId: 'root',
    nodeOrder: ['root', housingComponentId, gearComponentId],
    capabilities,
    nodesById: {
      root: {
        id: 'root',
        name: 'Model',
        kind: 'model',
        selector: 'root',
        childIds: [housingComponentId, gearComponentId],
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
      [gearComponentId]: {
        id: gearComponentId,
        name: 'gear',
        kind: 'part',
        selector: 'node/1',
        parentId: 'root',
        childIds: [],
        depth: 1,
        path: ['Model', 'gear'],
        meshNodeIndices: [1],
        primitiveIndices: [0],
        materialIndices: [1],
        capabilities,
      },
    },
  };
}

describe('modelInteractionMachine', () => {
  it('should derive stable unit ids from explicit ids, source files, and manifests', () => {
    expect(deriveModelInteractionUnitId({ unitId: 'unit:explicit', sourceFile: mainUnitId })).toBe('unit:explicit');
    expect(deriveModelInteractionUnitId({ sourceFile: mainSourceFile })).toBe(mainUnitId);
    expect(deriveModelInteractionUnitId({ manifest: createManifest(alternateSourceFile) })).toBe(alternateUnitId);
    expect(deriveModelInteractionUnitId({ geometryHash: 'hash-only' })).toBe('geometry:hash-only');
  });

  it('should load manifests into unit-local state', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();

    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest(), source: 'viewer' });

    const { context } = actor.getSnapshot();
    const unit = getModelInteractionUnitState(context, mainUnitId);
    expect(unit.manifest?.rootId).toBe('root');
    expect(unit.selectedComponentIds).toEqual([]);
    expect(context.unitOrder).toEqual([mainUnitId]);
    expect(context.lastInteractionSource).toBe('viewer');
    actor.stop();
  });

  it('should return a stable empty-state reference for absent units', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    const { context } = actor.getSnapshot();

    const firstAbsent = getModelInteractionUnitState(context, 'file:absent');
    const secondAbsent = getModelInteractionUnitState(context, 'file:absent');
    // Same reference ⇒ `useSelector`'s `Object.is` short-circuits re-renders.
    expect(firstAbsent).toBe(secondAbsent);
    expect(firstAbsent.selectedComponentIds).toEqual([]);

    // Present units still resolve to their real state.
    expect(getModelInteractionUnitState(context, mainUnitId).manifest?.rootId).toBe('root');
    actor.stop();
  });

  it('should support hover, selection, visibility, opacity, and focus actions per unit', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });

    actor.send({
      type: 'setHoveredComponent',
      unitId: mainUnitId,
      componentId: housingComponentId,
      source: 'explorer',
    });
    actor.send({
      type: 'toggleComponentSelection',
      unitId: mainUnitId,
      componentId: housingComponentId,
      source: 'explorer',
    });
    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: gearComponentId, source: 'explorer' });
    actor.send({
      type: 'setComponentOpacity',
      unitId: mainUnitId,
      componentId: housingComponentId,
      opacity: 0.25,
      source: 'explorer',
    });
    actor.send({ type: 'focusComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'explorer' });

    const unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.hoveredComponentId).toBe(housingComponentId);
    expect(unit.selectedComponentIds).toEqual([housingComponentId]);
    expect(unit.hiddenComponentIds).toEqual([gearComponentId]);
    expect(unit.opacityByComponentId).toEqual({ [housingComponentId]: 0.25 });
    expect(unit.focusedComponentId).toBe(housingComponentId);
    actor.stop();
  });

  it('should keep selection/highlight separate from explicit focus', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });

    actor.send({
      type: 'toggleComponentSelection',
      unitId: mainUnitId,
      componentId: housingComponentId,
      source: 'viewer',
    });

    let unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.selectedComponentIds).toEqual([housingComponentId]);
    expect(unit.focusedComponentId).toBeUndefined();

    actor.send({ type: 'focusComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'explorer' });

    unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.selectedComponentIds).toEqual([housingComponentId]);
    expect(unit.focusedComponentId).toBe(housingComponentId);
    actor.stop();
  });

  it('should toggle selected components off without clearing explicit focus', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    actor.send({ type: 'focusComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'viewer' });

    actor.send({
      type: 'toggleComponentSelection',
      unitId: mainUnitId,
      componentId: housingComponentId,
      source: 'viewer',
    });

    const unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.selectedComponentIds).toEqual([]);
    expect(unit.focusedComponentId).toBe(housingComponentId);
    expect(actor.getSnapshot().context.lastInteractionSource).toBe('viewer');
    actor.stop();
  });

  it('should select a component idempotently without setting explicit focus', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });

    actor.send({ type: 'selectComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'viewer' });
    const afterSelect = actor.getSnapshot().context;
    let unit = getModelInteractionUnitState(afterSelect, mainUnitId);
    expect(unit.selectedComponentIds).toEqual([housingComponentId]);
    expect(unit.focusedComponentId).toBeUndefined();
    expect(afterSelect.displayRevision).toBe(0);

    actor.send({ type: 'selectComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'viewer' });
    expect(actor.getSnapshot().context.revision).toBe(afterSelect.revision);

    actor.send({ type: 'selectComponent', unitId: mainUnitId, componentId: gearComponentId, source: 'explorer' });
    unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.selectedComponentIds).toEqual([gearComponentId]);
    expect(unit.focusedComponentId).toBeUndefined();
    actor.stop();
  });

  it('should keep duplicate component ids isolated between compilation units', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest(mainSourceFile) });
    actor.send({ type: 'loadManifest', unitId: alternateUnitId, manifest: createManifest(alternateSourceFile) });
    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: gearComponentId });
    actor.send({ type: 'isolateComponent', unitId: alternateUnitId, componentId: housingComponentId });

    const { context } = actor.getSnapshot();
    expect(getModelInteractionUnitState(context, mainUnitId).hiddenComponentIds).toEqual([gearComponentId]);
    expect(getModelInteractionUnitState(context, mainUnitId).isolatedComponentIds).toEqual([]);
    expect(getModelInteractionUnitState(context, alternateUnitId).hiddenComponentIds).toEqual([]);
    expect(getModelInteractionUnitState(context, alternateUnitId).isolatedComponentIds).toEqual([housingComponentId]);
    expect(context.unitOrder).toEqual([mainUnitId, alternateUnitId]);
    actor.stop();
  });

  it('should preserve explicitly hidden components when isolating another component', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: gearComponentId, source: 'explorer' });
    actor.send({ type: 'isolateComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'explorer' });

    const unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.hiddenComponentIds).toEqual([gearComponentId]);
    expect(unit.isolatedComponentIds).toEqual([housingComponentId]);
    actor.stop();
  });

  it('should keep hide and isolate state independent when hiding an isolated component', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    actor.send({ type: 'isolateComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'explorer' });
    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'explorer' });

    const unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.hiddenComponentIds).toEqual([housingComponentId]);
    expect(unit.isolatedComponentIds).toEqual([housingComponentId]);
    actor.stop();
  });

  it('should show a component without clearing active isolation', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: gearComponentId, source: 'explorer' });
    actor.send({ type: 'isolateComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'explorer' });
    actor.send({ type: 'showComponent', unitId: mainUnitId, componentId: gearComponentId, source: 'explorer' });

    const unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.hiddenComponentIds).toEqual([]);
    expect(unit.isolatedComponentIds).toEqual([housingComponentId]);
    actor.stop();
  });

  it('should show hidden components without clearing isolation focus or opacity', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: gearComponentId, source: 'explorer' });
    actor.send({ type: 'isolateComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'explorer' });
    actor.send({ type: 'focusComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'explorer' });
    actor.send({
      type: 'setComponentOpacity',
      unitId: mainUnitId,
      componentId: housingComponentId,
      opacity: 0.5,
      source: 'explorer',
    });
    actor.send({ type: 'showHiddenComponents', unitId: mainUnitId, source: 'explorer' });

    const unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.hiddenComponentIds).toEqual([]);
    expect(unit.isolatedComponentIds).toEqual([housingComponentId]);
    expect(unit.focusedComponentId).toBe(housingComponentId);
    expect(unit.opacityByComponentId).toEqual({ [housingComponentId]: 0.5 });
    actor.stop();
  });

  it('should clear only isolation when the isolate target is toggled off', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: gearComponentId });
    actor.send({ type: 'focusComponent', unitId: mainUnitId, componentId: housingComponentId });
    actor.send({ type: 'isolateComponent', unitId: mainUnitId, componentId: housingComponentId });
    actor.send({ type: 'clearIsolation', unitId: mainUnitId, source: 'explorer' });

    const unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.isolatedComponentIds).toEqual([]);
    expect(unit.hiddenComponentIds).toEqual([gearComponentId]);
    expect(unit.focusedComponentId).toBe(housingComponentId);
    expect(actor.getSnapshot().context.lastInteractionSource).toBe('explorer');
    actor.stop();
  });

  it('should clear focus and selection when the viewer clears an empty-space click', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    actor.send({ type: 'focusComponent', unitId: mainUnitId, componentId: housingComponentId, source: 'explorer' });
    actor.send({ type: 'clearFocus', unitId: mainUnitId, source: 'viewer' });
    actor.send({ type: 'clearSelection', unitId: mainUnitId, source: 'viewer' });

    const unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.focusedComponentId).toBeUndefined();
    expect(unit.selectedComponentIds).toEqual([]);
    expect(actor.getSnapshot().context.lastInteractionSource).toBe('viewer');
    actor.stop();
  });

  it('should clear a manifest without clearing compatible display preferences for that unit', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest(mainSourceFile) });
    actor.send({ type: 'loadManifest', unitId: alternateUnitId, manifest: createManifest(alternateSourceFile) });
    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: gearComponentId });
    actor.send({ type: 'setHoveredComponent', unitId: mainUnitId, componentId: housingComponentId });
    actor.send({ type: 'clearManifest', unitId: mainUnitId, source: 'viewer' });

    const { context } = actor.getSnapshot();
    const mainUnit = getModelInteractionUnitState(context, mainUnitId);
    expect(mainUnit.manifest).toBeUndefined();
    expect(mainUnit.hoveredComponentId).toBeUndefined();
    expect(mainUnit.hiddenComponentIds).toEqual([gearComponentId]);
    expect(getModelInteractionUnitState(context, alternateUnitId).manifest?.sourceFile).toBe(alternateSourceFile);
    actor.stop();
  });

  it('should hydrate display state before manifests load and reconcile missing ids after load', () => {
    const actor = createActor(modelInteractionMachine, {
      input: {
        componentDisplay: {
          schemaVersion: 1,
          unitsById: {
            [mainUnitId]: {
              hiddenComponentIds: [gearComponentId, missingComponentId],
              isolatedComponentIds: [housingComponentId, missingComponentId],
              opacityByComponentId: {
                [housingComponentId]: 0.4,
                [missingComponentId]: 0.25,
              },
            },
          },
        },
      },
    });
    actor.start();

    let unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.hiddenComponentIds).toEqual([gearComponentId, missingComponentId]);
    expect(unit.isolatedComponentIds).toEqual([housingComponentId, missingComponentId]);

    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });

    unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.hiddenComponentIds).toEqual([gearComponentId]);
    expect(unit.isolatedComponentIds).toEqual([housingComponentId]);
    expect(unit.opacityByComponentId).toEqual({ [housingComponentId]: 0.4 });
    actor.stop();
  });

  it('should increment displayRevision only for persisted display changes', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    const afterManifest = actor.getSnapshot().context.displayRevision;

    actor.send({ type: 'setHoveredComponent', unitId: mainUnitId, componentId: housingComponentId });
    actor.send({ type: 'toggleComponentSelection', unitId: mainUnitId, componentId: housingComponentId });
    actor.send({ type: 'toggleComponentSelection', unitId: mainUnitId, componentId: housingComponentId });
    actor.send({ type: 'selectComponent', unitId: mainUnitId, componentId: housingComponentId });
    actor.send({ type: 'focusComponent', unitId: mainUnitId, componentId: housingComponentId });
    actor.send({ type: 'setHoveredComponent', unitId: mainUnitId, componentId: gearComponentId, source: 'viewer' });
    expect(actor.getSnapshot().context.displayRevision).toBe(afterManifest);

    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: gearComponentId });
    expect(actor.getSnapshot().context.displayRevision).toBe(afterManifest + 1);

    actor.send({ type: 'setComponentOpacity', unitId: mainUnitId, componentId: housingComponentId, opacity: 0.5 });
    expect(actor.getSnapshot().context.displayRevision).toBe(afterManifest + 2);
    actor.stop();
  });

  it('should no-op when the same source manifest hash is loaded again', () => {
    const actor = createActor(modelInteractionMachine, { input: {} }).start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    const firstContext = actor.getSnapshot().context;
    const firstUnit = getModelInteractionUnitState(firstContext, mainUnitId);

    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: { ...createManifest() } });

    expect(actor.getSnapshot().context.revision).toBe(firstContext.revision);
    expect(getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId)).toBe(firstUnit);
    actor.stop();
  });

  it('should reset every opacity override in one unit atomically', () => {
    const actor = createActor(modelInteractionMachine, { input: {} }).start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    actor.send({ type: 'loadManifest', unitId: alternateUnitId, manifest: createManifest(alternateSourceFile) });
    actor.send({ type: 'setComponentOpacity', unitId: mainUnitId, componentId: housingComponentId, opacity: 0.5 });
    actor.send({ type: 'setComponentOpacity', unitId: mainUnitId, componentId: gearComponentId, opacity: 0.25 });
    actor.send({ type: 'setComponentOpacity', unitId: alternateUnitId, componentId: gearComponentId, opacity: 0.75 });
    const beforeReset = actor.getSnapshot().context.displayRevision;

    actor.send({ type: 'resetComponentOpacities', unitId: mainUnitId, source: 'viewer' });

    expect(getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId).opacityByComponentId).toEqual({});
    expect(getModelInteractionUnitState(actor.getSnapshot().context, alternateUnitId).opacityByComponentId).toEqual({
      [gearComponentId]: 0.75,
    });
    expect(actor.getSnapshot().context.displayRevision).toBe(beforeReset + 1);
    const afterReset = actor.getSnapshot().context;
    const afterResetUnit = getModelInteractionUnitState(afterReset, mainUnitId);
    actor.send({ type: 'resetComponentOpacities', unitId: mainUnitId, source: 'viewer' });
    expect(actor.getSnapshot().context.revision).toBe(afterReset.revision);
    expect(getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId)).toBe(afterResetUnit);
    actor.stop();
  });

  it('should restore, rekey, and prune project-scoped display units', () => {
    const actor = createActor(modelInteractionMachine, { input: {} }).start();
    actor.send({
      type: 'restoreComponentDisplay',
      componentDisplay: {
        schemaVersion: 1,
        unitsById: { [mainUnitId]: { hiddenComponentIds: [gearComponentId] } },
      },
    });
    expect(getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId).hiddenComponentIds).toEqual([
      gearComponentId,
    ]);

    actor.send({ type: 'rekeySourceUnits', oldPath: 'src', newPath: 'lib' });
    const movedUnitId = createSourceModelInteractionUnitId('lib/main.ts');
    expect(getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId).hiddenComponentIds).toEqual([]);
    expect(getModelInteractionUnitState(actor.getSnapshot().context, movedUnitId).hiddenComponentIds).toEqual([
      gearComponentId,
    ]);

    actor.send({ type: 'pruneSourceUnits', path: 'lib' });
    expect(actor.getSnapshot().context.unitOrder).toEqual([]);
    actor.stop();
  });

  it('should serialize only non-default display state by unit id', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: gearComponentId });
    actor.send({ type: 'setComponentOpacity', unitId: mainUnitId, componentId: housingComponentId, opacity: 0.5 });

    expect(serializeModelComponentDisplayState(actor.getSnapshot().context)).toEqual({
      schemaVersion: 1,
      unitsById: {
        [mainUnitId]: {
          hiddenComponentIds: [gearComponentId],
          opacityByComponentId: { [housingComponentId]: 0.5 },
        },
      },
    });

    actor.send({ type: 'showComponent', unitId: mainUnitId, componentId: gearComponentId });
    actor.send({ type: 'setComponentOpacity', unitId: mainUnitId, componentId: housingComponentId, opacity: 1 });
    expect(serializeModelComponentDisplayState(actor.getSnapshot().context)).toBeUndefined();
    actor.stop();
  });

  it('should ignore unknown component ids for the addressed unit', () => {
    const actor = createActor(modelInteractionMachine, { input: {} });
    actor.start();
    actor.send({ type: 'loadManifest', unitId: mainUnitId, manifest: createManifest() });
    actor.send({ type: 'toggleComponentSelection', unitId: mainUnitId, componentId: missingComponentId });
    actor.send({ type: 'selectComponent', unitId: mainUnitId, componentId: missingComponentId });
    actor.send({ type: 'hideComponent', unitId: mainUnitId, componentId: missingComponentId });

    const unit = getModelInteractionUnitState(actor.getSnapshot().context, mainUnitId);
    expect(unit.selectedComponentIds).toEqual([]);
    expect(unit.hiddenComponentIds).toEqual([]);
    actor.stop();
  });
});
