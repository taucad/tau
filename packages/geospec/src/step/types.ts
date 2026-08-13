import type { GeoSpecUnit } from '#geometry-unit.js';

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
  /** Analytic axis-aligned bounds of the placed occurrence in subject space. */
  bounds?: { min: [number, number, number]; max: [number, number, number] };
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
