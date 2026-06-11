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
 * Backend-neutral native STEP reader module consumed by {@link loadStep}.
 *
 * OpenCascade is the current implementation and provenance source, but callers
 * can use this option name without coupling tests to that backend identity.
 *
 * @public
 */
export type GeoSpecNativeStepBackend = GeoSpecOpenCascadeStepModule;

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
