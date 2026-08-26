/**
 * Engine-side STEP types: the substrate's data vocabulary re-exported verbatim
 * plus the embind binding surface the substrate deliberately does not own
 * (split-doc D-S5 — native handles never cross the seam).
 *
 * @module
 */

import type {
  LoadStepOptions as SubstrateLoadStepOptions,
  CreateStepLoaderOptions as SubstrateCreateStepLoaderOptions,
  StepLoadProgressEvent as SubstrateStepLoadProgressEvent,
  StepSource as SubstrateStepSource,
  StepStreamingMode as SubstrateStepStreamingMode,
  XdeDatumPlacement as SubstrateXdeDatumPlacement,
  XdeDatumSystem as SubstrateXdeDatumSystem,
  XdeOccurrence as SubstrateXdeOccurrence,
  XdeReadResult as SubstrateXdeReadResult,
  XdeSemanticDatum as SubstrateXdeSemanticDatum,
  XdeSubshapeName as SubstrateXdeSubshapeName,
  XdeSupplementalPlane as SubstrateXdeSupplementalPlane,
} from 'geospec/step';

/** Re-published substrate vocabulary: {@link SubstrateCreateStepLoaderOptions}. @public */
export type CreateStepLoaderOptions = SubstrateCreateStepLoaderOptions;
/** Re-published substrate vocabulary: {@link SubstrateStepLoadProgressEvent}. @public */
export type StepLoadProgressEvent = SubstrateStepLoadProgressEvent;
/** Re-published substrate vocabulary: {@link SubstrateStepSource}. @public */
export type StepSource = SubstrateStepSource;
/** Re-published substrate vocabulary: {@link SubstrateStepStreamingMode}. @public */
export type StepStreamingMode = SubstrateStepStreamingMode;
/** Re-published substrate vocabulary: {@link SubstrateXdeDatumPlacement}. @public */
export type XdeDatumPlacement = SubstrateXdeDatumPlacement;
/** Re-published substrate vocabulary: {@link SubstrateXdeDatumSystem}. @public */
export type XdeDatumSystem = SubstrateXdeDatumSystem;
/** Re-published substrate vocabulary: {@link SubstrateXdeOccurrence}. @public */
export type XdeOccurrence = SubstrateXdeOccurrence;
/** Re-published substrate vocabulary: {@link SubstrateXdeReadResult}. @public */
export type XdeReadResult = SubstrateXdeReadResult;
/** Re-published substrate vocabulary: {@link SubstrateXdeSemanticDatum}. @public */
export type XdeSemanticDatum = SubstrateXdeSemanticDatum;
/** Re-published substrate vocabulary: {@link SubstrateXdeSubshapeName}. @public */
export type XdeSubshapeName = SubstrateXdeSubshapeName;
/** Re-published substrate vocabulary: {@link SubstrateXdeSupplementalPlane}. @public */
export type XdeSupplementalPlane = SubstrateXdeSupplementalPlane;

/**
 * The 16-method embind surface of one retained AP242 read (the §18 coarse
 * claims-in / verdicts-out call shape). Every method answers JSON; geometry
 * bulk crosses through the shared heap, never JSON.
 *
 * @public
 */
export type GeoSpecNativeXdeReadResult = {
  isSuccess(): boolean;
  resultJson(): string;
  extrema(occurrenceA: number, faceA: number, occurrenceB: number, faceB: number): string;
  classifyPoints(occurrence: number, pointsJson: string): string;
  commonVolume(occurrenceA: number, occurrenceB: number): string;
  faceFacts(occurrence: number): string;
  analysisSummaryJson(): string;
  analysisMassPropertiesJson(): string;
  analysisFaceFeaturesJson(): string;
  analysisValidityJson(optionsJson: string): string;
  analysisWallThicknessJson(optionsJson: string): string;
  meshTriangles(optionsJson: string): string;
  meshTrianglePointer(): number;
  meshTriangleCount(): number;
  occurrenceMeshTriangles(occurrence: number, optionsJson: string): string;
  delete?(): void;
};

/**
 * The Emscripten module instance backing an AP242 read.
 *
 * @public
 */
export type GeoSpecOpenCascadeStepModule = {
  GeoSpecXdeReader?: {
    readText(data: string, optionsJson: string): GeoSpecNativeXdeReadResult;
    readFile(path: string, optionsJson: string): GeoSpecNativeXdeReadResult;
  };
  HEAPF64: Float64Array;
  FS?: {
    writeFile(path: string, data: string | ArrayBufferView, options?: { flags?: string }): void;
    unlink(path: string): void;
  };
  _malloc?(bytes: number): number;
  _free?(pointer: number): void;
};

/**
 * The backend `loadStep` reads through. Identical to the module today; kept
 * separate because a future out-of-process engine supplies the same methods
 * without being an Emscripten module (D-S0).
 *
 * @public
 */
export type GeoSpecNativeStepBackend = GeoSpecOpenCascadeStepModule;

/**
 * A factory producing the backend, so a caller can inject one instead of
 * paying for the process-wide singleton.
 *
 * @public
 */
export type GeoSpecNativeStepBackendFactory = () => Promise<GeoSpecNativeStepBackend>;

/**
 * Engine-side load options: the substrate contract plus the injectable native
 * backend (the substrate cannot declare a live handle — D-S5).
 *
 * @public
 */
export type LoadStepOptions = SubstrateLoadStepOptions & {
  nativeStepBackend?: GeoSpecNativeStepBackend;
  openCascade?: GeoSpecNativeStepBackend;
};
