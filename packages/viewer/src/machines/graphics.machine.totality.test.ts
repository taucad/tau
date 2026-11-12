/**
 * Totality baseline for the graphics machine (MC-R17). It locks today's answers before any state moves:
 * every public event is sampled in every reachable state, and each pair left unanswered must be on
 * `graphicsIgnoredEvents`. A later change that answers an event removes its pair; this file then fails until it does.
 *
 * The claim is bounded by the samples below, the projection (one snapshot per state value, the last one the traversal
 * reached) and the traversal limit. A silent `{}` branch that needs other context, such as a repeated
 * `markModelPointerGestureMoved` or `commitSectionCuts`, is not sampled into silence. Path table (the shortest path to
 * each state value), kept current with `pathTable`:
 *
 * 1. `section.off`, `measure.off`: initial
 * 2. `section.on.settled`, `measure.off`: `setSectionViewActive(true)`
 * 3. `section.on.editing`, `measure.off`: `setSectionViewActive(true)`, `addSectionCut`
 * 4. `section.off`, `measure.on.selecting`: `setMeasureActive(true)`
 * 5. `section.off`, `measure.on.selected`: `setMeasureActive(true)`, `startMeasurement`
 * 6. each `section` row with each `measure` row: the section events, then the measure events
 *
 * The `backend` region runs beside them: each row holds in `backend.probing` (initial), in `backend.resolved`
 * (the probe answers last) and in `backend.lost` (the probe answers, then `webGpuCanvasLost`), twenty-seven rows in
 * all. `section.on.editing` is the section quiet gate (charter G6): it settles `sectionSettleDelay` after the last
 * change to the cuts.
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { UnansweredEvent } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createAsyncLogic, createCallbackLogic, matchesState, transition } from 'xstate';
import type { AnyMachineSnapshot, StateValue } from 'xstate';
import { getShortestPaths } from 'xstate/graph';
import type { GeometryComponentManifest } from '@taucad/types';
import type { MeasurementAnchor, MeasurementRecord } from '#constants/measurement.types.js';
import { graphicsEventTypes, graphicsIgnoredEvents, graphicsMachine } from '#machines/graphics.machine.js';
import type { GltfPresentationTelemetry, GraphicsEvent } from '#machines/graphics.machine.js';

const unitId = 'src/main.ts';
const capabilities = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
} satisfies GeometryComponentManifest['capabilities'];
const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  sourceFile: unitId,
  rootId: 'root',
  nodeOrder: ['root'],
  nodesById: {
    root: {
      id: 'root',
      name: 'Model',
      kind: 'model',
      selector: 'root',
      childIds: [],
      depth: 0,
      path: ['Model'],
      meshNodeIndices: [],
      primitiveIndices: [],
      materialIndices: [],
      capabilities,
    },
  },
  capabilities,
};
const anchor: MeasurementAnchor = { point: [0, 0, 0], geometryKey: 'g', label: 'a', quality: 'mesh' };
const record: MeasurementRecord = {
  id: 'measurement_1',
  frameId: 'tau:root',
  startPoint: [0, 0, 0],
  endPoint: [1, 0, 0],
  distance: 1,
};
const { id: _id, isPinned: _isPinned, ...recordValues } = record;

const telemetry: GltfPresentationTelemetry = {
  revision: 0,
  key: 'k',
  backend: 'webgl',
  barrier: 'display-ready',
  outcome: 'presented',
  glbBytes: 0,
  meshCount: 0,
  triangleCount: 0,
  sourceLineCount: 0,
  lineSegmentCount: 0,
  durations: {},
  modelEmptyFrames: 0,
  committedBundleHighWaterMark: 0,
  candidateBundleHighWaterMark: 0,
  topologyJobsStarted: 0,
  topologyJobsDiscarded: 0,
};

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = { [T in GraphicsEvent['type']]: ReadonlyArray<Extract<GraphicsEvent, { type: T }>> };

const samples: Samples = {
  updateGridSize: [{ type: 'updateGridSize', payload: { smallSize: 0.001, largeSize: 0.01 } }],
  setGridSizeLocked: [{ type: 'setGridSizeLocked', payload: true }],
  setGridUnit: [{ type: 'setGridUnit', payload: { unit: 'in' } }],
  fitView: [{ type: 'fitView' }],
  cameraViewChanged: [
    { type: 'cameraViewChanged', verticalSpan: 1 },
    { type: 'cameraViewChanged', verticalSpan: 0 },
  ],
  poseRevisionObserved: [{ type: 'poseRevisionObserved', revision: 1 }],
  setSurfaceVisibility: [{ type: 'setSurfaceVisibility', payload: false }],
  setLinesVisibility: [{ type: 'setLinesVisibility', payload: false }],
  setGizmoVisibility: [{ type: 'setGizmoVisibility', payload: false }],
  setGridVisibility: [{ type: 'setGridVisibility', payload: false }],
  setAxesVisibility: [{ type: 'setAxesVisibility', payload: false }],
  setMatcapVisibility: [{ type: 'setMatcapVisibility', payload: true }],
  setPostProcessingVisibility: [{ type: 'setPostProcessingVisibility', payload: false }],
  setUpDirection: [{ type: 'setUpDirection', payload: 'y' }],
  adoptUpDirection: [{ type: 'adoptUpDirection', payload: 'y' }],
  setGraphicsBackendPreference: [{ type: 'setGraphicsBackendPreference', payload: 'webgl' }],
  webGpuCanvasLost: [{ type: 'webGpuCanvasLost' }],
  canvasAttached: [{ type: 'canvasAttached', canvasId: 'c', kind: 'placeholder' }],
  canvasDetached: [{ type: 'canvasDetached', canvasId: 'c' }],
  controlsAttached: [{ type: 'controlsAttached', canvasId: 'c', adapter: createCallbackLogic(() => undefined) }],
  sectionInputAttached: [{ type: 'sectionInputAttached', inputId: 's', adapter: createCallbackLogic(() => undefined) }],
  sectionInputDetached: [{ type: 'sectionInputDetached', inputId: 's' }],
  viewportGizmoAttached: [
    { type: 'viewportGizmoAttached', gizmoId: 'g', adapter: createCallbackLogic(() => undefined) },
  ],
  viewportGizmoDetached: [{ type: 'viewportGizmoDetached', gizmoId: 'g' }],
  viewerEnvironmentChanged: [
    {
      type: 'viewerEnvironmentChanged',
      environment: { colorScheme: 'dark', isHighContrast: false, accentColor: '#00987c' },
    },
  ],
  entryChanged: [{ type: 'entryChanged', identity: 'part.ts' }],
  geometryBoundsMeasured: [
    { type: 'geometryBoundsMeasured', key: 'k', bounds: { min: [-1, -1, -1], max: [1, 1, 1] }, radius: Math.sqrt(3) },
  ],
  setSectionViewActive: [
    { type: 'setSectionViewActive', payload: true },
    { type: 'setSectionViewActive', payload: false },
  ],
  adoptSectionView: [
    {
      type: 'adoptSectionView',
      section: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 0, isFlipped: false }] },
    },
    { type: 'adoptSectionView', section: { active: false, cuts: [] } },
  ],
  addSectionCut: [{ type: 'addSectionCut', payload: { kind: 'plane' } }],
  updateSectionCut: [{ type: 'updateSectionCut', payload: { id: 'missing', patch: { offset: 1 } } }],
  removeSectionCut: [{ type: 'removeSectionCut', payload: 'missing' }],
  selectSectionCut: [{ type: 'selectSectionCut', payload: undefined }],
  hoverSectionCut: [{ type: 'hoverSectionCut', payload: undefined }],
  commitSectionCuts: [{ type: 'commitSectionCuts', payload: [] }],
  setMeasureActive: [
    { type: 'setMeasureActive', payload: true },
    { type: 'setMeasureActive', payload: false },
  ],
  setMeasureInputReady: [{ type: 'setMeasureInputReady', ready: true }],
  adoptPinnedMeasurements: [{ type: 'adoptPinnedMeasurements', measurements: [] }],
  startMeasurement: [{ type: 'startMeasurement', payload: [0, 0, 0], anchor }],
  completeMeasurement: [{ type: 'completeMeasurement', payload: [1, 0, 0], anchor }],
  startFeatureMeasurement: [{ type: 'startFeatureMeasurement', anchor }],
  completeFeatureMeasurement: [{ type: 'completeFeatureMeasurement', record: recordValues }],
  setMeasureMode: [{ type: 'setMeasureMode', mode: 'point' }],
  setMeasureFrame: [{ type: 'setMeasureFrame', frame: 'tau:root' }],
  setMeasureSnapEnabled: [{ type: 'setMeasureSnapEnabled', enabled: false }],
  setMeasureOperation: [{ type: 'setMeasureOperation', operation: 'angle' }],
  setMeasureFilter: [{ type: 'setMeasureFilter', filter: 'auto' }],
  setMeasureCandidates: [{ type: 'setMeasureCandidates', candidates: [] }],
  chooseMeasureCandidate: [{ type: 'chooseMeasureCandidate', id: 'missing' }],
  clearMeasureChosenCandidate: [{ type: 'clearMeasureChosenCandidate' }],
  requestMeasureCandidateCommit: [{ type: 'requestMeasureCandidateCommit' }],
  requestMeasureCatalog: [{ type: 'requestMeasureCatalog' }],
  setMeasureMessage: [{ type: 'setMeasureMessage', message: 'm' }],
  setMeasurePreviewDistance: [{ type: 'setMeasurePreviewDistance', distance: 1 }],
  setMeasureLockedTarget: [{ type: 'setMeasureLockedTarget', id: 'missing' }],
  measurementSourceChanged: [{ type: 'measurementSourceChanged', geometryKey: 'g2' }],
  measurementPoseChanged: [{ type: 'measurementPoseChanged', revision: 1 }],
  measurementCutChanged: [{ type: 'measurementCutChanged' }],
  addMeasurementRecord: [{ type: 'addMeasurementRecord', record }],
  resolveMeasurementRecord: [{ type: 'resolveMeasurementRecord', id: 'missing', patch: {} }],
  cancelPendingMeasurements: [{ type: 'cancelPendingMeasurements', reason: 'r' }],
  cancelCurrentMeasurement: [{ type: 'cancelCurrentMeasurement' }],
  clearMeasurement: [{ type: 'clearMeasurement', payload: 'missing' }],
  clearAllMeasurements: [{ type: 'clearAllMeasurements' }],
  clearUnpinnedMeasurements: [{ type: 'clearUnpinnedMeasurements' }],
  setHoveredMeasurement: [{ type: 'setHoveredMeasurement', payload: undefined }],
  setMeasurementName: [{ type: 'setMeasurementName', id: 'missing', name: 'n' }],
  toggleMeasurementPinned: [{ type: 'toggleMeasurementPinned', id: 'missing' }],
  viewerShortcutPressed: [
    {
      type: 'viewerShortcutPressed',
      shortcut: 'grid',
      pressId: 'bar:1',
      camera: { direction: [0, 0, 1], requestedVerticalFieldOfView: 60, lastPerspectiveVerticalFieldOfView: 60 },
    },
    {
      type: 'viewerShortcutPressed',
      shortcut: 'escape',
      pressId: 'bar:2',
      camera: { direction: [0, 0, 1], requestedVerticalFieldOfView: 60, lastPerspectiveVerticalFieldOfView: 60 },
    },
    {
      type: 'viewerShortcutPressed',
      shortcut: 'removeCut',
      pressId: 'bar:3',
      cutId: 'missing',
      camera: { direction: [0, 0, 1], requestedVerticalFieldOfView: 60, lastPerspectiveVerticalFieldOfView: 60 },
    },
  ],
  interactionStarted: [{ type: 'interactionStarted' }],
  interactionMoved: [{ type: 'interactionMoved' }],
  interactionEnded: [{ type: 'interactionEnded' }],
  beginViewerModelHoverSuppression: [{ type: 'beginViewerModelHoverSuppression', reason: 'cameraControls' }],
  endViewerModelHoverSuppression: [{ type: 'endViewerModelHoverSuppression', reason: 'cameraControls' }],
  markModelPointerGestureMoved: [{ type: 'markModelPointerGestureMoved' }],
  clearModelPointerClickGuard: [{ type: 'clearModelPointerClickGuard' }],
  updateArtifact: [
    {
      type: 'updateArtifact',
      artifact: { mimeType: 'image/svg+xml', content: '<svg/>' },
      hash: 'h',
      sourceFile: unitId,
    },
  ],
  clearArtifact: [{ type: 'clearArtifact' }],
  gltfPreparationStarted: [{ type: 'gltfPreparationStarted', revision: 0, key: 'k' }],
  gltfDisplayReady: [{ type: 'gltfDisplayReady', revision: 0, key: 'k', barrier: 'display-ready' }],
  gltfAnalysisReady: [{ type: 'gltfAnalysisReady', revision: 0, key: 'k' }],
  gltfPresentationCommitted: [{ type: 'gltfPresentationCommitted', revision: 0, key: 'k', unitId, manifest }],
  gltfPresentationFailed: [{ type: 'gltfPresentationFailed', revision: 0, key: 'k' }],
  gltfPresentationMeasured: [{ type: 'gltfPresentationMeasured', telemetry }],
  loadModelComponentManifest: [{ type: 'loadModelComponentManifest', unitId, manifest }],
  clearModelComponentManifest: [{ type: 'clearModelComponentManifest', unitId }],
  setHoveredModelComponent: [{ type: 'setHoveredModelComponent', unitId, componentId: undefined }],
  toggleModelComponentSelection: [{ type: 'toggleModelComponentSelection', unitId, componentId: 'root' }],
  selectModelComponent: [{ type: 'selectModelComponent', unitId, componentId: 'root' }],
  clearModelComponentSelection: [{ type: 'clearModelComponentSelection', unitId }],
  hideModelComponent: [{ type: 'hideModelComponent', unitId, componentId: 'root' }],
  showModelComponent: [{ type: 'showModelComponent', unitId, componentId: 'root' }],
  showHiddenModelComponents: [{ type: 'showHiddenModelComponents', unitId }],
  isolateModelComponent: [{ type: 'isolateModelComponent', unitId, componentId: 'root' }],
  clearModelComponentIsolation: [{ type: 'clearModelComponentIsolation', unitId }],
  setModelComponentOpacity: [{ type: 'setModelComponentOpacity', unitId, componentId: 'root', opacity: 0.5 }],
  resetModelComponentOpacities: [{ type: 'resetModelComponentOpacities', unitId }],
  focusModelComponent: [{ type: 'focusModelComponent', unitId, componentId: 'root' }],
  clearModelComponentFocus: [{ type: 'clearModelComponentFocus', unitId }],
  sceneRadiusUpdated: [{ type: 'sceneRadiusUpdated', radius: 1, centerMeters: [0, 0, 0] }],
};

const machine = graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } });
const events: readonly GraphicsEvent[] = Object.values(samples).flat();
/** The probe's answer, which takes the `backend` region out of `probing`; built in, so never sampled as public. */
const probeAnswered = { type: 'xstate.done.actor.probeWebGpuInvocation', output: true } as unknown as GraphicsEvent;
const options = {
  input: {},
  events: [...events, probeAnswered],
  limit: 4000,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

/** The active leaf paths of a state value, dotted and joined, e.g. `operational.section.on | operational.measure.off`. */
const leaves = (value: StateValue, prefix = ''): string[] =>
  typeof value === 'string'
    ? [`${prefix}${value}`]
    : Object.entries(value).flatMap(([key, child]) =>
        child === undefined ? [`${prefix}${key}`] : leaves(child, `${prefix}${key}.`),
      );
const dotted = (value: StateValue): string => leaves(value).join(' | ');

describe('graphics machine totality baseline', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...graphicsEventTypes].toSorted());
    expect(new Set(graphicsEventTypes).size).toBe(graphicsEventTypes.length);
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(machine, options).map((row) => ({
        state: dotted(row.state),
        events: row.events.map((event) => event.type),
      })),
    ).toEqual([
      { state: 'operational.backend.probing | operational.section.off | operational.measure.off', events: [] },
      {
        state: 'operational.backend.probing | operational.section.on.settled | operational.measure.off',
        events: ['setSectionViewActive'],
      },
      {
        state: 'operational.backend.probing | operational.section.off | operational.measure.on.selecting',
        events: ['setMeasureActive'],
      },
      {
        state: 'operational.backend.resolved | operational.section.off | operational.measure.off',
        events: ['xstate.done.actor.probeWebGpuInvocation'],
      },
      {
        state: 'operational.backend.probing | operational.section.on.editing | operational.measure.off',
        events: ['setSectionViewActive', 'addSectionCut'],
      },
      {
        state: 'operational.backend.probing | operational.section.on.settled | operational.measure.on.selecting',
        events: ['setSectionViewActive', 'setMeasureActive'],
      },
      {
        state: 'operational.backend.resolved | operational.section.on.settled | operational.measure.off',
        events: ['setSectionViewActive', 'xstate.done.actor.probeWebGpuInvocation'],
      },
      {
        state: 'operational.backend.probing | operational.section.off | operational.measure.on.selected',
        events: ['setMeasureActive', 'startMeasurement'],
      },
      {
        state: 'operational.backend.resolved | operational.section.off | operational.measure.on.selecting',
        events: ['setMeasureActive', 'xstate.done.actor.probeWebGpuInvocation'],
      },
      {
        state: 'operational.backend.lost | operational.section.off | operational.measure.off',
        events: ['xstate.done.actor.probeWebGpuInvocation', 'webGpuCanvasLost'],
      },
      {
        state: 'operational.backend.probing | operational.section.on.editing | operational.measure.on.selecting',
        events: ['setSectionViewActive', 'addSectionCut', 'setMeasureActive'],
      },
      {
        state: 'operational.backend.resolved | operational.section.on.editing | operational.measure.off',
        events: ['setSectionViewActive', 'addSectionCut', 'xstate.done.actor.probeWebGpuInvocation'],
      },
      {
        state: 'operational.backend.probing | operational.section.on.settled | operational.measure.on.selected',
        events: ['setSectionViewActive', 'setMeasureActive', 'startMeasurement'],
      },
      {
        state: 'operational.backend.resolved | operational.section.on.settled | operational.measure.on.selecting',
        events: ['setSectionViewActive', 'setMeasureActive', 'xstate.done.actor.probeWebGpuInvocation'],
      },
      {
        state: 'operational.backend.lost | operational.section.on.settled | operational.measure.off',
        events: ['setSectionViewActive', 'xstate.done.actor.probeWebGpuInvocation', 'webGpuCanvasLost'],
      },
      {
        state: 'operational.backend.resolved | operational.section.off | operational.measure.on.selected',
        events: ['setMeasureActive', 'startMeasurement', 'xstate.done.actor.probeWebGpuInvocation'],
      },
      {
        state: 'operational.backend.lost | operational.section.off | operational.measure.on.selecting',
        events: ['setMeasureActive', 'xstate.done.actor.probeWebGpuInvocation', 'webGpuCanvasLost'],
      },
      {
        state: 'operational.backend.probing | operational.section.on.editing | operational.measure.on.selected',
        events: ['setSectionViewActive', 'addSectionCut', 'setMeasureActive', 'startMeasurement'],
      },
      {
        state: 'operational.backend.resolved | operational.section.on.editing | operational.measure.on.selecting',
        events: [
          'setSectionViewActive',
          'addSectionCut',
          'setMeasureActive',
          'xstate.done.actor.probeWebGpuInvocation',
        ],
      },
      {
        state: 'operational.backend.lost | operational.section.on.editing | operational.measure.off',
        events: [
          'setSectionViewActive',
          'addSectionCut',
          'xstate.done.actor.probeWebGpuInvocation',
          'webGpuCanvasLost',
        ],
      },
      {
        state: 'operational.backend.resolved | operational.section.on.settled | operational.measure.on.selected',
        events: [
          'setSectionViewActive',
          'setMeasureActive',
          'startMeasurement',
          'xstate.done.actor.probeWebGpuInvocation',
        ],
      },
      {
        state: 'operational.backend.lost | operational.section.on.settled | operational.measure.on.selecting',
        events: [
          'setSectionViewActive',
          'setMeasureActive',
          'xstate.done.actor.probeWebGpuInvocation',
          'webGpuCanvasLost',
        ],
      },
      {
        state: 'operational.backend.lost | operational.section.off | operational.measure.on.selected',
        events: ['setMeasureActive', 'startMeasurement', 'xstate.done.actor.probeWebGpuInvocation', 'webGpuCanvasLost'],
      },
      {
        state: 'operational.backend.resolved | operational.section.on.editing | operational.measure.on.selected',
        events: [
          'setSectionViewActive',
          'addSectionCut',
          'setMeasureActive',
          'startMeasurement',
          'xstate.done.actor.probeWebGpuInvocation',
        ],
      },
      {
        state: 'operational.backend.lost | operational.section.on.editing | operational.measure.on.selecting',
        events: [
          'setSectionViewActive',
          'addSectionCut',
          'setMeasureActive',
          'xstate.done.actor.probeWebGpuInvocation',
          'webGpuCanvasLost',
        ],
      },
      {
        state: 'operational.backend.lost | operational.section.on.settled | operational.measure.on.selected',
        events: [
          'setSectionViewActive',
          'setMeasureActive',
          'startMeasurement',
          'xstate.done.actor.probeWebGpuInvocation',
          'webGpuCanvasLost',
        ],
      },
      {
        state: 'operational.backend.lost | operational.section.on.editing | operational.measure.on.selected',
        events: [
          'setSectionViewActive',
          'addSectionCut',
          'setMeasureActive',
          'startMeasurement',
          'xstate.done.actor.probeWebGpuInvocation',
          'webGpuCanvasLost',
        ],
      },
    ]);
    expect(unreachedStates(machine, options)).toEqual([]);
  });

  it('should answer every sampled event in every reachable state except the declared baseline', () => {
    expect(unansweredEvents(machine, { ...options, ignore: graphicsIgnoredEvents })).toEqual([]);
  });

  it('should claim F and G in every reachable state, which the blanket shortcut pair cannot check', () => {
    const alwaysClaimed = (['fitView', 'grid'] as const).map(
      (shortcut): GraphicsEvent => ({
        type: 'viewerShortcutPressed',
        shortcut,
        pressId: 'bar:always',
        camera: { direction: [0, 0, 1], requestedVerticalFieldOfView: 60, lastPerspectiveVerticalFieldOfView: 60 },
      }),
    );
    const unclaimed = getShortestPaths(machine, options).flatMap(({ state: snapshot }) =>
      alwaysClaimed
        .filter((event) => !snapshot.can(event))
        .map((event) => `${dotted(snapshot.value)}: ${(event as { shortcut: string }).shortcut}`),
    );
    expect(unclaimed).toEqual([]);
  });

  it('should declare no baseline pair that the machine now answers', () => {
    const gaps: UnansweredEvent[] = unansweredEvents(machine, options);
    const stale = graphicsIgnoredEvents.filter(
      ([state, eventType]) =>
        !gaps.some((gap) => gap.eventType === eventType && (state === '*' || matchesState(state, gap.state))),
    );
    expect(stale).toEqual([]);
  });

  it("should keep today's silent no-op answers per state", () => {
    // A no-op answer (a transition function returning `{}`) counts as answered: it keeps the value and the context
    // object and enqueues nothing. These are the sampled deliveries that do so today.
    const silent = getShortestPaths(machine, options).map(({ state: snapshot }) => {
      const types = events
        .filter((event) => {
          if (!snapshot.can(event)) {
            return false;
          }
          const [next, effects] = transition(machine, snapshot, event);
          return next.context === snapshot.context && effects.length === 0 && next.matches(snapshot.value);
        })
        .map((event) => event.type);
      return { state: dotted(snapshot.value), types: [...new Set(types)] };
    });
    const everywhere = [
      'cameraViewChanged',
      'canvasDetached',
      'controlsAttached',
      'sectionInputDetached',
      'viewportGizmoDetached',
      'adoptSectionView',
      'updateSectionCut',
      'removeSectionCut',
      'hoverSectionCut',
      'adoptPinnedMeasurements',
      'interactionMoved',
      'clearArtifact',
      'gltfPresentationCommitted',
    ];
    const withSelectSectionCut = [...everywhere.slice(0, 8), 'selectSectionCut', ...everywhere.slice(8)];
    // While the cuts are being edited, adopting the sampled section is a change (it differs from the edited cuts).
    const whileEditing = everywhere.filter((type) => type !== 'adoptSectionView');
    expect(silent).toEqual([
      {
        state: 'operational.backend.probing | operational.section.off | operational.measure.off',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.probing | operational.section.on.settled | operational.measure.off',
        types: everywhere,
      },
      {
        state: 'operational.backend.probing | operational.section.off | operational.measure.on.selecting',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.resolved | operational.section.off | operational.measure.off',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.probing | operational.section.on.editing | operational.measure.off',
        types: whileEditing,
      },
      {
        state: 'operational.backend.probing | operational.section.on.settled | operational.measure.on.selecting',
        types: everywhere,
      },
      {
        state: 'operational.backend.resolved | operational.section.on.settled | operational.measure.off',
        types: everywhere,
      },
      {
        state: 'operational.backend.probing | operational.section.off | operational.measure.on.selected',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.resolved | operational.section.off | operational.measure.on.selecting',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.lost | operational.section.off | operational.measure.off',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.probing | operational.section.on.editing | operational.measure.on.selecting',
        types: whileEditing,
      },
      {
        state: 'operational.backend.resolved | operational.section.on.editing | operational.measure.off',
        types: whileEditing,
      },
      {
        state: 'operational.backend.probing | operational.section.on.settled | operational.measure.on.selected',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.resolved | operational.section.on.settled | operational.measure.on.selecting',
        types: everywhere,
      },
      {
        state: 'operational.backend.lost | operational.section.on.settled | operational.measure.off',
        types: everywhere,
      },
      {
        state: 'operational.backend.resolved | operational.section.off | operational.measure.on.selected',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.lost | operational.section.off | operational.measure.on.selecting',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.probing | operational.section.on.editing | operational.measure.on.selected',
        types: whileEditing,
      },
      {
        state: 'operational.backend.resolved | operational.section.on.editing | operational.measure.on.selecting',
        types: whileEditing,
      },
      {
        state: 'operational.backend.lost | operational.section.on.editing | operational.measure.off',
        types: whileEditing,
      },
      {
        state: 'operational.backend.resolved | operational.section.on.settled | operational.measure.on.selected',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.lost | operational.section.on.settled | operational.measure.on.selecting',
        types: everywhere,
      },
      {
        state: 'operational.backend.lost | operational.section.off | operational.measure.on.selected',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.resolved | operational.section.on.editing | operational.measure.on.selected',
        types: whileEditing,
      },
      {
        state: 'operational.backend.lost | operational.section.on.editing | operational.measure.on.selecting',
        types: whileEditing,
      },
      {
        state: 'operational.backend.lost | operational.section.on.settled | operational.measure.on.selected',
        types: withSelectSectionCut,
      },
      {
        state: 'operational.backend.lost | operational.section.on.editing | operational.measure.on.selected',
        types: whileEditing,
      },
    ]);
  });
});
