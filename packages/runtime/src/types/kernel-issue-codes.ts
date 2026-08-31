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
  'RENDER_TIMEOUT',
  'RENDER_ABORTED',
  'KERNEL_BINDING_FAILED',
  'KERNEL_CAPABILITY_MISSING',
  'BUNDLER_FAILED',
  'MIDDLEWARE_FAILED',
  'NO_RENDER_GEOMETRY',
  'MIXED_RENDER_OUTPUT_UNSUPPORTED',
  'MULTI_RENDER_ARTIFACT_UNSUPPORTED',
  'GLTF_BYTES_INVALID',
  'SVG_DOCUMENT_INVALID',
  'RUNTIME_EXPORT_RENDER_IDENTITY_MISSING',
  'RUNTIME_EXPORT_NATIVE_HANDLE_MISSING',
  'EXPORT_ARTIFACT_SET_INVALID',
  'RUNTIME_CONTENT_UNSUPPORTED',
  'SOURCE_SNAPSHOT_CHANGED',
  'SOURCE_SNAPSHOT_INVALID',
  'GEOMETRY_INVALID',
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
