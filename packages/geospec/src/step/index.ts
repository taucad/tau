/**
 * STEP/XDE/BRep loading utilities.
 *
 * @module
 */

export { createStepLoader, loadStep } from '#step/load-step.js';
export type {
  CreateStepLoaderOptions,
  GeoSpecNativeStepBackend,
  GeoSpecNativeStepBackendFactory,
  GeoSpecNativeStepReadResult,
  GeoSpecNativeXdeReadResult,
  GeoSpecOpenCascadeStepModule,
  GeoSpecStepLoader,
  LoadStepOptions,
  StepLoadProgressEvent,
  StepSource,
  StepStreamingMode,
  XdeDatumPlacement,
  XdeOccurrence,
  XdeReadResult,
  XdeSubshapeName,
} from '#step/types.js';
