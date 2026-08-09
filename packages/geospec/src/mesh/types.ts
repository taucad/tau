import type { KernelIssueCode } from '@taucad/runtime/types';
import type { GeoSpecUnit as ConfigGeoSpecUnit } from '#config/define-geospec-config.js';
import type { GeoSpecNativeXdeReadResult, XdeReadResult } from '#step/types.js';

/**
 * Numeric 3D vector.
 *
 * @public
 */
export type Vec3 = readonly [number, number, number];

/**
 * Default geometry units used in GeoSpec provenance.
 *
 * @public
 */
export type GeoSpecUnit = ConfigGeoSpecUnit;

/**
 * Geometry file formats supported by the P0 mesh loader.
 *
 * @public
 */
export type MeshFileFormat = 'glb' | 'gltf' | 'mesh-buffer';

/**
 * Geometry file formats understood by GeoSpec provenance.
 *
 * @public
 */
export type GeometryFileFormat = MeshFileFormat | 'step' | 'stp';

/**
 * Source metadata for a loaded geometry subject.
 *
 * @public
 */
export type GeometrySource = {
  kind:
    | 'bytes'
    | 'array-buffer'
    | 'blob'
    | 'file'
    | 'path'
    | 'url'
    | 'mesh-buffer'
    | 'readable-stream'
    | 'async-iterable';
  format: GeometryFileFormat;
  path?: string;
  name?: string;
  byteLength?: number;
};

/**
 * Runtime export intent recorded when GeoSpec obtains evidence from a CAD
 * runtime instead of a direct geometry file.
 *
 * @public
 */
export type GeometryExportIntent = {
  requested: {
    format: GeometryFileFormat;
    coordinateSystem?: 'y-up' | 'z-up';
    unit?: {
      length?: 'meter' | 'millimeter';
    };
  };
  honored?: {
    format: GeometryFileFormat;
    coordinateSystem?: 'y-up' | 'z-up';
    unit?: {
      length?: 'meter' | 'millimeter';
    };
    sourceUnit?: GeoSpecUnit;
  };
  route?: {
    kernelId?: string;
    sourceFormat?: string;
    targetFormat?: string;
    transcoderId?: string;
    fidelity?: 'mesh' | 'brep' | (string & {});
    direct: boolean;
  };
};

/**
 * Provenance recorded by GeoSpec loaders. Tau runtime still emits geometry
 * bytes/files; GeoSpec records how those bytes were consumed.
 *
 * @public
 */
export type GeometryProvenance = {
  source: GeometrySource;
  unit: GeoSpecUnit;
  loader: 'gltf-transform' | 'in-memory' | 'opencascade-step';
  contentHash?: string;
  parameters?: Record<string, unknown>;
  exportIntent?: GeometryExportIntent;
};

/**
 * Capability exposed by a loaded subject.
 *
 * @public
 */
export type GeometryCapability =
  | {
      kind: 'mesh';
      feature:
        | 'triangles'
        | 'bounding-box'
        | 'connected-components'
        | 'watertightness'
        | 'surface-area'
        | 'volume'
        | 'center-of-mass'
        | 'distance'
        | 'component-overlap';
    }
  | {
      kind: 'brep';
      feature:
        | 'validity'
        | 'topology-counts'
        | 'bounding-box'
        | 'mass-properties'
        | 'planar-faces'
        | 'cylindrical-faces'
        | 'circular-holes'
        | 'circular-hole-patterns'
        | 'chamfer-features'
        | 'fillet-features'
        | 'wall-thickness';
    }
  | {
      kind: 'step';
      feature: 'schema' | 'units' | 'product-structure' | 'reader-provenance';
    }
  | { kind: 'unsupported'; feature: string; reason: string };

/**
 * Diagnostic emitted by GeoSpec loaders, analyzers, and matchers.
 *
 * @public
 */
export type GeometryDiagnostic = {
  code: KernelIssueCode | (string & {});
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  spatial?: {
    min?: Vec3;
    max?: Vec3;
    center?: Vec3;
  };
  details?: unknown;
};

/**
 * Mesh evidence loaded from geometry bytes or buffers.
 *
 * @public
 */
export type MeshEvidence = {
  format: MeshFileFormat;
  stats: GeometryStats;
};

/**
 * One triangle from mesh evidence, in geometry document coordinates.
 *
 * @public
 */
export type MeshTriangle = {
  primitive: string;
  triangleIndex: number;
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  center: [number, number, number];
  area: number;
};

/**
 * Directional surface-distance distribution.
 *
 * @public
 */
export type MeshDistanceDistribution = {
  min: number;
  mean: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  rms: number;
  samples: number;
};

/**
 * Result of comparing two mesh subjects using deterministic point-to-surface
 * samples.
 *
 * @public
 */
export type MeshDistanceStats = {
  min: number;
  mean: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  rms: number;
  samples: number;
  algorithm?: string;
  seed?: number;
  directedActualToExpected?: MeshDistanceDistribution;
  directedExpectedToActual?: MeshDistanceDistribution;
};

/**
 * Basic exact or topology-derived BRep evidence consumed by early feature
 * matchers. Loaders may provide any subset; matchers report unsupported
 * diagnostics when the required evidence is absent.
 *
 * @public
 */
export type BrepEvidence = {
  validity?: {
    valid: boolean;
    checks?: Array<{ shape: string; status: string }>;
    maxTolerance?: number;
    freeBounds?: { count: number };
    smallEdges?: Array<{ length: number; shape?: string; location?: Vec3 }>;
    sameParameter?: boolean;
    closedShells?: boolean;
    closedSolids?: boolean;
    solidCount?: number;
    invalidSolidCount?: number;
    openEdgeCount?: number;
    reason?: string;
    closedWires?: boolean;
  };
  topologyCounts?: {
    vertices?: number;
    edges?: number;
    wires?: number;
    faces?: number;
    shells?: number;
    solids?: number;
    compounds?: number;
  };
  boundingBox?: {
    min: Vec3;
    max: Vec3;
    size: Vec3;
    center: Vec3;
  };
  massProperties?: {
    surfaceArea?: number;
    volume?: number;
    centerOfMass?: Vec3;
    mass?: number;
  };
  planarFaces?: Array<{
    normal: Vec3;
    offset: number;
    area?: number;
    center?: Vec3;
  }>;
  cylindricalFaces?: Array<{
    radius: number;
    axis: 'x' | 'y' | 'z';
    center?: Vec3;
    axisRange?: { min: number; max: number };
  }>;
  circularHoles?: Array<{
    diameter: number;
    through: boolean;
    axis: 'x' | 'y' | 'z';
    center?: Vec3;
    axisRange?: { min: number; max: number };
  }>;
  circularHolePatterns?: Array<{
    count: number;
    holeDiameter: number;
    boltCircleDiameter: number;
    axis: 'x' | 'y' | 'z';
    center?: Vec3;
  }>;
  chamferFeatures?: Array<{
    distance: number;
    selection?: string;
  }>;
  filletFeatures?: Array<{
    radius: number;
    selection?: string;
  }>;
  minimumWallThickness?: {
    value: number;
    location?: Vec3;
    pointA?: Vec3;
    pointB?: Vec3;
    solidIndex?: number;
    tieCount?: number;
    algorithm?: string;
    tolerance?: number;
    supportA?: {
      faceIndex?: number;
      surfaceType?: string;
      supportType?: string;
    };
    supportB?: {
      faceIndex?: number;
      surfaceType?: string;
      supportType?: string;
    };
    rejections?: Record<string, number>;
  };
};

/**
 * STEP/XDE evidence extracted while loading a STEP subject.
 *
 * @public
 */
export type StepEvidence = {
  schema?: string;
  unit?: GeoSpecUnit;
  productStructure?: Array<{
    name: string;
    path: string;
    transform?: number[];
  }>;
  readStrategy: {
    strategy: 'native-stream' | 'filesystem';
    inputKind: GeometrySource['kind'];
    bytesRead: number;
    nativeReadStream: boolean;
    copiedToEmscriptenFs: boolean;
  };
  capabilities: Array<{ feature: string; supported: boolean; reason?: string }>;
  /** Structured AP242 XDE read result (occurrences, subshape names, datum placements). */
  xde?: XdeReadResult;
};

/**
 * Canonical P0 object under test for GeoSpec.
 *
 * This is intentionally a GeoSpec-loaded subject rather than a Tau runtime
 * contract. Runtime integrations pass GLB/glTF bytes or files into loaders.
 *
 * @public
 */
export type GeometrySubject = {
  kind: 'geometry-subject';
  mesh: MeshEvidence;
  brep?: BrepEvidence;
  step?: StepEvidence;
  provenance: GeometryProvenance;
  capabilities: GeometryCapability[];
  diagnostics: GeometryDiagnostic[];
  /**
   * Native XDE handle retaining parsed shapes for exact BRep proof calls
   * (extrema, classification, boolean common). Present only when the native
   * backend exposes `GeoSpecXdeReader`.
   *
   * @internal
   */
  nativeXde?: GeoSpecNativeXdeReadResult;
  /**
   * On-demand tessellation of one placed occurrence shape (subject frame),
   * for the hybrid void-occupancy engine (§17/§19: Manifold operates on the
   * AP242-read BRep's tessellation). The closure copies the soup out of the
   * wasm heap immediately, so callers own the returned buffer. Present only
   * for native-BRep subjects whose backend exposes `occurrenceMeshTriangles`.
   *
   * @internal
   */
  occurrenceMesh?: OccurrenceMeshFetcher;
  /**
   * On-demand tessellation of ONE face of a placed occurrence (subject frame),
   * for the topological contact-patch engine (spatial-relationship blueprint
   * R1: the exact trimmed per-face footprint replaces the sampling lattice).
   * Same transfer contract as {@link occurrenceMesh}. Present only for
   * native-BRep subjects whose backend exposes `occurrenceFaceMeshTriangles`.
   *
   * @internal
   */
  occurrenceFaceMesh?: OccurrenceFaceMeshFetcher;
};

/**
 * Fetch the triangle soup of one placed occurrence at a requested tessellation
 * density. `deflection` in the result is the achieved mesh-vs-BRep deviation
 * bound, floored at the requested linear deflection (the wall-mesh soundness
 * lesson) — consumers size exactness bands from it.
 *
 * The returned soup is IMMUTABLE by contract: fetches are memoized per
 * (occurrence, deflection) and persisted across runs (suite audit R4), so
 * every consumer of the same tessellation shares one buffer.
 *
 * @public
 */
export type OccurrenceMeshFetcher = (
  occurrence: number,
  options: { linearDeflection: number; angularDeflectionDegrees: number },
) => OccurrenceMeshResult;

/**
 * Fetch the triangle soup of ONE face of a placed occurrence at a requested
 * tessellation density — the exact trimmed per-face footprint the topological
 * contact-patch engine sums (spatial-relationship blueprint R1). `face` is the
 * same 0-based face ordinal `faceFacts`/`extrema` use. Same 9-doubles/triangle
 * soup layout and deflection contract as {@link OccurrenceMeshFetcher}.
 *
 * @public
 */
export type OccurrenceFaceMeshFetcher = (
  occurrence: number,
  face: number,
  options: { linearDeflection: number; angularDeflectionDegrees: number },
) => OccurrenceMeshResult;

/**
 * One occurrence tessellation: subject-frame triangle soup (9 doubles per
 * triangle, 3 vertices x 3 coords) plus the deflection bound, or a native
 * error.
 *
 * @public
 */
export type OccurrenceMeshResult = { triangles: Float64Array<ArrayBuffer>; deflection: number } | { error: string };

/**
 * Axis-aligned bounding box in glTF document units (meters).
 * @public
 */
export type AabbMeters = {
  min: [number, number, number];
  max: [number, number, number];
};

/**
 * One TRIANGLES primitive with identity for spatial-test feedback.
 * @public
 */
export type PrimitiveRecord = {
  /** The glTF node / mesh name (from kernel ShapeConfig.name when present). */
  name: string;
  color?: string;
  vertices: number;
  aabb: AabbMeters;
};

/**
 * One spatial cluster from AABB overlap grouping.
 * @public
 */
export type ClusterReport = {
  label: string;
  primitives: PrimitiveRecord[];
  aabb: AabbMeters;
  centroid: [number, number, number];
  totalVertices: number;
};

/**
 * Smallest clearance between two clusters along the dominant separation axis.
 * @public
 */
export type ClusterGap = {
  fromLabel: string;
  toLabel: string;
  axis: 'x' | 'y' | 'z';
  /** Millimetres — clearance between the two named primitives' AABBs. */
  gapMm: number;
  fromPrimitive: string;
  toPrimitive: string;
};

/**
 * Structured payload when `connectedComponents` fails.
 * @public
 */
export type ConnectedComponentsFailure = {
  expected: number;
  got: number;
  toleranceMm: number;
  clusters: ClusterReport[];
  gaps: ClusterGap[];
};

/**
 * Dominant primitive on an axis extremum for `boundingBox` failures.
 * @public
 */
export type BoundingBoxAxisExtremum = {
  name: string;
  aabb: AabbMeters;
  value: number;
};

/**
 * One axis failure for `boundingBox` checks.
 * @public
 */
export type BoundingBoxAxisFailure = {
  axis: 'x' | 'y' | 'z';
  field: 'size' | 'center';
  expected: number;
  actual: number;
  tolerance: number;
  minExtremum?: BoundingBoxAxisExtremum;
  maxExtremum?: BoundingBoxAxisExtremum;
};

/**
 * Structured payload when `boundingBox` fails.
 * @public
 */
export type BoundingBoxFailure = {
  axisFailures: BoundingBoxAxisFailure[];
};

/**
 * Per-primitive watertight diagnostic (local tessellation only).
 * @public
 */
export type WatertightPrimitiveBreakdown = {
  name: string;
  boundaryEdges: number;
  loopCentroid: [number, number, number];
};

/**
 * Class of irregular mesh edge found during watertight analysis.
 * @public
 */
export type WatertightIrregularEdgeKind = 'open-boundary' | 'non-manifold';

/**
 * Representative irregular edge, in glTF document coordinates.
 * @public
 */
export type WatertightIrregularEdgeSample = {
  start: Vec3;
  end: Vec3;
  center: Vec3;
  incidentTriangleCount: number;
  primitives: string[];
  color?: string;
};

/**
 * Spatial cluster of related irregular edges.
 * @public
 */
export type WatertightIrregularEdgeCluster = {
  kind: WatertightIrregularEdgeKind;
  edgeCount: number;
  aabb: {
    min: Vec3;
    max: Vec3;
    center: Vec3;
  };
  samples: WatertightIrregularEdgeSample[];
};

/**
 * Structured payload when `watertight` fails.
 * @public
 */
export type WatertightFailure = {
  /** Edges with incidence ≠ 2 (open or non-manifold). */
  irregularEdges: number;
  /** Edges shared by exactly one triangle (open boundary). */
  openBoundaryEdges: number;
  /** Edges shared by more than two triangles (over-adjacent/non-manifold). */
  nonManifoldEdges: number;
  irregularEdgeKindCounts: {
    openBoundary: number;
    nonManifold: number;
  };
  irregularEdgeClusters: WatertightIrregularEdgeCluster[];
  irregularEdgeFraction: number;
  perPrimitive: WatertightPrimitiveBreakdown[];
};

/**
 * Full connected-components analysis at one tolerance.
 * @public
 */
export type ConnectedComponentsResult = {
  count: number;
  clusters: ClusterReport[];
  gaps: ClusterGap[];
};

/**
 * Full watertight analysis (global + per-primitive breakdown).
 * @public
 */
export type WatertightResult = {
  watertight: boolean;
  irregularEdges: number;
  openBoundaryEdges: number;
  nonManifoldEdges: number;
  irregularEdgeKindCounts: {
    openBoundary: number;
    nonManifold: number;
  };
  irregularEdgeClusters: WatertightIrregularEdgeCluster[];
  totalEdges: number;
  irregularEdgeFraction: number;
  perPrimitive: WatertightPrimitiveBreakdown[];
};

/**
 * Triangle quality and scalar mesh metrics used by P0 GeoSpec matchers.
 *
 * Values are reported in the glTF document coordinate units.
 *
 * @public
 */
export type MeshQualityStats = {
  triangleCount: number;
  nonFiniteVertices: Array<{ primitive: string; vertexIndex: number; position: [number, number, number] }>;
  degenerateTriangles: Array<{
    primitive: string;
    triangleIndex: number;
    area: number;
    center: [number, number, number];
  }>;
  duplicateFaces: Array<{ primitive: string; triangleIndex: number; firstTriangleIndex: number }>;
  triangles: MeshTriangle[];
  surfaceArea: number;
  signedVolume: number;
  centerOfMass?: Vec3;
};

/**
 * Scene bounding box with per-primitive contributors (meters, glTF space).
 * @public
 */
export type BoundingBoxStats = {
  size: [number, number, number];
  center: [number, number, number];
  primitives: PrimitiveRecord[];
};

/**
 * Statistics about a parsed GLB geometry.
 *
 * `connectedComponents` is exposed as a tolerance-parameterised getter so
 * callers can probe spatial connectivity at multiple gap thresholds (mm)
 * without re-parsing the GLB. Implementations are expected to memoise per
 * `toleranceMm` value.
 *
 * `vertexCount` and `meshCount` are kept on the type for internal diagnostic
 * use (and for the kernel-author Vitest harness in
 * `kernel-geometry-testing.utils.ts`); they are no longer exposed via the
 * agent-facing requirement schema.
 *
 * @public
 */
export type GeometryStats = {
  vertexCount: number;
  meshCount: number;
  triangleCount: number;
  meshQuality: MeshQualityStats;
  /**
   * Returns the number of spatially-disjoint chunks. Each TRIANGLES primitive is
   * split into connected sub-meshes (welded vertex coincidence + triangle
   * adjacency), then sub-meshes are treated as connected when their AABBs
   * overlap within `toleranceMm` (millimetres). Tighten the tolerance to detect
   * visibly-disjoint clusters; loosen it to collapse intentional small gaps
   * between touching parts.
   */
  connectedComponents: (toleranceMm: number) => number;
  /**
   * Full cluster decomposition at `toleranceMm` (memoised per value).
   */
  analyseConnectedComponents: (toleranceMm: number) => ConnectedComponentsResult;
  watertight: boolean;
  analyseWatertight: () => WatertightResult;
  boundingBox?: BoundingBoxStats;
};

/**
 * Result of evaluating a single test requirement against geometry stats.
 * @public
 */
export type CheckResult =
  | { passed: true }
  | {
      passed: false;
      check: 'boundingBox';
      reason: string;
      suggestion: string;
      failure: BoundingBoxFailure;
    }
  | {
      passed: false;
      check: 'connectedComponents';
      reason: string;
      suggestion: string;
      failure: ConnectedComponentsFailure;
    }
  | {
      passed: false;
      check: 'watertight';
      reason: string;
      suggestion: string;
      failure: WatertightFailure;
    }
  | {
      passed: false;
      check: 'invalid';
      reason: string;
      suggestion: string;
    };
