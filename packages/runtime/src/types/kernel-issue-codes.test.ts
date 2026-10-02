import { expect, it } from 'vitest';
import { isKernelIssueCode, kernelIssueCodeValues } from '#types/kernel-issue-codes.js';

it('keeps the approved issue registry exact and validates only its members', () => {
  const expected = [
    'OPERATION_TIMEOUT',
    'KERNEL_BINDING_FAILED',
    'KERNEL_CAPABILITY_MISSING',
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
  ];
  expect(kernelIssueCodeValues).toEqual(expected);
  expect(new Set(kernelIssueCodeValues).size).toBe(expected.length);
  for (const code of expected) {
    expect(isKernelIssueCode(code)).toBe(true);
  }
  for (const code of [
    'RENDER_TIMEOUT',
    'RENDER_ABORTED',
    'NO_RENDER_GEOMETRY',
    'MIXED_RENDER_OUTPUT_UNSUPPORTED',
    'MULTI_RENDER_ARTIFACT_UNSUPPORTED',
    'RUNTIME_EXPORT_RENDER_IDENTITY_MISSING',
    'RUNTIME_EXPORT_NATIVE_HANDLE_MISSING',
    null,
  ]) {
    expect(isKernelIssueCode(code)).toBe(false);
  }
});
