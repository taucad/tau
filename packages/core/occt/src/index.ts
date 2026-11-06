// Module lifecycle
export { initOcct, resolveOcctModuleFactory } from '#oc-init.js';
export type { InitOcctOptions, OcctModuleFactory, OcctModuleOptions } from '#oc-init.js';

// Threading
export { activateOccParallelism, detectMultiThreadSupport } from '#oc-threading.js';
export type { MultiThreadSupport } from '#oc-threading.js';

// Schemas
export {
  occtExplicitTessellationSchema,
  occtQualityGltfExportSchema,
  occtQualityRenderOptionSchema,
  occtQualityStlExportSchema,
  occtTessellationQualities,
  occtTessellationSchema,
} from '#occt-schemas.js';
export type { OcctExplicitTessellation, OcctTessellation, OcctTessellationQuality } from '#occt-schemas.js';

// Tessellation resolution
export {
  occtExplicitTessellationDefaults,
  occtPresetLinearToleranceRange,
  occtTessellationPresets,
  resolveOcctTessellation,
} from '#occt-tessellation.js';
export type { OcctResolvedTessellation, OcctTessellationTolerances } from '#occt-tessellation.js';

// Handle scopes
export { createOcScope } from '#oc-scope.js';
export type { OcHandle, OcScope } from '#oc-scope.js';

// User-code entry
export { runOcMain } from '#oc-run-main.js';
export type { OcRunMainResult } from '#oc-run-main.js';

// Errors
export { formatOcRuntimeError } from '#oc-error-formatter.js';
export type { OcErrorContext } from '#oc-error-formatter.js';
export { OcKernelError } from '#oc-kernel-error.js';
export type { OcExceptionInstance } from '#oc-exceptions.js';

// Tracing and exception wrapping
export { wrapOcForExceptions, wrapOcWithTracing } from '#oc-tracing.js';
export type { OcTracingConfig, OcTracingResult, OcTracingSummary } from '#oc-tracing.js';
