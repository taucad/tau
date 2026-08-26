import { assign, assertEvent, setup } from 'xstate';
import type { GeometryComponentManifest } from '@taucad/types';
import type {
  PersistedModelComponentDisplayState,
  PersistedModelComponentDisplayUnitState,
} from '#constants/editor.constants.js';
import { omitEmptyComponentDisplayState } from '#constants/editor.constants.js';

export type ModelInteractionSource = 'viewer' | 'explorer' | 'chat' | 'screenshot' | 'unknown';
export type ViewerHoverSuppressionReason =
  | 'cameraControls'
  | 'sectionViewTransform'
  | 'measureTool'
  | 'viewportGizmo'
  | 'toolOverlay';

export type ModelInteractionUnitState = {
  readonly manifest?: GeometryComponentManifest;
  readonly hoveredComponentId?: string;
  readonly selectedComponentIds: readonly string[];
  readonly focusedComponentId?: string;
  readonly hiddenComponentIds: readonly string[];
  readonly isolatedComponentIds: readonly string[];
  readonly opacityByComponentId: Readonly<Record<string, number>>;
};

export type ModelInteractionContext = {
  unitsById: Record<string, ModelInteractionUnitState>;
  unitOrder: string[];
  revision: number;
  displayRevision: number;
  lastInteractionSource: ModelInteractionSource;
};

export type ModelInteractionInput = {
  componentDisplay?: PersistedModelComponentDisplayState;
};

export type ModelInteractionEvent =
  | { type: 'loadManifest'; unitId: string; manifest: GeometryComponentManifest; source?: ModelInteractionSource }
  | { type: 'clearManifest'; unitId: string; source?: ModelInteractionSource }
  | { type: 'restoreComponentDisplay'; componentDisplay?: PersistedModelComponentDisplayState }
  | { type: 'rekeySourceUnits'; oldPath: string; newPath: string }
  | { type: 'pruneSourceUnits'; path: string }
  | { type: 'setHoveredComponent'; unitId: string; componentId: string | undefined; source?: ModelInteractionSource }
  | { type: 'toggleComponentSelection'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'selectComponent'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'clearSelection'; unitId: string; source?: ModelInteractionSource }
  | { type: 'hideComponent'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'showComponent'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'showHiddenComponents'; unitId: string; source?: ModelInteractionSource }
  | { type: 'isolateComponent'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'clearIsolation'; unitId: string; source?: ModelInteractionSource }
  | {
      type: 'setComponentOpacity';
      unitId: string;
      componentId: string;
      opacity: number;
      source?: ModelInteractionSource;
    }
  | { type: 'resetComponentOpacities'; unitId: string; source?: ModelInteractionSource }
  | { type: 'focusComponent'; unitId: string; componentId: string; source?: ModelInteractionSource }
  | { type: 'clearFocus'; unitId: string; source?: ModelInteractionSource };

const clampOpacity = (opacity: number): number => Math.min(1, Math.max(0, opacity));

const createEmptyUnitState = (): ModelInteractionUnitState => ({
  manifest: undefined,
  hoveredComponentId: undefined,
  selectedComponentIds: [],
  focusedComponentId: undefined,
  hiddenComponentIds: [],
  isolatedComponentIds: [],
  opacityByComponentId: {},
});

// Shared frozen singleton for absent units so `getModelInteractionUnitState`
// returns a stable reference — `useSelector`'s `Object.is` then short-circuits
// re-renders. Frozen (incl. nested empties) because every action spreads it
// into a fresh object and never mutates it in place.
const emptyUnitState: ModelInteractionUnitState = Object.freeze({
  ...createEmptyUnitState(),
  selectedComponentIds: Object.freeze([]),
  hiddenComponentIds: Object.freeze([]),
  isolatedComponentIds: Object.freeze([]),
  opacityByComponentId: Object.freeze({}),
});

const createUnitStateFromPersisted = (
  unit: PersistedModelComponentDisplayUnitState | undefined,
): ModelInteractionUnitState => ({
  ...createEmptyUnitState(),
  hiddenComponentIds: [...(unit?.hiddenComponentIds ?? [])],
  isolatedComponentIds: [...(unit?.isolatedComponentIds ?? [])],
  opacityByComponentId: { ...unit?.opacityByComponentId },
});

function hydrateUnitsFromComponentDisplay(
  componentDisplay: PersistedModelComponentDisplayState | undefined,
): Pick<ModelInteractionContext, 'unitsById' | 'unitOrder'> {
  if (!componentDisplay) {
    return { unitsById: {}, unitOrder: [] };
  }

  const entries = Object.entries(componentDisplay.unitsById);
  return {
    unitsById: Object.fromEntries(entries.map(([unitId, unit]) => [unitId, createUnitStateFromPersisted(unit)])),
    unitOrder: entries.map(([unitId]) => unitId),
  };
}

export function createSourceModelInteractionUnitId(sourceFile: string): string {
  return `file:${sourceFile}`;
}

function createGeometryModelInteractionUnitId(geometryHash: string): string {
  return `geometry:${geometryHash}`;
}

export function deriveModelInteractionUnitId({
  unitId,
  sourceFile,
  geometryHash,
  manifest,
}: {
  readonly unitId?: string;
  readonly sourceFile?: string;
  readonly geometryHash?: string;
  readonly manifest?: GeometryComponentManifest;
}): string {
  if (unitId) {
    return unitId;
  }

  const resolvedSourceFile = sourceFile ?? manifest?.sourceFile;
  if (resolvedSourceFile) {
    return createSourceModelInteractionUnitId(resolvedSourceFile);
  }

  const resolvedGeometryHash = geometryHash ?? manifest?.geometryHash;
  if (resolvedGeometryHash) {
    return createGeometryModelInteractionUnitId(resolvedGeometryHash);
  }

  return 'anonymous-model';
}

export function getModelInteractionUnitState(
  context: ModelInteractionContext,
  unitId: string,
): ModelInteractionUnitState {
  return context.unitsById[unitId] ?? emptyUnitState;
}

function hasComponent(unit: ModelInteractionUnitState, componentId: string | undefined): componentId is string {
  if (!componentId) {
    return false;
  }
  return Boolean(unit.manifest?.nodesById[componentId]);
}

const withRevision = ({
  context,
  source,
  displayChanged = false,
}: {
  readonly context: ModelInteractionContext;
  readonly source?: ModelInteractionSource;
  readonly displayChanged?: boolean;
}) => ({
  revision: context.revision + 1,
  displayRevision: displayChanged ? context.displayRevision + 1 : context.displayRevision,
  lastInteractionSource: source ?? 'unknown',
});

const pruneIdsForManifest = (manifest: GeometryComponentManifest, ids: readonly string[]): string[] =>
  ids.filter((id) => Boolean(manifest.nodesById[id]));

const pruneOpacityForManifest = (
  manifest: GeometryComponentManifest,
  opacityByComponentId: Readonly<Record<string, number>>,
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(opacityByComponentId).filter(([componentId]) => Boolean(manifest.nodesById[componentId])),
  );

const reconcileUnitForManifest = (
  unit: ModelInteractionUnitState,
  manifest: GeometryComponentManifest,
): ModelInteractionUnitState => ({
  manifest,
  hoveredComponentId: undefined,
  selectedComponentIds: pruneIdsForManifest(manifest, unit.selectedComponentIds),
  focusedComponentId:
    unit.focusedComponentId && manifest.nodesById[unit.focusedComponentId] ? unit.focusedComponentId : undefined,
  hiddenComponentIds: pruneIdsForManifest(manifest, unit.hiddenComponentIds),
  isolatedComponentIds: pruneIdsForManifest(manifest, unit.isolatedComponentIds),
  opacityByComponentId: pruneOpacityForManifest(manifest, unit.opacityByComponentId),
});

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function recordsEqual(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  const entriesA = Object.entries(a);
  const entriesB = Object.entries(b);
  return entriesA.length === entriesB.length && entriesA.every(([key, value]) => b[key] === value);
}

function omitRecordKey<Value>(record: Readonly<Record<string, Value>>, key: string): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));
}

function displayStateEqual(previous: ModelInteractionUnitState, next: ModelInteractionUnitState): boolean {
  return (
    arraysEqual(previous.hiddenComponentIds, next.hiddenComponentIds) &&
    arraysEqual(previous.isolatedComponentIds, next.isolatedComponentIds) &&
    recordsEqual(previous.opacityByComponentId, next.opacityByComponentId)
  );
}

function serializeUnitDisplayState(
  unit: ModelInteractionUnitState,
): PersistedModelComponentDisplayUnitState | undefined {
  const hiddenComponentIds = [...unit.hiddenComponentIds].sort();
  const isolatedComponentIds = [...unit.isolatedComponentIds].sort();
  const opacityEntries = Object.entries(unit.opacityByComponentId)
    .filter(([, opacity]) => opacity !== 1)
    .sort(([left], [right]) => left.localeCompare(right));

  const serialized: PersistedModelComponentDisplayUnitState = {
    ...(hiddenComponentIds.length > 0 ? { hiddenComponentIds } : {}),
    ...(isolatedComponentIds.length > 0 ? { isolatedComponentIds } : {}),
    ...(opacityEntries.length > 0 ? { opacityByComponentId: Object.fromEntries(opacityEntries) } : {}),
  };

  return Object.keys(serialized).length > 0 ? serialized : undefined;
}

export function serializeModelComponentDisplayState(
  context: ModelInteractionContext,
): PersistedModelComponentDisplayState | undefined {
  const unitsById = Object.fromEntries(
    context.unitOrder
      .map((unitId): [string, PersistedModelComponentDisplayUnitState] | undefined => {
        const unit = context.unitsById[unitId];
        if (!unit) {
          return undefined;
        }
        const serialized = serializeUnitDisplayState(unit);
        return serialized ? [unitId, serialized] : undefined;
      })
      .filter((entry): entry is [string, PersistedModelComponentDisplayUnitState] => entry !== undefined),
  );

  return omitEmptyComponentDisplayState({ schemaVersion: 1, unitsById });
}

function hasDisplayState(unit: ModelInteractionUnitState): boolean {
  return (
    unit.hiddenComponentIds.length > 0 ||
    unit.isolatedComponentIds.length > 0 ||
    Object.keys(unit.opacityByComponentId).length > 0
  );
}

function restoreUnitDisplayState(
  unit: ModelInteractionUnitState,
  persisted: PersistedModelComponentDisplayUnitState | undefined,
): ModelInteractionUnitState {
  const hiddenComponentIds = [...(persisted?.hiddenComponentIds ?? [])];
  const isolatedComponentIds = [...(persisted?.isolatedComponentIds ?? [])];
  const opacityByComponentId = { ...persisted?.opacityByComponentId };
  if (!unit.manifest) {
    return { ...unit, hiddenComponentIds, isolatedComponentIds, opacityByComponentId };
  }
  return {
    ...unit,
    hiddenComponentIds: pruneIdsForManifest(unit.manifest, hiddenComponentIds),
    isolatedComponentIds: pruneIdsForManifest(unit.manifest, isolatedComponentIds),
    opacityByComponentId: pruneOpacityForManifest(unit.manifest, opacityByComponentId),
  };
}

function mergeUnitStates(
  existing: ModelInteractionUnitState | undefined,
  moved: ModelInteractionUnitState,
): ModelInteractionUnitState {
  if (!existing) {
    return moved;
  }
  return {
    manifest: moved.manifest ?? existing.manifest,
    hoveredComponentId: moved.hoveredComponentId ?? existing.hoveredComponentId,
    selectedComponentIds: [...new Set([...existing.selectedComponentIds, ...moved.selectedComponentIds])],
    focusedComponentId: moved.focusedComponentId ?? existing.focusedComponentId,
    hiddenComponentIds: [...new Set([...existing.hiddenComponentIds, ...moved.hiddenComponentIds])],
    isolatedComponentIds: [...new Set([...existing.isolatedComponentIds, ...moved.isolatedComponentIds])],
    opacityByComponentId: { ...existing.opacityByComponentId, ...moved.opacityByComponentId },
  };
}

function rewriteSourceUnitId(unitId: string, oldPath: string, newPath: string): string {
  const oldPrefix = createSourceModelInteractionUnitId(oldPath);
  if (unitId === oldPrefix) {
    return createSourceModelInteractionUnitId(newPath);
  }
  return unitId.startsWith(`${oldPrefix}/`)
    ? createSourceModelInteractionUnitId(`${newPath}${unitId.slice(oldPrefix.length)}`)
    : unitId;
}

function matchesSourceUnitPath(unitId: string, path: string): boolean {
  const prefix = createSourceModelInteractionUnitId(path);
  return unitId === prefix || unitId.startsWith(`${prefix}/`);
}

function manifestsMatch(previous: GeometryComponentManifest | undefined, next: GeometryComponentManifest): boolean {
  return (
    previous === next ||
    (previous?.geometryHash !== undefined &&
      previous.geometryHash === next.geometryHash &&
      previous.sourceFile === next.sourceFile)
  );
}

function assignUnit({
  context,
  unitId,
  unit,
  source,
  displayChanged,
}: {
  readonly context: ModelInteractionContext;
  readonly unitId: string;
  readonly unit: ModelInteractionUnitState;
  readonly source?: ModelInteractionSource;
  readonly displayChanged?: boolean;
}): Partial<ModelInteractionContext> {
  return {
    unitsById: {
      ...context.unitsById,
      [unitId]: unit,
    },
    unitOrder: context.unitOrder.includes(unitId) ? context.unitOrder : [...context.unitOrder, unitId],
    ...withRevision({
      context,
      source,
      displayChanged: displayChanged ?? !displayStateEqual(getModelInteractionUnitState(context, unitId), unit),
    }),
  };
}

export const modelInteractionMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ModelInteractionContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ModelInteractionEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as ModelInteractionInput,
  },
  actions: {
    loadManifest: assign(({ context, event }) => {
      assertEvent(event, 'loadManifest');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (manifestsMatch(unit.manifest, event.manifest)) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: reconcileUnitForManifest(unit, event.manifest),
        source: event.source,
      });
    }),
    clearManifest: assign(({ context, event }) => {
      assertEvent(event, 'clearManifest');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (unit.manifest === undefined && unit.hoveredComponentId === undefined) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          manifest: undefined,
          hoveredComponentId: undefined,
        },
        source: event.source,
        displayChanged: false,
      });
    }),
    restoreComponentDisplay: assign(({ context, event }) => {
      assertEvent(event, 'restoreComponentDisplay');
      const persistedUnits = event.componentDisplay?.unitsById ?? {};
      const unitOrder = [...new Set([...context.unitOrder, ...Object.keys(persistedUnits)])];
      const unitsById = Object.fromEntries(
        unitOrder.map((unitId) => {
          const existing = context.unitsById[unitId] ?? createEmptyUnitState();
          return [unitId, restoreUnitDisplayState(existing, persistedUnits[unitId])];
        }),
      );
      const displayChanged = unitOrder.some((unitId) => {
        return !displayStateEqual(
          getModelInteractionUnitState(context, unitId),
          unitsById[unitId] ?? createEmptyUnitState(),
        );
      });
      if (!displayChanged && arraysEqual(context.unitOrder, unitOrder)) {
        return {};
      }
      return {
        unitsById,
        unitOrder,
        ...withRevision({ context, displayChanged }),
      };
    }),
    rekeySourceUnits: assign(({ context, event }) => {
      assertEvent(event, 'rekeySourceUnits');
      const movedEntries = context.unitOrder.map((unitId): readonly [string, string] => [
        rewriteSourceUnitId(unitId, event.oldPath, event.newPath),
        unitId,
      ]);
      if (movedEntries.every(([nextUnitId, unitId]) => nextUnitId === unitId)) {
        return {};
      }
      const unitsById: Record<string, ModelInteractionUnitState> = {};
      const unitOrder: string[] = [];
      let displayChanged = false;
      for (const [nextUnitId, unitId] of movedEntries) {
        const unit = context.unitsById[unitId];
        if (!unit) {
          continue;
        }
        unitsById[nextUnitId] = mergeUnitStates(unitsById[nextUnitId], unit);
        if (!unitOrder.includes(nextUnitId)) {
          unitOrder.push(nextUnitId);
        }
        displayChanged ||= nextUnitId !== unitId && hasDisplayState(unit);
      }
      return {
        unitsById,
        unitOrder,
        ...withRevision({ context, displayChanged }),
      };
    }),
    pruneSourceUnits: assign(({ context, event }) => {
      assertEvent(event, 'pruneSourceUnits');
      const removedIds = context.unitOrder.filter((unitId) => matchesSourceUnitPath(unitId, event.path));
      if (removedIds.length === 0) {
        return {};
      }
      const removed = new Set(removedIds);
      const unitsById = Object.fromEntries(
        Object.entries(context.unitsById).filter(([unitId]) => !removed.has(unitId)),
      );
      return {
        unitsById,
        unitOrder: context.unitOrder.filter((unitId) => !removed.has(unitId)),
        ...withRevision({
          context,
          displayChanged: removedIds.some((unitId) => hasDisplayState(context.unitsById[unitId] ?? emptyUnitState)),
        }),
      };
    }),
    setHoveredComponent: assign(({ context, event }) => {
      assertEvent(event, 'setHoveredComponent');
      const unit = getModelInteractionUnitState(context, event.unitId);
      const componentId = hasComponent(unit, event.componentId) ? event.componentId : undefined;
      if (componentId === unit.hoveredComponentId) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          hoveredComponentId: componentId,
        },
        source: event.source,
        displayChanged: false,
      });
    }),
    toggleComponentSelection: assign(({ context, event }) => {
      assertEvent(event, 'toggleComponentSelection');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (!hasComponent(unit, event.componentId)) {
        return {};
      }
      const selectedComponentIds = unit.selectedComponentIds.includes(event.componentId) ? [] : [event.componentId];
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          selectedComponentIds,
        },
        source: event.source,
        displayChanged: false,
      });
    }),
    selectComponent: assign(({ context, event }) => {
      assertEvent(event, 'selectComponent');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (!hasComponent(unit, event.componentId) || arraysEqual(unit.selectedComponentIds, [event.componentId])) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          selectedComponentIds: [event.componentId],
        },
        source: event.source,
        displayChanged: false,
      });
    }),
    clearSelection: assign(({ context, event }) => {
      assertEvent(event, 'clearSelection');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (unit.selectedComponentIds.length === 0) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          selectedComponentIds: [],
        },
        source: event.source,
        displayChanged: false,
      });
    }),
    hideComponent: assign(({ context, event }) => {
      assertEvent(event, 'hideComponent');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (!hasComponent(unit, event.componentId) || unit.hiddenComponentIds.includes(event.componentId)) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          hiddenComponentIds: [...unit.hiddenComponentIds, event.componentId],
        },
        source: event.source,
      });
    }),
    showComponent: assign(({ context, event }) => {
      assertEvent(event, 'showComponent');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (!unit.hiddenComponentIds.includes(event.componentId)) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          hiddenComponentIds: unit.hiddenComponentIds.filter((id) => id !== event.componentId),
        },
        source: event.source,
      });
    }),
    showHiddenComponents: assign(({ context, event }) => {
      assertEvent(event, 'showHiddenComponents');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (unit.hiddenComponentIds.length === 0) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          hiddenComponentIds: [],
        },
        source: event.source,
      });
    }),
    isolateComponent: assign(({ context, event }) => {
      assertEvent(event, 'isolateComponent');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (!hasComponent(unit, event.componentId)) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          isolatedComponentIds: [event.componentId],
        },
        source: event.source,
      });
    }),
    clearIsolation: assign(({ context, event }) => {
      assertEvent(event, 'clearIsolation');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (unit.isolatedComponentIds.length === 0) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          isolatedComponentIds: [],
        },
        source: event.source,
      });
    }),
    setComponentOpacity: assign(({ context, event }) => {
      assertEvent(event, 'setComponentOpacity');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (!hasComponent(unit, event.componentId)) {
        return {};
      }
      const opacity = clampOpacity(event.opacity);
      const opacityByComponentId =
        opacity === 1
          ? omitRecordKey(unit.opacityByComponentId, event.componentId)
          : { ...unit.opacityByComponentId, [event.componentId]: opacity };
      if (recordsEqual(unit.opacityByComponentId, opacityByComponentId)) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          opacityByComponentId,
        },
        source: event.source,
      });
    }),
    resetComponentOpacities: assign(({ context, event }) => {
      assertEvent(event, 'resetComponentOpacities');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (Object.keys(unit.opacityByComponentId).length === 0) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: { ...unit, opacityByComponentId: {} },
        source: event.source,
      });
    }),
    focusComponent: assign(({ context, event }) => {
      assertEvent(event, 'focusComponent');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (!hasComponent(unit, event.componentId)) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          focusedComponentId: event.componentId,
          selectedComponentIds: [event.componentId],
        },
        source: event.source,
        displayChanged: false,
      });
    }),
    clearFocus: assign(({ context, event }) => {
      assertEvent(event, 'clearFocus');
      const unit = getModelInteractionUnitState(context, event.unitId);
      if (unit.focusedComponentId === undefined) {
        return {};
      }
      return assignUnit({
        context,
        unitId: event.unitId,
        unit: {
          ...unit,
          focusedComponentId: undefined,
        },
        source: event.source,
        displayChanged: false,
      });
    }),
  },
}).createMachine({
  id: 'modelInteraction',
  context: ({ input }) => {
    const hydrated = hydrateUnitsFromComponentDisplay(input.componentDisplay);
    return {
      unitsById: hydrated.unitsById,
      unitOrder: hydrated.unitOrder,
      revision: 0,
      displayRevision: 0,
      lastInteractionSource: 'unknown',
    };
  },
  on: {
    loadManifest: { actions: 'loadManifest' },
    clearManifest: { actions: 'clearManifest' },
    restoreComponentDisplay: { actions: 'restoreComponentDisplay' },
    rekeySourceUnits: { actions: 'rekeySourceUnits' },
    pruneSourceUnits: { actions: 'pruneSourceUnits' },
    setHoveredComponent: { actions: 'setHoveredComponent' },
    toggleComponentSelection: { actions: 'toggleComponentSelection' },
    selectComponent: { actions: 'selectComponent' },
    clearSelection: { actions: 'clearSelection' },
    hideComponent: { actions: 'hideComponent' },
    showComponent: { actions: 'showComponent' },
    showHiddenComponents: { actions: 'showHiddenComponents' },
    isolateComponent: { actions: 'isolateComponent' },
    clearIsolation: { actions: 'clearIsolation' },
    setComponentOpacity: { actions: 'setComponentOpacity' },
    resetComponentOpacities: { actions: 'resetComponentOpacities' },
    focusComponent: { actions: 'focusComponent' },
    clearFocus: { actions: 'clearFocus' },
  },
});
