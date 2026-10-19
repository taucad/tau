import * as React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { isSameSectionHalfSpace, sectionPiecesKey } from '#graphics/section-cuts.js';
import type { SectionCut, SectionPiece } from '#graphics/section-cuts.js';
import { gltfEdgeLineWidth } from '#graphics/three/materials/gltf-edges.js';
import {
  mixModelEmphasisTint,
  resolveModelComponentEmphasis,
  resolveModelMaterialBaseTintHex,
} from '#graphics/three/materials/model-component-appearance.js';
import type { ModelComponentEmphasis } from '#graphics/three/materials/model-component-appearance.js';
import { resolveSectionCapOutlineColor } from '#graphics/three/materials/section-cap-outline.material.js';
import { gltfEdgeColorDarkMode, gltfEdgeColorLightMode } from '#graphics/three/overlay-colors.constants.js';
import { useOverlayDepthRestorer } from '#graphics/three/scene-overlay.jsx';
import { useThreeGraphicsBackend } from '#graphics/three/three-graphics-backend-context.jsx';
import { sceneTag, sceneTagData } from '#graphics/three/utils/scene-tags.js';
import { sectionCapStencilDebugUserDataKey } from '#graphics/three/utils/section-cap-stencil-debug.js';
import type { SectionCapStencilDiagnostics } from '#graphics/three/utils/section-cap-stencil-debug.js';
import { createSectionLoopCaps } from '#graphics/three/utils/section-loop-caps.js';
import type { SectionLoopCapFace, SectionLoopCapSource } from '#graphics/three/utils/section-loop-caps.js';
import { createSectionOpenBackFaces } from '#graphics/three/utils/section-open-back-faces.js';
import { createSectionStencilCaps, resolveSectionExitHalfSpaces } from '#graphics/three/utils/section-stencil-caps.js';
import type { SectionStencilCapSource } from '#graphics/three/utils/section-stencil-caps.js';
import {
  collectSectionSurfaceSources,
  isSectionObjectVisible,
} from '#graphics/three/utils/section-surface-topology.js';
import type {
  SectionTopologyFailure,
  VisibleSectionSurfaceSource,
} from '#graphics/three/utils/section-surface-topology.js';
import {
  commitSectionViewSafeSnapshot,
  getSectionViewSafeSnapshotDebugState,
  resetSectionViewSafeSnapshot,
  sectionViewSafeSnapshotDebugUserDataKey,
} from '#graphics/three/utils/section-view-safe-snapshot.js';
import type { SectionCutSet, SectionViewSafeSnapshotStore } from '#graphics/three/utils/section-view-safe-snapshot.js';
import { useViewerEnvironment, useViewerFeature } from '#environment/viewer-environment.jsx';
import { useGraphicsSelector, useModelInteractionRef, useModelInteractionSelector } from '#hooks/use-graphics.jsx';
import { recordRendererSpan } from '#lib/renderer-telemetry.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';

export type SectionContourFillsProperties = Readonly<{
  /** The live cut list and its pieces in the render frame, committed once the sources it may cut are known. */
  cutSet: SectionCutSet;
  enabled: boolean;
  stripeFrequency: number;
  stripeWidth: number;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: React.RefObject<THREE.Group | null>;
  snapshotRef: React.RefObject<SectionViewSafeSnapshotStore>;
  /** Called from the frame in which the committed cut list changes. */
  onCommit: (cuts: readonly SectionCut[]) => void;
}>;

/**
 * After the model's pass (priority 1), which leaves the frame's depth, and before the emphasis mask (1.4) and the
 * canvas overlays (1.5 and 2), which then test against the caps.
 */
export const sectionCapRenderPriority = 1.2;

const noCuts: readonly SectionCut[] = [];

/** A pending source counts nothing into the stencil, so it is cut and outlined but not capped. */
const uncappedLoops: SectionLoopCapSource = { matrix: new THREE.Matrix4(), bySlot: new Map() };

/**
 * How a source is capped.
 *
 * - `exact`: a closed, consistently oriented surface shown whole, counted by the stencil from its own meshes (nonzero).
 * - `per-loop`: anything else (an open or non-manifold surface, or one shown in part), capped from the closed loops a
 *   slice of its shown triangles finds on each face, counted even-odd, with its open chains outlined and its back faces
 *   shown.
 * - `pending`: its census has not landed; it is cut and outlined but not capped until it does, and its back faces are
 *   not shown.
 */
export type SectionCapGrade = 'exact' | 'per-loop' | 'pending';

/** One source as the caps draw it: its shown meshes, its grade, its owner and the tint of its first material. */
export type SectionSourceRecord = Readonly<{
  key: string;
  visibleSource: VisibleSectionSurfaceSource;
  ownerKey: string;
  meshes: readonly THREE.Mesh[];
  baseTintHex: number;
  grade: SectionCapGrade;
  /** Why a source is capped per loop: its closure failure, or `partial-visibility`. */
  reason: SectionTopologyFailure['code'] | undefined;
}>;

const toSourceRecord = (visibleSource: VisibleSectionSurfaceSource): SectionSourceRecord => {
  const { source, visibility } = visibleSource;
  const meshes = source.participants.map(({ mesh }) => mesh).filter((mesh) => isSectionObjectVisible(mesh));
  const firstMaterial = meshes[0]?.material;
  const material = Array.isArray(firstMaterial) ? firstMaterial[0] : firstMaterial;
  const reason =
    source.closure.status === 'open'
      ? source.closure.failure.code
      : visibility === 'partial'
        ? 'partial-visibility'
        : undefined;
  return {
    key: source.key,
    visibleSource,
    ownerKey: source.owner ? `${source.owner.unitId}:${source.owner.componentId}` : source.key,
    meshes,
    baseTintHex: material ? resolveModelMaterialBaseTintHex(material) : 0xff_ff_ff,
    grade: reason === undefined ? (source.closure.status === 'pending' ? 'pending' : 'exact') : 'per-loop',
    reason,
  };
};

/** The faces a per-loop source is sliced through this frame: the exit faces of every piece seen from its removed side. */
const resolveLoopCapFaces = (camera: THREE.Camera, pieces: readonly SectionPiece[]): SectionLoopCapFace[] =>
  pieces.flatMap((piece, pieceIndex) => {
    const exit = resolveSectionExitHalfSpaces(camera, piece);
    return piece.faces.flatMap((face, faceIndex) =>
      exit.some((halfSpace) => isSameSectionHalfSpace(halfSpace, face.plane))
        ? [{ slot: pieceIndex * 2 + faceIndex, plane: face.plane }]
        : [],
    );
  });

/** The emphasis of the component a cut face belongs to, or `none` when it has no owner. */
export function resolveSectionSourceEmphasis(
  record: SectionSourceRecord,
  modelInteractionContext: ModelInteractionContext,
): ModelComponentEmphasis {
  const { owner } = record.visibleSource.source;
  return owner
    ? resolveModelComponentEmphasis(
        getModelInteractionUnitState(modelInteractionContext, owner.unitId),
        owner.componentId,
      )
    : 'none';
}

/**
 * The section view's cut faces, drawn with stencil caps on both backends. A cut is never refused.
 *
 * The frame before the model's (priority -1) commits the live cut list once the sources it may cut are known, and
 * grades each source. The pass after the model's draws the committed list's caps, overlap and outline. An `exact`
 * source is counted from its own meshes, so moving a cut costs the same at any triangle count. A `per-loop` source is
 * counted from fans over the closed loops a worker slice found on each face; while a new plane's slice runs, the last
 * landed one stays drawn, and its open chains are outlined in the open-chain colour.
 */
export function SectionContourFills({
  cutSet,
  enabled,
  innerRef,
  stripeFrequency,
  stripeWidth,
  snapshotRef,
  onCommit,
}: SectionContourFillsProperties): React.JSX.Element {
  const backend = useThreeGraphicsBackend();
  const { colorScheme } = useViewerEnvironment();
  const edgeColor = colorScheme === 'dark' ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
  const isTauDebugEnabled = useViewerFeature('tauDebug');
  const modelInteractionRef = useModelInteractionRef();
  const modelInteractionUnitId = useGraphicsSelector((state) => state.context.modelInteractionUnitId);
  const modelInteractionUnitState = useModelInteractionSelector((state) =>
    modelInteractionUnitId ? getModelInteractionUnitState(state.context, modelInteractionUnitId) : undefined,
  );
  const invalidate = useThree((state) => state.invalidate);
  const restoreDepth = useOverlayDepthRestorer();
  const caps = React.useMemo(() => createSectionStencilCaps(backend), [backend]);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  const rootRef = React.useRef<THREE.Group | null>(null);
  const awaitedTreesRef = React.useRef(new Set<Promise<unknown>>());
  /** The sources of the committed cut list, which the caps draw until another list commits. */
  const committedRecordsRef = React.useRef<readonly SectionSourceRecord[]>([]);
  const reportedCutsRef = React.useRef<readonly SectionCut[] | undefined>(undefined);
  const reportedGradesRef = React.useRef(new Map<string, string>());
  const diagnosticsRef = React.useRef<SectionCapStencilDiagnostics>({ sequence: 0, latest: undefined, loops: [] });
  const drawingBufferSize = React.useMemo(() => new THREE.Vector2(), []);
  const loopCaps = React.useMemo(() => createSectionLoopCaps({ onLanded: invalidate }), [invalidate]);
  const backFaces = React.useMemo(() => createSectionOpenBackFaces(), []);

  React.useEffect(
    () => () => {
      caps.dispose();
    },
    [caps],
  );
  React.useEffect(
    () => () => {
      loopCaps.dispose();
    },
    [loopCaps],
  );
  React.useEffect(
    () => () => {
      backFaces.dispose();
    },
    [backFaces],
  );

  // A layout effect, so a cut step, restyle or emphasis change asks for its frame before the browser paints.
  React.useLayoutEffect(() => {
    if (enabled) {
      invalidate();
    }
  }, [cutSet, edgeColor, enabled, invalidate, modelInteractionUnitState, stripeFrequency, stripeWidth]);

  /** Records a source's grade and what its per-loop slices found, once per change, as telemetry. */
  const reportGrade = (record: SectionSourceRecord, closedLoopCount: number, openChainCount: number): void => {
    const summary = `${record.grade}|${record.reason ?? ''}|${closedLoopCount}|${openChainCount}`;
    if (reportedGradesRef.current.get(record.key) === summary) {
      return;
    }
    reportedGradesRef.current.set(record.key, summary);
    recordRendererSpan('renderer.section-cap-graded', {
      startTime: performance.now(),
      duration: 0,
      attributes: {
        sourceKey: record.key,
        grade: record.grade,
        reason: record.reason ?? 'none',
        closedLoopCount,
        openChainCount,
        backend,
      },
    });
  };

  // Commit: before the model's pass, so the clip follows a commit within the same frame.
  useFrame(() => {
    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root) {
      return;
    }
    const store = snapshotRef.current;
    if (!enabled || !inner) {
      reportedCutsRef.current = undefined;
      reportedGradesRef.current.clear();
      committedRecordsRef.current = [];
      loopCaps.retain(new Set());
      backFaces.show([]);
      resetSectionViewSafeSnapshot(store);
      root.userData[sectionViewSafeSnapshotDebugUserDataKey] = getSectionViewSafeSnapshotDebugState(store);
      return;
    }

    // A source whose census is pending is collected uncapped, so the cut commits now; draw again once it lands, as a
    // registration does.
    const visibleSources = collectSectionSurfaceSources(inner, (ready) => {
      if (ready && !awaitedTreesRef.current.has(ready)) {
        awaitedTreesRef.current.add(ready);
        // async-iife: bootstrap -- A frame cannot await a census running in the worker.
        void (async () => {
          await ready.catch(() => undefined);
          awaitedTreesRef.current.delete(ready);
          invalidate();
        })();
      }
    });
    // The caps follow posed parts by drawing their meshes where they are, so placement is not part of the identity.
    let sourceIdentity = '';
    for (const { source, visibility } of visibleSources) {
      sourceIdentity += `${source.key}|${source.revision}|${visibility};`;
    }
    const candidateIdentity = `${sectionPiecesKey(cutSet.pieces)}#${sourceIdentity}`;
    if (store.committed?.identity !== candidateIdentity) {
      const records = visibleSources.map((visibleSource) => toSourceRecord(visibleSource));
      commitSectionViewSafeSnapshot(store, {
        identity: candidateIdentity,
        sourceIdentity,
        kind: cutSet.pieces.length > 0 ? 'complete' : 'uncut',
        cutSet,
      });
      committedRecordsRef.current = records;
      const perLoop = records.filter(({ grade }) => grade === 'per-loop');
      loopCaps.retain(new Set(perLoop.map(({ key }) => key)));
      // Only per-loop sources: a pending source is usually graded exact a moment later, and switching its materials
      // there and back would rebuild their programs twice for nothing.
      backFaces.show(cutSet.pieces.length > 0 ? perLoop.flatMap(({ meshes }) => meshes) : []);
      root.userData['sectionCapCompleteness'] = {
        status: 'complete',
        admittedSourceCount: records.length,
        exactSourceCount: records.filter(({ grade }) => grade === 'exact').length,
        perLoopSourceCount: perLoop.length,
        pendingSourceCount: records.filter(({ grade }) => grade === 'pending').length,
        sources: records.map(({ key, grade, reason }) => ({ sourceKey: key, grade, reason })),
      };
      root.userData[sectionViewSafeSnapshotDebugUserDataKey] = getSectionViewSafeSnapshotDebugState(store);
    }

    // Tells the stage what is committed, only when that changes; the clip follows it within this frame.
    const cuts = store.committed?.cutSet.cuts ?? noCuts;
    if (reportedCutsRef.current !== cuts) {
      reportedCutsRef.current = cuts;
      onCommit(cuts);
    }
  }, -1);

  // The caps: after the model's pass, on the canvas, against the frame's depth.
  useFrame((state) => {
    const root = rootRef.current;
    const { committed } = snapshotRef.current;
    const records = committedRecordsRef.current;
    if (!root || !enabled || !committed || committed.cutSet.pieces.length === 0 || records.length === 0) {
      return;
    }
    const modelInteractionContext = modelInteractionRef.getSnapshot().context;
    const { gl, camera } = state;
    const loopFaces = records.some(({ grade }) => grade === 'per-loop')
      ? resolveLoopCapFaces(camera, committed.cutSet.pieces)
      : [];
    const sources: SectionStencilCapSource[] = records.map((record) => {
      const emphasis = resolveSectionSourceEmphasis(record, modelInteractionContext);
      const loops =
        record.grade === 'per-loop'
          ? loopCaps.resolve(record.visibleSource.source, loopFaces)
          : record.grade === 'pending'
            ? uncappedLoops
            : undefined;
      return {
        key: record.key,
        ownerKey: record.ownerKey,
        meshes: record.meshes,
        tintHex: mixModelEmphasisTint(record.baseTintHex, emphasis),
        edgeHex: resolveSectionCapOutlineColor(emphasis, edgeColor),
        loops,
      };
    });
    gl.getDrawingBufferSize(drawingBufferSize);
    // Without a post owner the model's pass left the canvas depth, and this is a no-op.
    restoreDepth();
    const stats = caps.render(gl, {
      camera,
      pieces: committed.cutSet.pieces,
      sources,
      stripes: { stripeFrequency, stripeWidth },
      outlineWidthPixels: gltfEdgeLineWidth * gl.getPixelRatio(),
      viewportHeightPixels: drawingBufferSize.y,
    });
    const loopDiagnostics = loopCaps.diagnostics();
    for (const record of records) {
      const loops = loopDiagnostics.find(({ sourceKey }) => sourceKey === record.key);
      if (record.grade === 'exact' || loops?.pendingFaceCount === 0) {
        reportGrade(record, loops?.closedLoopCount ?? 0, loops?.openChainCount ?? 0);
      }
    }
    if (isTauDebugEnabled) {
      const diagnostics = diagnosticsRef.current;
      diagnostics.sequence++;
      diagnostics.latest = stats;
      diagnostics.loops = loopDiagnostics;
      root.userData[sectionCapStencilDebugUserDataKey] = diagnostics;
    }
  }, sectionCapRenderPriority);

  // One object per instance: R3F replaces `userData` when the prop changes identity, which would wipe the diagnostics
  // the frames publish on it.
  const [rootUserData] = React.useState(() => sceneTagData(sceneTag.sectionViewHelper));

  return <group ref={rootRef} data-testid='tau-section-contour-fills-root' userData={rootUserData} />;
}
