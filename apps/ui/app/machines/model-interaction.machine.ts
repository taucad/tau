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
  manifest?: GeometryComponentManifest;
  hoveredComponentId?: string;
  selectedComponentIds: string[];
  focusedComponentId?: string;
  hiddenComponentIds: string[];
  isolatedComponentIds: string[];
  opacityByComponentId: Record<string, number>;
};

export type ModelInteractionContext = {
  unitsById: Record<string, ModelInteractionUnitState>;
  unitOrder: string[];
  activeUnitId?: string;
  viewerHoverSuppressionReasons: ViewerHoverSuppressionReason[];
  isViewerHoverSuppressed: boolean;
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
  | { type: 'beginViewerHoverSuppression'; reason: ViewerHoverSuppressionReason; source?: ModelInteractionSource }
  | { type: 'endViewerHoverSuppression'; reason: ViewerHoverSuppressionReason; source?: ModelInteractionSource }
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
  selectedComponentIds: Object.freeze([]) as string[],
  hiddenComponentIds: Object.freeze([]) as string[],
  isolatedComponentIds: Object.freeze([]) as string[],
  opacityByComponentId: Object.freeze({}) as Record<string, number>,
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

function isViewerHoverSource(source: ModelInteractionSource | undefined): boolean {
  return source === undefined || source === 'viewer' || source === 'unknown';
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
  opacityByComponentId: Record<string, number>,
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

function recordsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const entriesA = Object.entries(a);
  const entriesB = Object.entries(b);
  return entriesA.length === entriesB.length && entriesA.every(([key, value]) => b[key] === value);
}

function omitRecordKey<Value>(record: Record<string, Value>, key: string): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));
}

function clearUnitHover(unit: ModelInteractionUnitState): ModelInteractionUnitState {
  return unit.hoveredComponentId === undefined ? unit : { ...unit, hoveredComponentId: undefined };
}

function clearAllUnitHovers(unitsById: Record<string, ModelInteractionUnitState>): {
  unitsById: Record<string, ModelInteractionUnitState>;
  changed: boolean;
} {
  let changed = false;
  const nextUnitsById = Object.fromEntries(
    Object.entries(unitsById).map(([unitId, unit]) => {
      const nextUnit = clearUnitHover(unit);
      changed ||= nextUnit !== unit;
      return [unitId, nextUnit];
    }),
  );

  return { unitsById: nextUnitsById, changed };
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
    activeUnitId: unitId,
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
    beginViewerHoverSuppression: assign(({ context, event }) => {
      assertEvent(event, 'beginViewerHoverSuppression');
      if (context.viewerHoverSuppressionReasons.includes(event.reason)) {
        return {};
      }
      const cleared = clearAllUnitHovers(context.unitsById);
      const reasons = [...context.viewerHoverSuppressionReasons, event.reason];
      return {
        unitsById: cleared.unitsById,
        viewerHoverSuppressionReasons: reasons,
        isViewerHoverSuppressed: reasons.length > 0,
        ...withRevision({ context, source: event.source, displayChanged: false }),
      };
    }),
    endViewerHoverSuppression: assign(({ context, event }) => {
      assertEvent(event, 'endViewerHoverSuppression');
      if (!context.viewerHoverSuppressionReasons.includes(event.reason)) {
        return {};
      }
      const reasons = context.viewerHoverSuppressionReasons.filter((reason) => reason !== event.reason);
      return {
        viewerHoverSuppressionReasons: reasons,
        isViewerHoverSuppressed: reasons.length > 0,
        ...withRevision({ context, source: event.source, displayChanged: false }),
      };
    }),
    setHoveredComponent: assign(({ context, event }) => {
      assertEvent(event, 'setHoveredComponent');
      if (context.isViewerHoverSuppressed && isViewerHoverSource(event.source)) {
        return {};
      }
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
      activeUnitId: undefined,
      viewerHoverSuppressionReasons: [],
      isViewerHoverSuppressed: false,
      revision: 0,
      displayRevision: 0,
      lastInteractionSource: 'unknown',
    };
  },
  on: {
    loadManifest: { actions: 'loadManifest' },
    clearManifest: { actions: 'clearManifest' },
    beginViewerHoverSuppression: { actions: 'beginViewerHoverSuppression' },
    endViewerHoverSuppression: { actions: 'endViewerHoverSuppression' },
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
    focusComponent: { actions: 'focusComponent' },
    clearFocus: { actions: 'clearFocus' },
  },
});
