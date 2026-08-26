/**
 * STEP/XDE/BRep loading, the lazy facet ledger, and the derived face features.
 *
 * @module
 */

export {
  createStepLoader,
  defaultMeshAngularToleranceDegrees,
  defaultMeshLinearTolerance,
  defaultWallWorkUnitBudget,
  loadStep,
  parseXdeReadResultJson,
} from '#step/load-step.js';
export type { GeoSpecStepLoader } from '#step/load-step.js';
export { createBrepEvidenceLedger, getBrepFacetDiagnostic } from '#step/evidence-ledger.js';
export type { BrepFacetName, BrepLedgerHandle, CreateBrepEvidenceLedgerOptions } from '#step/evidence-ledger.js';
export { deriveHolePatterns, deriveRevolvedChamfers, maxPartOccurrences, padSeparationGap } from '#step/features.js';
export type { FaceFact } from '#step/features.js';
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
