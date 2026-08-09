import type { GeoSpecUnit } from '#config/define-geospec-config.js';

/**
 * STEP source forms accepted by {@link import('./load-step.js').loadStep}.
 *
 * @public
 */
export type StepSource =
  | string
  | URL
  | Uint8Array<ArrayBuffer>
  | ArrayBuffer
  | Blob
  | File
  | ReadableStream<Uint8Array<ArrayBuffer>>
  | AsyncIterable<Uint8Array<ArrayBuffer>>;

/**
 * STEP reader strategy used by GeoSpec.
 *
 * @public
 */
export type StepStreamingMode = 'auto' | 'native-stream' | 'filesystem';

/**
 * Progress event emitted while GeoSpec normalizes a STEP source.
 *
 * @public
 */
export type StepLoadProgressEvent = {
  phase: 'read-source' | 'parse-step' | 'mesh-brep';
  bytesRead?: number;
};

/**
 * Minimal OpenCascade.js module shape consumed by {@link loadStep}.
 *
 * @public
 */
export type GeoSpecOpenCascadeStepModule = {
  HEAPF64?: Float64Array<ArrayBuffer>;
  FS?: {
    writeFile(path: string, data: Uint8Array<ArrayBuffer>): void;
    unlink(path: string): void;
  };
};

/**
 * One placed occurrence recovered from an AP242 STEP structure read.
 *
 * `path` is dot-joined instance-name segments from the root (root omitted) per
 * the GeoSpec AP242 profile; repeated names under one parent are disambiguated
 * `name[k]` in the parent's stored component order.
 *
 * @public
 */
export type XdeOccurrence = {
  path: string;
  productName: string;
  instanceName?: string;
  /** 4x4 row-major placement transform (part-local frame -> subject frame). */
  transform: number[];
  /** Index into the native result's retained shape table (proof calls use it). */
  shapeIndex: number;
};

/**
 * One part-relative authored subshape name, expanded per occurrence of the
 * owning product (full selector name = `${occurrencePath}.${name}`).
 *
 * @public
 */
export type XdeSubshapeName = {
  occurrencePath: string;
  name: string;
  shapeType: 'face' | 'edge' | 'vertex' | 'solid';
  /** Index within the owning product shape's deterministic face traversal order. */
  faceIndex: number;
};

/**
 * One native AP242 datum placement row (a coordinate *frame* from the
 * supplemental-geometry channel), expanded per occurrence like subshape names
 * and expressed in subject-frame coordinates.
 *
 * Distinct from {@link XdeSemanticDatum}: this is supplemental geometry
 * (`AXIS2_PLACEMENT_3D` items in a CONSTRUCTIVE_GEOMETRY_REPRESENTATION), not
 * the GD&T `DATUM` family.
 *
 * @public
 */
export type XdeDatumPlacement = {
  occurrencePath: string;
  name: string;
  origin: [number, number, number];
  xAxis: [number, number, number];
  zAxis: [number, number, number];
};

/**
 * One semantic GD&T datum (`DATUM` + `DATUM_FEATURE` family) recovered from an
 * AP242 file, attached to product faces via GEOMETRIC_ITEM_SPECIFIC_USAGE and
 * expanded per occurrence of the owning product.
 *
 * @public
 */
export type XdeSemanticDatum = {
  occurrencePath: string;
  /** The GD&T datum identification letter(s): 'A', 'B', … */
  label: string;
  /** DATUM_FEATURE name when the file authored one. */
  featureName?: string;
  /** Attached faces in the owning product's deterministic face traversal order. */
  faceIndexes: number[];
};

/**
 * One GD&T datum reference frame (`DATUM_SYSTEM`) with its precedence
 * compartments, expanded per occurrence of the owning product.
 *
 * @public
 */
export type XdeDatumSystem = {
  occurrencePath: string;
  name: string;
  /** Compartments in precedence order; each holds one or more datum labels (common datums). */
  references: string[][];
};

/**
 * One supplemental-geometry `PLANE` item (e.g. `'Datum Plane 1'`), expanded per
 * occurrence and expressed in subject-frame millimetres (per-context units
 * resolved by the reader).
 *
 * @public
 */
export type XdeSupplementalPlane = {
  occurrencePath: string;
  name: string;
  origin: [number, number, number];
  normal: [number, number, number];
};

/**
 * Structured AP242 read result produced by the GeoSpec verification kernel's
 * XDE reader (SB1). One STEP-XDE read yields structure and geometry together.
 *
 * @public
 */
export type XdeReadResult = {
  occurrences: XdeOccurrence[];
  subshapeNames: XdeSubshapeName[];
  datumPlacements: XdeDatumPlacement[];
  /** Semantic GD&T datums (the `DATUM` family) — empty for graphical-only files. */
  semanticDatums: XdeSemanticDatum[];
  /** GD&T datum reference frames (`DATUM_SYSTEM`). */
  datumSystems: XdeDatumSystem[];
  /** Supplemental-geometry `PLANE` items. */
  supplementalPlanes: XdeSupplementalPlane[];
  /** Free (non-assembly) top-level shapes — the flat-export degenerate case. */
  freeShapeCount: number;
};

/**
 * Native handle over a parsed AP242 document that retains shapes so exact
 * BRep proof queries (extrema, classification, boolean common) and every
 * lazy analysis facet (lazy-evidence blueprint R3) run against resolved
 * entities without a second parse. Face indices follow the same
 * deterministic traversal order as {@link XdeSubshapeName.faceIndex};
 * pass `-1` to address the whole occurrence shape.
 *
 * @public
 */
export type GeoSpecNativeXdeReadResult = {
  isSuccess(): boolean;
  /** JSON-encoded {@link XdeReadResult} (plus `error` on failure). */
  resultJson(): string;
  /** JSON: `{ distance, pointA: [x,y,z], pointB: [x,y,z] }` in subject frame. */
  extrema(occurrenceA: number, faceA: number, occurrenceB: number, faceB: number): string;
  /** JSON: `{ states: ('in'|'out'|'on')[] }` for points against the occurrence solid. */
  classifyPoints(occurrence: number, pointsJson: string): string;
  /** JSON: `{ volume, centroid: [x,y,z] }` of the exact boolean common. */
  commonVolume(occurrenceA: number, occurrenceB: number): string;
  /** JSON: per-face analytic facts for the occurrence's product shape. */
  faceFacts(occurrence: number): string;
  /** Facet: `{ topologyCounts, boundingBox }` over the retained root shape. */
  analysisSummaryJson(): string;
  /** Facet: `{ massProperties: { surfaceArea, volume, centerOfMass } }`. */
  analysisMassPropertiesJson(): string;
  /** Facet: `{ validity }` — one BRepCheck analysis, per-solid queries (R5). */
  analysisValidityJson(optionsJson: string): string;
  /** Facet: planar/cylindrical faces, holes, patterns, chamfers, fillets. */
  analysisFaceFeaturesJson(): string;
  /**
   * Facet: `{ minimumWallThickness }`, `{}` when unsupported, or
   * `{ budgetExceeded: { workUnits, limit } }` when the R13 work-unit budget
   * (optionsJson `workUnitBudget`) is exhausted.
   */
  analysisWallThicknessJson(optionsJson: string): string;
  /** Facet: tessellates the root shape; `{ triangleCount }`. */
  meshTriangles(optionsJson: string): string;
  /**
   * Facet: tessellates ONE placed occurrence shape (subject frame) into the
   * retained triangle buffer; `{ triangleCount, deflection }` where
   * `deflection` is the achieved mesh deviation floored at the requested
   * linear tolerance. Clobbers the root `meshTriangles` buffer by design —
   * callers copy out immediately via the pointer accessors. Optional: absent
   * on pre-hybrid wasm builds and fake natives; consumers fall back to exact
   * classification.
   */
  occurrenceMeshTriangles?(occurrence: number, optionsJson: string): string;
  /**
   * Tessellate ONE face of a placed occurrence (`face` = the 0-based face
   * ordinal `faceFacts`/`extrema` use) into the retained soup — the exact
   * trimmed per-face footprint for the topological contact-patch engine (R1).
   * Same clobber/pointer transfer contract as `occurrenceMeshTriangles`.
   * Optional: absent on pre-facet wasm builds and fake natives; consumers fall
   * back to the winding/classify lattice.
   */
  occurrenceFaceMeshTriangles?(occurrence: number, face: number, optionsJson: string): string;
  /** Byte pointer into HEAPF64 for the retained triangle soup. */
  meshTrianglePointer(): number;
  meshTriangleCount(): number;
  /** Embind handle-liveness probe (ledger disposal guard, blueprint A12). */
  isDeleted?(): boolean;
  delete?(): void;
};

/**
 * Backend-neutral native STEP reader module consumed by {@link loadStep}.
 *
 * OpenCascade is the current implementation and provenance source, but callers
 * can use this option name without coupling tests to that backend identity.
 *
 * @public
 */
export type GeoSpecNativeStepBackend = GeoSpecOpenCascadeStepModule & {
  GeoSpecXdeReader?: {
    readText(data: string, optionsJson: string): GeoSpecNativeXdeReadResult;
    readFile?(path: string, optionsJson: string): GeoSpecNativeXdeReadResult;
  };
  /**
   * Embind class behind {@link GeoSpecNativeXdeReadResult}. Its prototype IS the
   * backend's method table, so the optional-facet probe (R8) reads it instead of
   * a handle: which facets a build exposes is a property of the wasm binary, not
   * of any one subject, so a warm subject answers it without parsing. Absent on
   * test fakes and hand-built backends, which are probed by materializing.
   */
  GeoSpecXdeReadResult?: { prototype?: Partial<GeoSpecNativeXdeReadResult> };
};

/**
 * Lazy native STEP backend factory.
 *
 * @public
 */
export type GeoSpecNativeStepBackendFactory = () => Promise<GeoSpecNativeStepBackend>;

/**
 * Options for loading STEP/XDE/BRep evidence.
 *
 * @public
 */
export type LoadStepOptions = {
  source: StepSource;
  unit?: GeoSpecUnit;
  streaming?: StepStreamingMode;
  mesh?: boolean;
  meshLinearTolerance?: number;
  meshAngularToleranceDegrees?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  nativeStepBackend?: GeoSpecNativeStepBackend | GeoSpecNativeStepBackendFactory;
  openCascade?: GeoSpecOpenCascadeStepModule | (() => Promise<GeoSpecOpenCascadeStepModule>);
  onProgress?: (event: StepLoadProgressEvent) => void;
  parameters?: Record<string, unknown>;
  path?: string;
  name?: string;
};

/**
 * Defaults accepted by {@link import('./load-step.js').createStepLoader}.
 *
 * @public
 */
export type CreateStepLoaderOptions = Omit<LoadStepOptions, 'source'>;
