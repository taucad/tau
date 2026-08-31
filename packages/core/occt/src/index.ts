// Module lifecycle
export { initOcct, resolveOcctModuleFactory } from '#oc-init.js';
export type { InitOcctOptions, OcctModuleFactory, OcctModuleOptions } from '#oc-init.js';

// Threading
export { activateOccParallelism } from '#oc-threading.js';

// Schemas
export { occtGltfExportSchema, occtRenderOptionSchema, occtStlExportSchema } from '#occt-schemas.js';

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
