/**
 * Canonical runtime issue-code registry.
 *
 * This file is the single source of truth for the public
 * {@link KernelIssueCode} discriminator. Keep codes provider-neutral; kernel
 * provenance belongs in `KernelIssue.details`.
 *
 * @public
 */
export const kernelIssueCodeValues = [
  'OPERATION_TIMEOUT',
  'KERNEL_BINDING_FAILED',
  'KERNEL_CAPABILITY_MISSING',
  'KERNEL_NOT_PREPARED',
  'LIBRARY_VERSION_MISMATCH',
  'KERNEL_REALM_CONFLICT',
  'TRANSCODER_CAPABILITY_MISSING',
  'TRANSCODER_OPTIONS_INVALID',
  'TRANSCODER_INITIALIZATION_FAILED',
  'TRANSCODER_EXECUTION_FAILED',
  'TRANSCODER_TIMEOUT',
  'BUNDLER_FAILED',
  'MIDDLEWARE_FAILED',
  'INVALID_SCHEMA',
  'INVALID_ANNOTATION',
  'INVALID_REFERENCE',
  'RESOURCE_LIMIT',
  'TESSELLATION_DOWNGRADED',
  'METADATA_CONFLICT',
  'SEMANTICS_UNRESOLVED',
  'REPRESENTATION_UNSUPPORTED',
  'LEGACY_PROJECTION_LOSS',
  'INVALID_RECORD',
  'RENDER_ARTIFACT_MISSING',
  'GLTF_BYTES_INVALID',
  'SVG_DOCUMENT_INVALID',
  'HANDLE_MISSING',
  'VIEW_UNKNOWN',
  'VIEW_UNAVAILABLE',
  'VIEW_OPTIONS_INVALID',
  'EXPORT_UNKNOWN',
  'EXPORT_AMBIGUOUS',
  'EXPORT_OPTIONS_INVALID',
  'EVALUATE_OPTIONS_INVALID',
  'EXPORT_ARTIFACT_SET_INVALID',
  'RUNTIME_CONTENT_UNSUPPORTED',
  'SOURCE_SNAPSHOT_CHANGED',
  'SOURCE_SNAPSHOT_INVALID',
  'GEOMETRY_INVALID',
  'AUTHENTICATION_ERROR',
  'RUNTIME',
  'UNKNOWN',
] as const;

/**
 * Public discriminator values for {@link import('./runtime.types.js').KernelIssue}.
 *
 * @public
 */
export type KernelIssueCode = (typeof kernelIssueCodeValues)[number];

const kernelIssueCodeSet: ReadonlySet<string> = new Set(kernelIssueCodeValues);

/**
 * Validate untrusted issue codes at runtime boundaries.
 *
 * @param code - Candidate issue-code value.
 * @returns `true` when the value is a known {@link KernelIssueCode}.
 * @public
 */
export const isKernelIssueCode = (code: unknown): code is KernelIssueCode =>
  typeof code === 'string' && kernelIssueCodeSet.has(code);

/**
 * Admit an untrusted issue code, mapping an unknown or missing one to `'UNKNOWN'`.
 *
 * @param code - Candidate issue-code value.
 * @returns The code when it is a known {@link KernelIssueCode}, otherwise `'UNKNOWN'`.
 * @internal
 */
export const toKernelIssueCode = (code: unknown): KernelIssueCode => (isKernelIssueCode(code) ? code : 'UNKNOWN');
