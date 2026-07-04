import type { GeoSpecUnit, GeometrySubject } from '#mesh/types.js';

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
 * Minimal native STEP reader result shape returned by GeoSpec OCCT builds.
 *
 * @public
 */
export type GeoSpecNativeStepReadResult = {
  success: boolean;
  evidenceJson(): string;
  meshTrianglePointer?(): number;
  meshTriangleCount?(): number;
  delete?(): void;
};

/**
 * Minimal OpenCascade.js module shape consumed by {@link loadStep}.
 *
 * @public
 */
export type GeoSpecOpenCascadeStepModule = {
  HEAPF64?: Float64Array<ArrayBuffer>;
  GeoSpecStepStreamReader?: {
    readText(data: string, optionsJson: string): GeoSpecNativeStepReadResult;
    readFile?(path: string, optionsJson: string): GeoSpecNativeStepReadResult;
  };
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
 * One stamped `geospec:facts` property row — aspect-attached (face/axis) or
 * product-attached (datum), expanded per occurrence like subshape names.
 * `payload` is opaque here; the selector layer parses it against the profile
 * schema.
 *
 * @public
 */
export type XdeProperty = {
  occurrencePath: string;
  name: string;
  payload: string;
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
  properties: XdeProperty[];
  /** Free (non-assembly) top-level shapes — the flat-export degenerate case. */
  freeShapeCount: number;
};

/**
 * Native handle over a parsed AP242 document that retains shapes so exact
 * BRep proof queries (extrema, classification, boolean common) can run
 * against resolved entities without a second parse. Face indices follow the
 * same deterministic traversal order as {@link XdeSubshapeName.faceIndex};
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
    readText(data: string): GeoSpecNativeXdeReadResult;
    readFile?(path: string): GeoSpecNativeXdeReadResult;
  };
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

/**
 * Function shape returned by {@link import('./load-step.js').createStepLoader}.
 *
 * @public
 */
export type GeoSpecStepLoader = (options: LoadStepOptions) => Promise<GeometrySubject>;
