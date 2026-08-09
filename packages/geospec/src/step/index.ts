/**
 * STEP/XDE/BRep loading utilities.
 *
 * @module
 */

export { createStepLoader, loadStep, parseXdeReadResultJson } from '#step/load-step.js';
export type { GeoSpecStepLoader } from '#step/load-step.js';
export { createBrepEvidenceLedger, getBrepFacetDiagnostic } from '#step/evidence-ledger.js';
export type { BrepFacetName, CreateBrepEvidenceLedgerOptions } from '#step/evidence-ledger.js';
export type {
  CreateStepLoaderOptions,
  GeoSpecNativeStepBackend,
  GeoSpecNativeStepBackendFactory,
  GeoSpecNativeXdeReadResult,
  GeoSpecOpenCascadeStepModule,
  LoadStepOptions,
  StepLoadProgressEvent,
  StepSource,
  StepStreamingMode,
  XdeDatumPlacement,
  XdeDatumSystem,
  XdeOccurrence,
  XdeReadResult,
  XdeSemanticDatum,
  XdeSubshapeName,
  XdeSupplementalPlane,
} from '#step/types.js';
