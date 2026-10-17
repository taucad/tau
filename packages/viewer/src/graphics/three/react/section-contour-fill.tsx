import * as React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { toast } from '@taucad/ui/components/sonner';
import { sectionPiecesKey } from '#graphics/section-cuts.js';
import type { SectionCut } from '#graphics/section-cuts.js';
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
import { createSectionStencilCaps } from '#graphics/three/utils/section-stencil-caps.js';
import type { SectionStencilCapSource } from '#graphics/three/utils/section-stencil-caps.js';
import { collectSectionSurfaceSources } from '#graphics/three/utils/section-surface-topology.js';
import type {
  SectionTopologyFailure,
  VisibleSectionSurfaceSource,
} from '#graphics/three/utils/section-surface-topology.js';
import {
  commitSectionViewSafeSnapshot,
  getSectionViewSafeSnapshotDebugState,
  rejectSectionViewSafeSnapshot,
  resetSectionViewSafeSnapshot,
  sectionViewSafeSnapshotDebugUserDataKey,
} from '#graphics/three/utils/section-view-safe-snapshot.js';
import type { SectionCutSet, SectionViewSafeSnapshotStore } from '#graphics/three/utils/section-view-safe-snapshot.js';
import { useViewerEnvironment, useViewerFeature } from '#environment/viewer-environment.jsx';
import { useGraphicsSelector, useModelInteractionRef, useModelInteractionSelector } from '#hooks/use-graphics.jsx';
import { recordRendererSpan } from '#lib/renderer-telemetry.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';

/**
 * What the caps committed: the cut list the clip, the caps and raycasts show, and whether the live list certified.
 */
export type SectionCertification = Readonly<{ status: 'certified' | 'rejected'; cuts: readonly SectionCut[] }>;

export type SectionContourFillsProperties = Readonly<{
  /** The live cut list and its pieces in the render frame, committed once every source it may cut certifies. */
  cutSet: SectionCutSet;
  enabled: boolean;
  stripeFrequency: number;
  stripeWidth: number;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: React.RefObject<THREE.Group | null>;
  snapshotRef: React.RefObject<SectionViewSafeSnapshotStore>;
  /** Called from the frame in which the committed cut list or its certification changes. */
  onCertify: (certification: SectionCertification) => void;
}>;

/**
 * After the model's pass (priority 1), which leaves the frame's depth, and before the emphasis mask (1.4) and the
 * canvas overlays (1.5 and 2), which then test against the caps.
 */
export const sectionCapRenderPriority = 1.2;

const noCuts: readonly SectionCut[] = [];

/** One source as the caps draw it: its meshes, its owner and the tint of its first material. */
export type SectionSourceRecord = Readonly<{
  key: string;
  visibleSource: VisibleSectionSurfaceSource;
  ownerKey: string;
  meshes: readonly THREE.Mesh[];
  baseTintHex: number;
}>;

const toSourceRecord = (visibleSource: VisibleSectionSurfaceSource): SectionSourceRecord => {
  const { source } = visibleSource;
  const meshes = source.participants.map(({ mesh }) => mesh);
  const firstMaterial = meshes[0]?.material;
  const material = Array.isArray(firstMaterial) ? firstMaterial[0] : firstMaterial;
  return {
    key: source.key,
    visibleSource,
    ownerKey: source.owner ? `${source.owner.unitId}:${source.owner.componentId}` : source.key,
    meshes,
    baseTintHex: material ? resolveModelMaterialBaseTintHex(material) : 0xff_ff_ff,
  };
};

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
 * Why a cut set cannot be capped exactly: a source whose surface is not a closed, consistently oriented solid (an
 * open shell among them), or one shown only in part, so the stencil count has no inside to find. The exact slicer
 * refuses the same sources, so the cut set is refused as a whole and the committed one stays.
 */
const findUncappableSource = (records: readonly SectionSourceRecord[]): SectionTopologyFailure | undefined => {
  for (const { key, visibleSource } of records) {
    const { topology } = visibleSource.source;
    if (topology.status === 'unsupported') {
      return topology.failure;
    }
    if (visibleSource.visibility === 'partial') {
      return {
        sourceKey: key,
        code: 'partial-visibility',
        message: `Section topology ${key}: visible selection opens a certified surface`,
      };
    }
  }
  return undefined;
};

/**
 * The section view's cut faces, drawn with stencil caps on both backends.
 *
 * The frame before the model's (priority -1) certifies the live cut list: every visible source must be a closed solid
 * for a cut list to commit, and nothing is sliced, built or triangulated for it. A refused list is reported once and
 * the committed one stays. The pass after the model's draws the committed list's caps, overlap and outline from the
 * sources' own meshes, so moving a cut costs the same at any triangle count.
 */
export function SectionContourFills({
  cutSet,
  enabled,
  innerRef,
  stripeFrequency,
  stripeWidth,
  snapshotRef,
  onCertify,
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
  const reportedFailureKeyRef = React.useRef<string | undefined>(undefined);
  const reportedCertificationRef = React.useRef<SectionCertification | undefined>(undefined);
  const diagnosticsRef = React.useRef<SectionCapStencilDiagnostics>({ sequence: 0, latest: undefined });
  const drawingBufferSize = React.useMemo(() => new THREE.Vector2(), []);

  React.useEffect(
    () => () => {
      caps.dispose();
    },
    [caps],
  );

  // A layout effect, so a cut step, restyle or emphasis change asks for its frame before the browser paints.
  React.useLayoutEffect(() => {
    if (enabled) {
      invalidate();
    }
  }, [cutSet, edgeColor, enabled, invalidate, modelInteractionUnitState, stripeFrequency, stripeWidth]);

  const reportFailure = (failure: SectionTopologyFailure, identity: string): void => {
    const key = `${identity}|${failure.sourceKey}|${failure.code}`;
    if (reportedFailureKeyRef.current === key) {
      return;
    }
    reportedFailureKeyRef.current = key;
    recordRendererSpan('renderer.section-cap-refused', {
      startTime: performance.now(),
      duration: 0,
      attributes: { sourceKey: failure.sourceKey, code: failure.code, backend },
    });
    toast.warning('Section view unavailable', { description: failure.message });
  };

  // Certification: before the model's pass, so the clip follows a commit within the same frame.
  useFrame(() => {
    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root) {
      return;
    }
    const store = snapshotRef.current;
    if (!enabled || !inner) {
      reportedFailureKeyRef.current = undefined;
      reportedCertificationRef.current = undefined;
      committedRecordsRef.current = [];
      resetSectionViewSafeSnapshot(store);
      root.userData[sectionViewSafeSnapshotDebugUserDataKey] = getSectionViewSafeSnapshotDebugState(store);
      return;
    }

    const readiness = { isBlocked: false };
    const visibleSources = collectSectionSurfaceSources(inner, (ready) => {
      readiness.isBlocked = true;
      // A standalone surface waits on its worker topology: draw again once it lands, as a registration does.
      if (ready && !awaitedTreesRef.current.has(ready)) {
        awaitedTreesRef.current.add(ready);
        // async-iife: bootstrap -- A frame cannot await a topology building in the worker.
        void (async () => {
          await ready.catch(() => undefined);
          awaitedTreesRef.current.delete(ready);
          invalidate();
        })();
      }
    });
    // Pending topology is not an empty model: keep the committed cuts and caps until its owner invalidates.
    if (readiness.isBlocked) {
      return;
    }
    // The caps follow posed parts by drawing their meshes where they are, so placement is not part of the identity.
    let sourceIdentity = '';
    for (const { source, visibility } of visibleSources) {
      sourceIdentity += `${source.key}|${source.revision}|${visibility};`;
    }
    const candidateIdentity = `${sectionPiecesKey(cutSet.pieces)}#${sourceIdentity}`;
    if ((store.rejection ? store.rejection.identity : store.committed?.identity) !== candidateIdentity) {
      const records = visibleSources.map((visibleSource) => toSourceRecord(visibleSource));
      const failure = cutSet.pieces.length > 0 ? findUncappableSource(records) : undefined;
      if (failure) {
        rejectSectionViewSafeSnapshot(store, { identity: candidateIdentity, sourceIdentity, failure });
        if (!store.committed) {
          committedRecordsRef.current = [];
        }
        reportFailure(failure, candidateIdentity);
        root.userData['sectionCapCompleteness'] = { status: 'unsupported', failure };
      } else {
        commitSectionViewSafeSnapshot(store, {
          identity: candidateIdentity,
          sourceIdentity,
          kind: cutSet.pieces.length > 0 ? 'complete' : 'uncut',
          cutSet,
        });
        committedRecordsRef.current = records;
        reportedFailureKeyRef.current = undefined;
        root.userData['sectionCapCompleteness'] = {
          status: 'complete',
          admittedSourceCount: records.length,
          unsupportedSourceCount: 0,
        };
      }
      root.userData[sectionViewSafeSnapshotDebugUserDataKey] = getSectionViewSafeSnapshotDebugState(store);
    }

    // Tells the stage what is committed, only when that changes; the clip follows it within this frame.
    const certification: SectionCertification = {
      status: store.rejection ? 'rejected' : 'certified',
      cuts: store.committed?.cutSet.cuts ?? noCuts,
    };
    const reported = reportedCertificationRef.current;
    if (reported?.status !== certification.status || reported.cuts !== certification.cuts) {
      reportedCertificationRef.current = certification;
      onCertify(certification);
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
    const sources: SectionStencilCapSource[] = records.map((record) => {
      const emphasis = resolveSectionSourceEmphasis(record, modelInteractionContext);
      return {
        key: record.key,
        ownerKey: record.ownerKey,
        meshes: record.meshes,
        tintHex: mixModelEmphasisTint(record.baseTintHex, emphasis),
        edgeHex: resolveSectionCapOutlineColor(emphasis, edgeColor),
      };
    });
    const { gl, camera } = state;
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
    if (isTauDebugEnabled) {
      const diagnostics = diagnosticsRef.current;
      diagnostics.sequence++;
      diagnostics.latest = stats;
      root.userData[sectionCapStencilDebugUserDataKey] = diagnostics;
    }
  }, sectionCapRenderPriority);

  // One object per instance: R3F replaces `userData` when the prop changes identity, which would wipe the diagnostics
  // the frames publish on it.
  const [rootUserData] = React.useState(() => sceneTagData(sceneTag.sectionViewHelper));

  return <group ref={rootRef} data-testid='tau-section-contour-fills-root' userData={rootUserData} />;
}
