// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isZooEmptyExportError } from '#zoo-error-detection.js';

describe('isZooEmptyExportError — Zoo SDK boundary', () => {
  it('should detect the bare "Nothing to export" message form', () => {
    expect(isZooEmptyExportError(new Error('Nothing to export'))).toBe(true);
  });

  it('should detect the prefixed "internal_engine: Nothing to export" form', () => {
    expect(isZooEmptyExportError(new Error('internal_engine: Nothing to export'))).toBe(true);
  });

  it('should detect non-Error rejection payloads stringified as "Nothing to export"', () => {
    expect(isZooEmptyExportError('Nothing to export')).toBe(true);
  });

  it('should not match unrelated Zoo errors', () => {
    expect(isZooEmptyExportError(new Error('Export failed: invalid format'))).toBe(false);
    expect(isZooEmptyExportError(new Error('connection lost'))).toBe(false);
  });

  it('should not match empty/null inputs', () => {
    expect(isZooEmptyExportError(undefined)).toBe(false);
    expect(isZooEmptyExportError(null)).toBe(false);
    expect(isZooEmptyExportError('')).toBe(false);
  });
});
