import type { JSONValue, KernelIssueCode } from '@taucad/runtime/types';
import type { GeoSpecUnit } from '#geometry-unit.js';
import type { XdeReadResult } from '#step/types.js';

/**
 * Numeric 3D vector.
 *
 * @public
 */
export type Vec3 = readonly [number, number, number];

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
    tessellation?: {
      linearTolerance?: number;
      angularToleranceDegrees?: number;
    };
  };
  honored?: {
    format: GeometryFileFormat;
    coordinateSystem?: 'y-up' | 'z-up';
    unit?: {
      length?: 'meter' | 'millimeter';
    };
    tessellation?: {
      linearTolerance?: number;
      angularToleranceDegrees?: number;
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
  parameters?: Record<string, JSONValue>;
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

/** Diagnostic form permitted inside a wire-safe subject snapshot. @public */
export type GeometryEvidenceDiagnostic = Omit<GeometryDiagnostic, 'details'> & { details?: JSONValue };

/**
 * Mesh evidence loaded from geometry bytes or buffers.
 *
 * @public
 */
export type MeshEvidence = {
  format: MeshFileFormat;
  stats: GeometryStats;
};

/** Wire-safe mesh summary carried by an opaque geometry subject. @public */
export type GeometrySubjectMeshEvidence = {
  format: MeshFileFormat;
  stats: Pick<GeometryStats, 'vertexCount' | 'meshCount' | 'triangleCount'>;
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
  /** Opaque engine-owned identifier used by every protocol claim. */
  subjectId: string;
  mesh: GeometrySubjectMeshEvidence;
  brep?: BrepEvidence;
  step?: StepEvidence;
  provenance: GeometryProvenance;
  capabilities: GeometryCapability[];
  diagnostics: GeometryEvidenceDiagnostic[];
};

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
 * Scene bounding box with per-primitive contributors in the subject's unit and frame.
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
  watertight: boolean;
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
